import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import './App.css';
import {
  ImageItem,
  CropPreset,
  ProcessingSettings,
  ProgressEvent,
  BatchSummary,
  ThumbnailData,
  PreviewResult,
  ImageExportTask,
  ImportSummary,
} from './types';
import { formatFileSize, formatDimensions } from './utils';
import { Icons } from './components/Icons';
import { TitleBar } from './components/TitleBar';
import { Toolbar } from './components/Toolbar';
import { ImageList } from './components/ImageList';
import { SettingsPanel } from './components/SettingsPanel';
import { StatusBar } from './components/StatusBar';
import { ProgressModal } from './components/ProgressModal';
import { ImportModal } from './components/ImportModal';
import { SummaryModal } from './components/SummaryModal';
import { HelpModal } from './components/HelpModal';
import { UpdateBanner, UpdateStatus } from './components/UpdateBanner';
import { ShellProcessWindow } from './components/ShellProcessWindow';
import { checkForUpdates, downloadAndInstall, UpdateInfo } from './updater';

/** Convert a base64 data URL to a blob URL for lower memory usage */
function base64ToBlobUrl(dataUrl: string): string {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

const DEFAULT_SETTINGS: ProcessingSettings = {
  output_format: 'WebP',
  quality: 80,
  avif_speed: 6,
  png_compression: 9,
  resize_width: null,
  resize_height: null,
  maintain_aspect_ratio: true,
  crop_preset: null,
  strip_metadata: true,
  convert_to_srgb: true,
  crop_offset_x: 0,
  crop_offset_y: 0,
  crop_scale: 1,
  filename_pattern: '{name}',
};

function App() {
  // ─── Shell mode ─────────────────────────────────────────────────────────
  // When launched via right-click "Squeez this image", render the compact
  // processing window instead of the full app UI.
  // NOTE: hooks must all be declared before any conditional return, so the
  // actual branch lives just before the main render return below.
  const [shellPath, setShellPath] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    invoke<string | null>('get_shell_path').then(p => setShellPath(p ?? null));
  }, []);

  // ─── State ─────────────────────────────────────────────────────────────
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProcessingSettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('squeez_settings') || '{}');
      return { ...DEFAULT_SETTINGS, ...saved, crop_preset: null, crop_offset_x: 0, crop_offset_y: 0, crop_scale: 1 };
    } catch { return DEFAULT_SETTINGS; }
  });
  const [presets, setPresets] = useState<CropPreset[]>([]);
  const [customPresets, setCustomPresets] = useState<CropPreset[]>(() => {
    try { return JSON.parse(localStorage.getItem('customPresets') || '[]'); } catch { return []; }
  });
  const [defaultPresetName, setDefaultPresetName] = useState<string | null>(() => {
    return localStorage.getItem('defaultPresetName');
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewInfo, setPreviewInfo] = useState<PreviewResult | null>(null);
  const [estimatedSizeValue, setEstimatedSizeValue] = useState<number | null>(null);
  const [isEstimatingSize, setIsEstimatingSize] = useState(false);

  const [showCompare, setShowCompare] = useState(false);
  const [compressedPreviewUrl, setCompressedPreviewUrl] = useState<string | null>(null);
  const [isCompressingPreview, setIsCompressingPreview] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [hdPreview, setHdPreview] = useState(() => {
    return localStorage.getItem('squeez_hd_preview') === 'true';
  });

  const [isImporting, setIsImporting] = useState(false);
  const [importCount, setImportCount] = useState(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [outputDir, setOutputDir] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // ─── Auto-Update State ──────────────────────────────────────────────
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Global preview cache for instant switching (LRU, max 50 entries)
  const PREVIEW_CACHE_MAX = 50;
  const previewCacheRef = useRef<Record<string, PreviewResult>>({});
  const previewCacheOrderRef = useRef<string[]>([]);

  // Track blob URLs by image id for cleanup (revoke on remove/clear)
  const blobUrlsRef = useRef<Record<string, string>>({});

  const setCachedPreview = useCallback((key: string, value: PreviewResult) => {
    previewCacheRef.current[key] = value;
    const order = previewCacheOrderRef.current;
    const idx = order.indexOf(key);
    if (idx !== -1) order.splice(idx, 1);
    order.push(key);
    while (order.length > PREVIEW_CACHE_MAX) {
      const oldest = order.shift()!;
      delete previewCacheRef.current[oldest];
    }
  }, []);

  // Interactive crop preview state
  const [imgScale, setImgScale] = useState(1);
  const [imgX, setImgX] = useState(0);
  const [imgY, setImgY] = useState(0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [viewZoom, setViewZoom] = useState(1);
  const [isEditingCrop, setIsEditingCrop] = useState(false);
  const dragRef = useRef<{
    type: 'move' | 'resize' | 'pan';
    startX: number; startY: number;
    startImgX: number; startImgY: number;
    startScale: number; initDist: number;
  } | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Track synchronous state for rapid wheel zoom
  const viewStateRef = useRef({ zoom: viewZoom, panX, panY });
  useEffect(() => {
    viewStateRef.current = { zoom: viewZoom, panX, panY };
  }, [viewZoom, panX, panY]);

  // ─── Derived: stable reference to the selected image ─────────────────
  // Only changes when the selected image's identity or crop override changes,
  // NOT when unrelated images get thumbnails or are added/removed.
  const selectedImage = images.find(i => i.id === selectedId) ?? null;
  const selectedImagePath = selectedImage?.path ?? null;
  const selectedImageThumbnail = selectedImage?.thumbnailUrl;
  const selectedImageCropOverride = selectedImage?.cropOverride;

  // ─── Effects ───────────────────────────────────────────────────────────

  // Persist settings to localStorage (exclude per-image crop state)
  useEffect(() => {
    const { crop_preset, crop_offset_x, crop_offset_y, crop_scale, ...persistable } = settings;
    localStorage.setItem('squeez_settings', JSON.stringify(persistable));
  }, [settings]);

  // Persist HD preview toggle
  useEffect(() => {
    localStorage.setItem('squeez_hd_preview', String(hdPreview));
  }, [hdPreview]);

  // Load presets on mount
  useEffect(() => {
    invoke<CropPreset[]>('get_presets').then(setPresets).catch(console.error);
  }, []);

  // Check for updates on mount
  useEffect(() => {
    checkForUpdates().then(info => {
      if (info) {
        setUpdateInfo(info);
        setUpdateStatus('available');
      }
    });
  }, []);

  // Apply default preset on mount
  useEffect(() => {
    if (!defaultPresetName) return;
    const allPresets = [...presets, ...customPresets];
    const def = allPresets.find(p => p.name === defaultPresetName);
    if (def) setSettings(prev => ({ ...prev, crop_preset: def }));
  }, [presets, customPresets, defaultPresetName]);

  // Listen for processing progress events
  useEffect(() => {
    const unlisten = listen<ProgressEvent>('processing-progress', (event) => {
      setProgress(event.payload);
      if (event.payload.result) {
        const result = event.payload.result;
        setImages(prev => prev.map(img =>
          img.path === result.id
            ? {
              ...img,
              status: result.success ? 'Done' : 'Error',
              output_size: result.output_size,
              error: result.error,
            }
            : img
        ));
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Listen for import progress events (streamed per-image)
  // We collect images into a ref and batch-flush them into state periodically
  const importBufferRef = useRef<ImageItem[]>([]);
  const importFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unlisten = listen<ImageItem>('import-progress', (event) => {
      const img = event.payload;
      importBufferRef.current.push(img);
      setImportCount(prev => prev + 1);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Flush buffered import images into state every 100ms during import
  useEffect(() => {
    if (isImporting) {
      importFlushTimerRef.current = setInterval(() => {
        if (importBufferRef.current.length > 0) {
          const batch = importBufferRef.current.splice(0);
          setImages(prev => {
            const updated = [...prev, ...batch];
            if (prev.length === 0 && batch.length > 0) setSelectedId(batch[0].id);
            return updated;
          });
        }
      }, 100);
    }
    return () => {
      if (importFlushTimerRef.current) {
        clearInterval(importFlushTimerRef.current);
        importFlushTimerRef.current = null;
      }
    };
  }, [isImporting]);

  // Compute crop layout geometry
  const getCropLayout = useCallback(() => {
    if (!previewInfo || previewInfo.imageId !== selectedId || !previewContainerRef.current) return null;
    const container = previewContainerRef.current;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const pw = previewInfo.preview_width;
    const ph = previewInfo.preview_height;
    const ow = previewInfo.original_width;
    const oh = previewInfo.original_height;
    const imageAR = pw / ph;
    const cropAR = settings.crop_preset ? settings.crop_preset.width / settings.crop_preset.height : imageAR;

    const maxW = cw * 0.85;
    const maxH = ch * 0.85;
    let baseW: number, baseH: number;
    if (imageAR > maxW / maxH) { baseW = maxW; baseH = baseW / imageAR; }
    else { baseH = maxH; baseW = baseH * imageAR; }

    let cropW: number, cropH: number;
    if (imageAR > cropAR) { cropH = baseH; cropW = cropH * cropAR; }
    else { cropW = baseW; cropH = cropW / cropAR; }

    return { cw, ch, pw, ph, ow, oh, cropW, cropH, baseW, baseH };
  }, [settings.crop_preset, previewInfo, selectedId, images]);

  const latestCropRef = useRef({ x: 0, y: 0, scale: 1 });
  useEffect(() => {
    latestCropRef.current = { x: imgX, y: imgY, scale: imgScale };
  }, [imgX, imgY, imgScale]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (e.code === 'Space' && !isInput) {
        e.preventDefault();
        setIsSpaceDown(true);
      }
      if (e.ctrlKey && e.key.toLowerCase() === 't') {
        if (!settings.crop_preset || !previewUrl) return;
        e.preventDefault();
        setIsEditingCrop(prev => !prev);
      }
      // Arrow key navigation in image list
      if ((e.code === 'ArrowUp' || e.code === 'ArrowDown') && !isInput && images.length > 0) {
        e.preventDefault();
        setSelectedId(currentId => {
          const idx = images.findIndex(img => img.id === currentId);
          if (e.code === 'ArrowUp') {
            return idx > 0 ? images[idx - 1].id : images[images.length - 1].id;
          } else {
            return idx < images.length - 1 ? images[idx + 1].id : images[0].id;
          }
        });
      }
      // Delete selected image
      if ((e.code === 'Delete' || e.code === 'Backspace') && !isInput && selectedId) {
        e.preventDefault();
        if (blobUrlsRef.current[selectedId]) {
          URL.revokeObjectURL(blobUrlsRef.current[selectedId]);
          delete blobUrlsRef.current[selectedId];
        }
        setImages(prev => {
          const updated = prev.filter(img => img.id !== selectedId);
          setSelectedId(updated.length > 0 ? updated[0].id : null);
          return updated;
        });
      }
      // C — Toggle Compare
      if (e.key.toLowerCase() === 'c' && !isInput && !e.ctrlKey && !e.altKey && !e.metaKey && previewUrl) {
        e.preventDefault();
        setShowCompare(prev => !prev);
      }
      // F — Fit view
      if (e.key.toLowerCase() === 'f' && !isInput && !e.ctrlKey && !e.altKey && !e.metaKey && previewUrl) {
        e.preventDefault();
        setViewZoom(1);
        setPanX(0);
        setPanY(0);
      }
      // H — Toggle HD preview
      if (e.key.toLowerCase() === 'h' && !isInput && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setHdPreview(prev => !prev);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpaceDown(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [settings.crop_preset, previewUrl, images, selectedId]);

  const cropInitializedRef = useRef(false);
  useEffect(() => {
    cropInitializedRef.current = false;
  }, [selectedId, settings.crop_preset?.name]);

  useEffect(() => {
    if (cropInitializedRef.current || !selectedId || !previewContainerRef.current) return;
    const L = getCropLayout();
    if (!L) return;
    const img = images.find(i => i.id === selectedId);
    if (img?.cropOverride) {
      const scale = 1 / img.cropOverride.crop_scale;
      const x = -img.cropOverride.crop_offset_x * L.baseW * scale / L.ow;
      const y = -img.cropOverride.crop_offset_y * L.baseH * scale / L.oh;
      setImgScale(scale);
      setImgX(x);
      setImgY(y);
    } else {
      setImgScale(1);
      setImgX(0);
      setImgY(0);
    }
    setViewZoom(1);
    setPanX(0);
    setPanY(0);
    setIsEditingCrop(false);
    cropInitializedRef.current = true;
  }, [previewInfo, selectedId, images, getCropLayout]);

  // Load fast visual preview when selected image changes
  useEffect(() => {
    let isActive = true;
    if (!selectedId || !selectedImage) {
      setPreviewUrl(null);
      setPreviewInfo(null);
      setEstimatedSizeValue(null);
      return;
    }

    setCompressedPreviewUrl(null);

    if (previewCacheRef.current[selectedImage.path]) {
      setPreviewUrl(previewCacheRef.current[selectedImage.path].data_url);
      setPreviewInfo(previewCacheRef.current[selectedImage.path]);
      return;
    }

    if (selectedImageThumbnail) {
      setPreviewUrl(selectedImageThumbnail);
      setPreviewInfo({
        data_url: selectedImageThumbnail,
        imageId: selectedImage.id,
        preview_width: selectedImage.width,
        preview_height: selectedImage.height,
        original_width: selectedImage.width,
        original_height: selectedImage.height,
        original_size: selectedImage.original_size
      });
    } else {
      setPreviewUrl(null);
      setPreviewInfo(null);
    }

    const previewSettings = { ...settings, crop_preset: null, crop_offset_x: 0, crop_offset_y: 0, crop_scale: 1 };
    const maxPreviewSize = hdPreview ? 2400 : 1200;
    invoke<PreviewResult>('preview_image', { path: selectedImage.path, settings: previewSettings, maxPreviewSize })
      .then(result => {
        if (!isActive) return;
        result.imageId = selectedImage.id;
        setCachedPreview(selectedImage.path, result);
        setPreviewUrl(result.data_url);
        setPreviewInfo(result);
      })
      .catch(console.error);

    return () => { isActive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedImageThumbnail, hdPreview]);

  // Debounced file size estimation
  useEffect(() => {
    if (!selectedImagePath) return;
    setIsEstimatingSize(true);
    const timeoutId = setTimeout(() => {
      let estSettings = { ...settings };
      if (selectedImageCropOverride && settings.crop_preset) {
        estSettings.crop_offset_x = selectedImageCropOverride.crop_offset_x;
        estSettings.crop_offset_y = selectedImageCropOverride.crop_offset_y;
        estSettings.crop_scale = selectedImageCropOverride.crop_scale;
      }
      invoke<number>('estimate_size', { path: selectedImagePath, settings: estSettings })
        .then(size => setEstimatedSizeValue(size))
        .catch(console.error)
        .finally(() => setIsEstimatingSize(false));
    }, 300);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedImagePath, settings, selectedImageCropOverride]);

  // Auto-generate compressed preview whenever settings change (debounced)
  useEffect(() => {
    if (!selectedImagePath) {
      setCompressedPreviewUrl(null);
      return;
    }
    setIsCompressingPreview(true);
    const timeoutId = setTimeout(() => {
      let previewSettings = { ...settings };
      if (selectedImageCropOverride && settings.crop_preset) {
        previewSettings.crop_offset_x = selectedImageCropOverride.crop_offset_x;
        previewSettings.crop_offset_y = selectedImageCropOverride.crop_offset_y;
        previewSettings.crop_scale = selectedImageCropOverride.crop_scale;
      }
      const maxPreviewSize = hdPreview ? 2400 : 1200;
      invoke<string>('preview_compressed_image', { path: selectedImagePath, settings: previewSettings, maxPreviewSize })
        .then(resultBase64 => setCompressedPreviewUrl(resultBase64))
        .catch(console.error)
        .finally(() => setIsCompressingPreview(false));
    }, 500);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedImagePath, settings, selectedImageCropOverride, hdPreview]);

  // ─── Update Handlers ───────────────────────────────────────────────
  const handleInstallUpdate = useCallback(async () => {
    if (updateStatus === 'ready') {
      // Already downloaded — just relaunch
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
      return;
    }
    setUpdateStatus('downloading');
    setDownloadProgress(0);
    try {
      await downloadAndInstall((percent) => setDownloadProgress(percent));
      // relaunch is called inside downloadAndInstall, but if it didn't:
      setUpdateStatus('ready');
    } catch (e) {
      console.error('Update install failed:', e);
      setUpdateStatus('available');
    }
  }, [updateStatus]);

  const triggerUpdateBanner = useCallback((info: UpdateInfo) => {
    setUpdateInfo(info);
    setUpdateStatus('available');
  }, []);

  // ─── Handlers ──────────────────────────────────────────────────────────

  // ─── Thumbnail Queue ───────────────────────────────────────────────────
  // Sequential queue that processes one thumbnail at a time.
  // Selected image gets bumped to the front for instant feedback.
  const thumbQueueRef = useRef<{ id: string; path: string }[]>([]);
  const thumbProcessingRef = useRef(false);

  const processThumbQueue = useCallback(async () => {
    if (thumbProcessingRef.current) return;
    thumbProcessingRef.current = true;

    while (thumbQueueRef.current.length > 0) {
      const item = thumbQueueRef.current.shift()!;
      try {
        const thumb = await invoke<ThumbnailData>('get_thumbnail', { path: item.path });
        // Convert base64 data URL to blob URL for lower memory usage
        const blobUrl = base64ToBlobUrl(thumb.data_url);
        blobUrlsRef.current[item.id] = blobUrl;
        setImages(prev => prev.map(i =>
          i.id === item.id ? { ...i, thumbnailUrl: blobUrl } : i
        ));
      } catch {
        // Skip failed thumbnails silently
      }
    }

    thumbProcessingRef.current = false;
  }, []);

  const enqueueThumbnails = useCallback((newImages: ImageItem[]) => {
    // Add images that don't have thumbnails yet, avoiding duplicates
    const existingIds = new Set(thumbQueueRef.current.map(q => q.id));
    for (const img of newImages) {
      if (!img.thumbnailUrl && !existingIds.has(img.id)) {
        thumbQueueRef.current.push({ id: img.id, path: img.path });
      }
    }
    processThumbQueue();
  }, [processThumbQueue]);

  // When selected image changes, bump it to the front of the queue
  useEffect(() => {
    if (!selectedId) return;
    const idx = thumbQueueRef.current.findIndex(q => q.id === selectedId);
    if (idx > 0) {
      const [item] = thumbQueueRef.current.splice(idx, 1);
      thumbQueueRef.current.unshift(item);
    }
  }, [selectedId]);

  const handleAddImages = useCallback(async () => {
    try {
      const selected = await openDialog({
        multiple: true,
        filters: [{
          name: 'Images',
          extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp', 'avif'],
        }],
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected.map(f => String(f)) : [String(selected)];
        setIsImporting(true);
        setImportCount(0);
        importBufferRef.current = [];
        await invoke<ImportSummary>('import_images', { paths });
        // Flush any remaining buffered images
        if (importBufferRef.current.length > 0) {
          const remaining = importBufferRef.current.splice(0);
          setImages(prev => {
            const updated = [...prev, ...remaining];
            if (prev.length === 0 && remaining.length > 0) setSelectedId(remaining[0].id);
            return updated;
          });
        }
        setIsImporting(false);
        // Kick off thumbnail generation for all images currently loaded
        setImages(prev => {
          enqueueThumbnails(prev.filter(img => !img.thumbnailUrl));
          return prev;
        });
      }
    } catch (e) {
      console.error('Import failed:', e);
      setIsImporting(false);
    }
  }, [enqueueThumbnails]);

  const handleAddFolder = useCallback(async () => {
    try {
      const selected = await openDialog({ directory: true });
      if (selected) {
        const dirPath = String(selected);
        setIsImporting(true);
        setImportCount(0);
        importBufferRef.current = [];
        await invoke<ImportSummary>('import_images', { paths: [dirPath] });
        // Flush any remaining buffered images
        if (importBufferRef.current.length > 0) {
          const remaining = importBufferRef.current.splice(0);
          setImages(prev => {
            const updated = [...prev, ...remaining];
            if (prev.length === 0 && remaining.length > 0) setSelectedId(remaining[0].id);
            return updated;
          });
        }
        setIsImporting(false);
        setImages(prev => {
          enqueueThumbnails(prev.filter(img => !img.thumbnailUrl));
          return prev;
        });
      }
    } catch (e) {
      console.error('Folder import failed:', e);
      setIsImporting(false);
    }
  }, [enqueueThumbnails]);

  const doExport = useCallback(async (pathsToExport: string[]) => {
    if (pathsToExport.length === 0) return;
    try {
      const selected = await openDialog({ directory: true, title: 'Choose Output Folder' });
      if (!selected) return;
      const basePath = String(selected);
      const outDir = `${basePath}\\Optimized`;
      setOutputDir(outDir);
      setImages(prev => prev.map(img => ({ ...img, status: 'Pending' as const, output_size: null, error: null })));
      setIsProcessing(true);
      setProgress(null);

      const tasks: ImageExportTask[] = pathsToExport.map(path => {
        const img = images.find(i => i.path === path);
        let baseSettings = { ...settings };
        if (img?.cropOverride && settings.crop_preset) {
          baseSettings.crop_offset_x = img.cropOverride.crop_offset_x;
          baseSettings.crop_offset_y = img.cropOverride.crop_offset_y;
          baseSettings.crop_scale = img.cropOverride.crop_scale;
        } else {
          baseSettings.crop_offset_x = 0;
          baseSettings.crop_offset_y = 0;
          baseSettings.crop_scale = 1;
        }
        return { path, settings: baseSettings };
      });

      const result = await invoke<BatchSummary>('process_images', { tasks, outputDir: outDir });
      setIsProcessing(false);
      setSummary(result);
    } catch (e) {
      console.error('Export failed:', e);
      setIsProcessing(false);
    }
  }, [images, settings]);

  const handleExportAll = useCallback(() => doExport(images.map(img => img.path)), [images, doExport]);
  const handleExportSelected = useCallback(() => {
    const sel = images.find(img => img.id === selectedId);
    if (sel) doExport([sel.path]);
  }, [images, selectedId, doExport]);

  const handleClear = useCallback(() => {
    // Revoke all blob URLs to free memory
    Object.values(blobUrlsRef.current).forEach(url => URL.revokeObjectURL(url));
    blobUrlsRef.current = {};
    setImages([]);
    setSelectedId(null);
    setPreviewUrl(null);
    setPreviewInfo(null);
    setEstimatedSizeValue(null);
    setCompressedPreviewUrl(null);
    setShowCompare(false);
    previewCacheRef.current = {};
    previewCacheOrderRef.current = [];
  }, []);

  const handleRemoveImage = useCallback((id: string) => {
    // Revoke blob URL for the removed image
    if (blobUrlsRef.current[id]) {
      URL.revokeObjectURL(blobUrlsRef.current[id]);
      delete blobUrlsRef.current[id];
    }
    setImages(prev => {
      const updated = prev.filter(img => img.id !== id);
      if (selectedId === id) setSelectedId(updated.length > 0 ? updated[0].id : null);
      return updated;
    });
  }, [selectedId]);

  // Drag and drop via Tauri native event (browser DataTransfer doesn't expose paths in Tauri v2)
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);

  useEffect(() => {
    let isDropping = false;
    const unlisten = getCurrentWebview().onDragDropEvent(async (event) => {
      if (event.payload.type === 'enter') {
        setIsDragOver(true);
      } else if (event.payload.type === 'leave') {
        setIsDragOver(false);
      } else if (event.payload.type === 'drop') {
        setIsDragOver(false);
        const paths = event.payload.paths;
        if (paths.length === 0 || isDropping) return;
        isDropping = true;
        try {
          setIsImporting(true);
          setImportCount(0);
          importBufferRef.current = [];
          await invoke<ImportSummary>('import_images', { paths });
          if (importBufferRef.current.length > 0) {
            const remaining = importBufferRef.current.splice(0);
            setImages(prev => {
              const updated = [...prev, ...remaining];
              if (prev.length === 0 && remaining.length > 0) setSelectedId(remaining[0].id);
              return updated;
            });
          }
          setIsImporting(false);
          setImages(prev => {
            enqueueThumbnails(prev.filter(img => !img.thumbnailUrl));
            return prev;
          });
        } catch (err) {
          console.error('Drop import failed:', err);
          setIsImporting(false);
        } finally {
          isDropping = false;
        }
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, [enqueueThumbnails]);

  // Settings update helpers
  const updateSetting = <K extends keyof ProcessingSettings>(key: K, value: ProcessingSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const selectPreset = (preset: CropPreset | null) => {
    updateSetting('crop_preset', preset);
    if (selectedId) {
      setImages(prev => prev.map(img =>
        img.id === selectedId ? { ...img, cropOverride: undefined } : img
      ));
    }
  };

  const toggleDefault = (presetName: string) => {
    const newDefault = defaultPresetName === presetName ? null : presetName;
    setDefaultPresetName(newDefault);
    if (newDefault) localStorage.setItem('defaultPresetName', newDefault);
    else localStorage.removeItem('defaultPresetName');
  };

  const addCustomPreset = (name: string, w: number, h: number) => {
    const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
    const d = gcd(w, h);
    const preset: CropPreset = {
      name,
      platform: 'Custom',
      width: w,
      height: h,
      aspect_ratio: `${w / d}:${h / d}`,
    };
    const updated = [...customPresets, preset];
    setCustomPresets(updated);
    localStorage.setItem('customPresets', JSON.stringify(updated));
  };

  const removeCustomPreset = (name: string) => {
    const updated = customPresets.filter(p => p.name !== name);
    setCustomPresets(updated);
    localStorage.setItem('customPresets', JSON.stringify(updated));
    if (settings.crop_preset?.name === name) updateSetting('crop_preset', null);
    if (defaultPresetName === name) {
      setDefaultPresetName(null);
      localStorage.removeItem('defaultPresetName');
    }
  };

  // Handle wheel zoom (zoom to cursor)
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.93 : 1.07;

      const currZoom = viewStateRef.current.zoom;
      const currPanX = viewStateRef.current.panX;
      const currPanY = viewStateRef.current.panY;

      const newZoom = Math.max(0.3, currZoom * factor);

      if (newZoom !== currZoom) {
        const scaleChange = newZoom / currZoom;
        const rect = container.getBoundingClientRect();

        // Exact cursor offset relative to the center of the viewport
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;

        // The distance between the cursor and the current image pan center
        // needs to be scaled by the zoom ratio to keep the pixel underneath stationary.
        const newPanX = mouseX - (mouseX - currPanX) * scaleChange;
        const newPanY = mouseY - (mouseY - currPanY) * scaleChange;

        // Synchronously update the ref so fast scroll ticks stack perfectly
        viewStateRef.current = { zoom: newZoom, panX: newPanX, panY: newPanY };

        // Trigger React re-render
        setViewZoom(newZoom);
        setPanX(newPanX);
        setPanY(newPanY);
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [images.length]);

  // ─── Preview Panel Render Logic ────────────────────────────────────────

  const renderPreviewContent = () => {
    if (!previewUrl) {
      return <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>Select an image to preview</div>;
    }

    const L = getCropLayout();
    const hasCrop = !!settings.crop_preset && !!L;
    const vz = viewZoom;

    // Start drag (move or resize or pan)
    const startDrag = (e: React.MouseEvent, type: 'move' | 'resize' | 'pan') => {
      if (e.button !== 0 && e.button !== 1) return;
      e.preventDefault();
      if (!L) return;

      let activeType = type;
      if (e.button === 1 || (e.button === 0 && isSpaceDown)) activeType = 'pan';

      let hasMoved = false;
      const startClientX = e.clientX;
      const startClientY = e.clientY;

      const rect = previewContainerRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = L.cw / 2 + imgX * vz;
      const cy = L.ch / 2 + imgY * vz;
      const dx = mx - cx;
      const dy = my - cy;

      dragRef.current = {
        type: activeType, startX: e.clientX, startY: e.clientY,
        startImgX: imgX, startImgY: imgY,
        startScale: imgScale, initDist: Math.max(Math.sqrt(dx * dx + dy * dy), 1),
      };

      const onMove = (ev: MouseEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const moveDist = Math.sqrt(Math.pow(ev.clientX - startClientX, 2) + Math.pow(ev.clientY - startClientY, 2));
        if (moveDist > 3) { hasMoved = true; ev.stopPropagation(); }
        if (!hasMoved) return;

        if (d.type === 'pan') {
          setPanX(prev => prev + ev.movementX);
          setPanY(prev => prev + ev.movementY);
        } else if (d.type === 'move') {
          const nx = d.startImgX + (ev.clientX - d.startX) / vz;
          const ny = d.startImgY + (ev.clientY - d.startY) / vz;
          const maxX = (L.baseW * d.startScale - L.cropW) / 2;
          const maxY = (L.baseH * d.startScale - L.cropH) / 2;
          setImgX(Math.max(-maxX, Math.min(maxX, nx)));
          setImgY(Math.max(-maxY, Math.min(maxY, ny)));
        } else {
          const rect2 = previewContainerRef.current!.getBoundingClientRect();
          const mx2 = ev.clientX - rect2.left;
          const my2 = ev.clientY - rect2.top;
          const cx2 = L.cw / 2 + d.startImgX * vz;
          const cy2 = L.ch / 2 + d.startImgY * vz;
          const dist = Math.sqrt((mx2 - cx2) ** 2 + (my2 - cy2) ** 2);
          const ns = Math.max(1, Math.min(5, d.startScale * dist / d.initDist));
          setImgScale(ns);
          const maxX = (L.baseW * ns - L.cropW) / 2;
          const maxY = (L.baseH * ns - L.cropH) / 2;
          setImgX(Math.max(-maxX, Math.min(maxX, d.startImgX)));
          setImgY(Math.max(-maxY, Math.min(maxY, d.startImgY)));
        }
      };

      const onUp = (ev: MouseEvent) => {
        const d = dragRef.current;
        dragRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (!d || d.type === 'pan') {
          if (hasMoved) ev.stopPropagation();
          return;
        }
        if (!hasMoved && d.type === 'move') { setIsEditingCrop(prev => !prev); return; }
        if (hasMoved && d.type === 'move') { setIsEditingCrop(false); ev.stopPropagation(); }

        const cx = latestCropRef.current.x;
        const cy = latestCropRef.current.y;
        const cs = latestCropRef.current.scale;
        const displayToOrigX = L.ow / (L.baseW * cs);
        const displayToOrigY = L.oh / (L.baseH * cs);
        const crop_offset_x = -cx * displayToOrigX;
        const crop_offset_y = -cy * displayToOrigY;
        const crop_scale = 1 / cs;

        setImages(prev => prev.map(img =>
          img.id === selectedId
            ? { ...img, cropOverride: { crop_offset_x, crop_offset_y, crop_scale } }
            : img
        ));
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    // Image style
    const isPanningState = dragRef.current?.type === 'pan' || isSpaceDown;
    const imgStyle: React.CSSProperties = L ? {
      position: 'absolute',
      width: L.baseW * imgScale * vz,
      height: L.baseH * imgScale * vz,
      left: '50%',
      top: '50%',
      transform: `translate(calc(-50% + ${imgX * vz + panX}px), calc(-50% + ${imgY * vz + panY}px))`,
      maxWidth: 'none',
      maxHeight: 'none',
      cursor: isPanningState ? (dragRef.current ? 'grabbing' : 'grab') : 'crosshair',
      pointerEvents: 'auto',
    } : {};

    return (
      <>
        {/* Top-Left Controls */}
        {L && (
          <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 30 }}>
            <div className="info-tooltip" style={{ display: 'inline-flex', alignItems: 'center' }}>
              <button
                onClick={() => setHdPreview(prev => !prev)}
                title="Toggle HD Preview"
                className={`panel-btn ${hdPreview ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: hdPreview ? 'var(--brand-primary)' : 'var(--bg-lighter)',
                  color: hdPreview ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid',
                  borderColor: hdPreview ? 'var(--brand-primary)' : 'var(--border)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}
              >
                HD
                <Icons.Info />
              </button>
              <div
                className="tooltip-content"
                style={{
                  top: '100%',
                  bottom: 'auto',
                  marginTop: '12px',
                  left: '0',
                  right: 'auto',
                  transform: 'none',
                  minWidth: '280px'
                }}
              >
                Toggle higher resolution preview (2400px instead of 1200px).<br />
                <strong>Keep off if the app feels slow on large images.</strong>
              </div>
            </div>
          </div>
        )}

        <img
          key={selectedId}
          src={compressedPreviewUrl || previewUrl}
          alt="Preview"
          className={`preview-image fade-in-image ${L ? 'interactive' : ''}`}
          style={imgStyle}
          draggable={false}
          onMouseDown={L ? (e) => startDrag(e, 'move') : undefined}
          onDoubleClick={() => { if (hasCrop) setIsEditingCrop(true); }}
        />

        {/* Loading indicator while compressing */}
        {isCompressingPreview && (
          <div style={{
            position: 'absolute', top: '12px', right: '12px',
            backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
            padding: '4px 10px', borderRadius: '6px', fontSize: '11px',
            zIndex: 20, userSelect: 'none', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}>
            <span className="spinner" style={{ width: 10, height: 10, borderWidth: 2, display: 'inline-block' }} />
            Updating preview...
          </div>
        )}

        {/* Original image overlay for Compare mode */}
        {showCompare && previewUrl && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 5,
              pointerEvents: 'none',
              clipPath: `inset(0 0 0 ${sliderPosition}%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <img
              key={`compare-${selectedId}`}
              alt="Original Preview"
              src={previewUrl}
              className={`preview-image fade-in-image ${L ? 'interactive' : ''}`}
              style={imgStyle}
              draggable={false}
            />
          </div>
        )}

        {/* Split View Handle */}
        {showCompare && compressedPreviewUrl && (
          <div
            style={{
              position: 'absolute',
              left: `${sliderPosition}%`,
              top: 0, bottom: 0,
              width: '4px', marginLeft: '-2px',
              backgroundColor: 'var(--accent-primary)',
              zIndex: 10, cursor: 'ew-resize',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'auto',
              boxShadow: '0 0 10px rgba(0,0,0,0.5)'
            }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingSlider(true); }}
          >
            <div style={{
              width: '24px', height: '40px',
              backgroundColor: 'var(--bg-elevated)',
              border: '2px solid var(--accent-primary)',
              borderRadius: '4px',
              display: 'flex', gap: '2px', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--shadow-md)'
            }}>
              <div style={{ width: '2px', height: '16px', backgroundColor: 'var(--text-secondary)' }} />
              <div style={{ width: '2px', height: '16px', backgroundColor: 'var(--text-secondary)' }} />
            </div>
          </div>
        )}

        {/* Before / After Labels */}
        {showCompare && compressedPreviewUrl && (
          <>
            <div style={{
              position: 'absolute', bottom: '24px', left: '24px',
              backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
              padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
              pointerEvents: 'none', zIndex: 20, userSelect: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)'
            }}>
              After ({settings.output_format})
            </div>
            <div style={{
              position: 'absolute', bottom: '24px', right: '24px',
              backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
              padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
              pointerEvents: 'none', zIndex: 20, userSelect: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)'
            }}>
              Before (Original)
            </div>
          </>
        )}

        {/* Slider drag overlay */}
        {isDraggingSlider && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'ew-resize' }}
            onMouseUp={() => setIsDraggingSlider(false)}
            onMouseMove={(e) => {
              if (!previewContainerRef.current) return;
              const rect = previewContainerRef.current.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
              setSliderPosition(pct);
            }}
          />
        )}

        {/* Crop overlay */}
        {hasCrop && (
          <div
            className="crop-overlay-window"
            style={{
              width: L!.cropW * vz, height: L!.cropH * vz,
              zIndex: 15, position: 'absolute', left: '50%', top: '50%',
              transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px))`
            }}
          />
        )}

        {/* Resize handles */}
        {hasCrop && isEditingCrop && (() => {
          const imgW = L!.baseW * imgScale * vz;
          const imgH = L!.baseH * imgScale * vz;
          const cx = L!.cw / 2 + imgX * vz + panX;
          const cy = L!.ch / 2 + imgY * vz + panY;
          const corners = [
            { left: cx - imgW / 2, top: cy - imgH / 2, cursor: 'nwse-resize' },
            { left: cx + imgW / 2, top: cy - imgH / 2, cursor: 'nesw-resize' },
            { left: cx - imgW / 2, top: cy + imgH / 2, cursor: 'nesw-resize' },
            { left: cx + imgW / 2, top: cy + imgH / 2, cursor: 'nwse-resize' },
          ];
          return corners.map((c, i) => (
            <div
              key={i}
              className="resize-handle"
              style={{ left: c.left, top: c.top, cursor: c.cursor }}
              onMouseDown={(e) => startDrag(e, 'resize')}
            />
          ));
        })()}

        {/* Viewport controls */}
        {L && (
          <div className="viewport-controls">
            <button onClick={() => setShowCompare(prev => !prev)} title="Compare with Original" className={showCompare ? 'active' : ''}>
              <Icons.Compare /> Compare
            </button>
            <div style={{ width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
            <div style={{ width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />
            <button onClick={() => { setViewZoom(1); setPanX(0); setPanY(0); }} title="Fit view">Fit</button>
            <button onClick={() => setViewZoom(v => v * 1.25)} title="Zoom in">+</button>
            <button onClick={() => setViewZoom(v => Math.max(0.3, v * 0.8))} title="Zoom out">−</button>
            <span className="vz-label">{Math.round(vz * 100)}%</span>
          </div>
        )}
      </>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────
  // Shell-mode branch — all hooks above have already been called so this is safe.
  if (shellPath === undefined) return null;
  if (shellPath !== null) return <ShellProcessWindow path={shellPath} />;

  return (
    <div className="app" onDragOver={handleDragOver}>
      <TitleBar />

      {updateStatus !== 'idle' && updateInfo && (
        <UpdateBanner
          updateVersion={updateInfo.version}
          status={updateStatus}
          downloadProgress={downloadProgress}
          onInstall={handleInstallUpdate}
          onDismiss={() => setUpdateStatus('idle')}
        />
      )}

      <Toolbar
        imageCount={images.length}
        selectedId={selectedId}
        isProcessing={isProcessing}
        onAddImages={handleAddImages}
        onAddFolder={handleAddFolder}
        onClear={handleClear}
        onExportSelected={handleExportSelected}
        onExportAll={handleExportAll}
        onHelp={() => setShowHelp(true)}
      />

      {/* Main Content */}
      <div className="main-content">
        <ImageList
          images={images}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRemove={handleRemoveImage}
        />

        {/* Center Panel — Preview / Drop Zone */}
        <div className="panel-center">
          {images.length === 0 ? (
            <div className={`drop-zone ${isDragOver ? 'active' : ''}`} onClick={handleAddImages}>
              <div className="drop-zone-icon"><Icons.Image /></div>
              <div className="drop-zone-text">Drop images here or click to browse</div>
              <div className="drop-zone-hint">Supports JPEG, PNG, WebP, AVIF, GIF, BMP, TIFF</div>
            </div>
          ) : (
            <div
              className={`preview-area ${isSpaceDown ? 'panning' : ''}`}
              ref={previewContainerRef}
              onClick={(e) => {
                if (!previewUrl) return;
                if ((e.target as HTMLElement).classList.contains('resize-handle')) return;
                if ((e.target as HTMLElement).closest('.viewport-controls')) return;
                setIsEditingCrop(false);
              }}
              onMouseDown={(e) => {
                if (!previewUrl) return;
                if (e.target !== previewContainerRef.current) return;
                if (e.button !== 0 && e.button !== 1) return;
                e.preventDefault();
                const onMove = (ev: MouseEvent) => {
                  setPanX(prev => prev + ev.movementX);
                  setPanY(prev => prev + ev.movementY);
                };
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
              }}
            >
              {renderPreviewContent()}
            </div>
          )}

          {/* Preview info bar */}
          {previewInfo && selectedId && (
            <div className="status-bar" style={{ justifyContent: 'center', gap: '24px' }}>
              <div className="stat">
                Original: <span className="stat-value">{formatDimensions(previewInfo.original_width, previewInfo.original_height)}</span>
              </div>
              <div className="stat">
                Size: <span className="stat-value">{formatFileSize(previewInfo.original_size)}</span>
              </div>
              {settings.crop_preset && (
                <div className="stat">
                  Crop: <span className="stat-value">{settings.crop_preset.aspect_ratio} ({settings.crop_preset.width}×{settings.crop_preset.height})</span>
                </div>
              )}
            </div>
          )}
        </div>

        <SettingsPanel
          settings={settings}
          onUpdateSetting={updateSetting}
          presets={presets}
          customPresets={customPresets}
          defaultPresetName={defaultPresetName}

          onSelectPreset={selectPreset}
          onToggleDefault={toggleDefault}
          onAddCustomPreset={addCustomPreset}
          onRemoveCustomPreset={removeCustomPreset}
        />
      </div>

      <StatusBar
        images={images}
        selectedId={selectedId}
        settings={settings}
        isEstimatingSize={isEstimatingSize}
        estimatedSizeValue={estimatedSizeValue}
      />

      {isImporting && importCount >= 20 && <ImportModal count={importCount} onCancel={() => {
        invoke('cancel_import').catch(console.error);
        setIsImporting(false);
        // Flush remaining buffered images
        if (importBufferRef.current.length > 0) {
          const remaining = importBufferRef.current.splice(0);
          setImages(prev => {
            const updated = [...prev, ...remaining];
            if (prev.length === 0 && remaining.length > 0) setSelectedId(remaining[0].id);
            return updated;
          });
        }
        setImages(prev => {
          enqueueThumbnails(prev.filter(img => !img.thumbnailUrl));
          return prev;
        });
      }} />}
      {isProcessing && progress && <ProgressModal progress={progress} onCancel={() => {
        invoke('cancel_processing').catch(console.error);
      }} />}
      {summary && <SummaryModal summary={summary} outputDir={outputDir} onClose={() => setSummary(null)} />}
      {showHelp && (
        <HelpModal
          onClose={() => setShowHelp(false)}
          onUpdateAvailable={(info) => {
            setShowHelp(false);
            triggerUpdateBanner(info);
          }}
        />
      )}
    </div>
  );
}

export default App;
