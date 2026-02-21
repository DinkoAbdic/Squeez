use image::DynamicImage;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use rayon::prelude::*;
use tauri::{Emitter, Window};

use crate::engine;
use crate::presets;
use crate::types::*;

/// Shared cancellation flag for import scanning
pub struct ImportCancelFlag(pub Arc<AtomicBool>);

impl Default for ImportCancelFlag {
    fn default() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }
}

/// Cancel the current import scan
#[tauri::command]
pub fn cancel_import(cancel_flag: tauri::State<ImportCancelFlag>) {
    cancel_flag.0.store(true, Ordering::Relaxed);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSummary {
    pub total: u32,
}

/// Scan image files from provided paths (files or directories).
/// Streams each discovered image via "import-progress" events.
#[tauri::command]
pub async fn import_images(
    window: Window,
    paths: Vec<String>,
    cancel_flag: tauri::State<'_, ImportCancelFlag>,
) -> Result<ImportSummary, String> {
    // Reset cancel flag at start
    cancel_flag.0.store(false, Ordering::Relaxed);
    let cancel = cancel_flag.0.clone();

    let total = tokio::task::spawn_blocking(move || {
        let supported_extensions = ["jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "avif"];
        let mut count = 0u32;

        for path in paths {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            let p = Path::new(&path);
            if p.is_dir() {
                scan_directory_recursive_streaming(p, &supported_extensions, &window, &cancel, &mut count);
            } else if p.is_file() {
                if let Some(item) = try_create_image_item(p, &supported_extensions) {
                    let _ = window.emit("import-progress", &item);
                    count += 1;
                }
            }
        }

        count
    })
    .await
    .map_err(|e| format!("Import task failed: {}", e))?;

    Ok(ImportSummary { total })
}

fn scan_directory_recursive_streaming(
    dir: &Path,
    supported_extensions: &[&str],
    window: &Window,
    cancel: &Arc<AtomicBool>,
    count: &mut u32,
) {
    if cancel.load(Ordering::Relaxed) {
        return;
    }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if cancel.load(Ordering::Relaxed) {
                return;
            }
            let entry_path = entry.path();
            if entry_path.is_dir() {
                scan_directory_recursive_streaming(&entry_path, supported_extensions, window, cancel, count);
            } else if entry_path.is_file() {
                if let Some(item) = try_create_image_item(&entry_path, supported_extensions) {
                    let _ = window.emit("import-progress", &item);
                    *count += 1;
                }
            }
        }
    }
}

fn try_create_image_item(path: &Path, supported_extensions: &[&str]) -> Option<ImageItem> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    if !supported_extensions.contains(&ext.as_str()) {
        return None;
    }

    let filename = path.file_name()?.to_str()?.to_string();
    let path_str = path.to_string_lossy().to_string();

    // get_image_info now uses fast dimension reading (no full decode)
    match engine::get_image_info(&path_str) {
        Ok((width, height, original_size)) => Some(ImageItem {
            id: uuid::Uuid::new_v4().to_string(),
            path: path_str,
            filename,
            original_size,
            width,
            height,
            status: ImageStatus::Pending,
            output_size: None,
            error: None,
        }),
        Err(_) => None,
    }
}

/// Generate a thumbnail for an image (returns base64 data URL)
/// Runs on a blocking thread to keep the UI responsive.
#[tauri::command]
pub async fn get_thumbnail(path: String) -> Result<ThumbnailData, String> {
    let result = tokio::task::spawn_blocking(move || {
        let thumb_result = engine::generate_thumbnail(&path, 200)
            .map_err(|e| format!("Failed to generate thumbnail: {}", e))?;
        let (data_url, width, height) = thumb_result;
        Ok::<ThumbnailData, String>(ThumbnailData {
            id: path,
            data_url,
            width,
            height,
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    Ok(result)
}

/// Get all social media crop presets
#[tauri::command]
pub fn get_presets() -> Vec<CropPreset> {
    presets::get_all_presets()
}

/// Progress event sent to the frontend during batch processing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub current: u32,
    pub total: u32,
    pub current_file: String,
    pub result: Option<ProcessResult>,
}

/// Shared cancellation flag for batch processing
pub struct CancelFlag(pub Arc<AtomicBool>);

impl Default for CancelFlag {
    fn default() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }
}

/// Cancel the current batch processing
#[tauri::command]
pub fn cancel_processing(cancel_flag: tauri::State<CancelFlag>) {
    cancel_flag.0.store(true, Ordering::Relaxed);
}

/// Process a batch of images with progress events
#[tauri::command]
pub async fn process_images(
    window: Window,
    tasks: Vec<crate::types::ImageExportTask>,
    output_dir: String,
    cancel_flag: tauri::State<'_, CancelFlag>,
) -> Result<BatchSummary, String> {
    let total = tasks.len() as u32;
    let mut successful = 0u32;
    let mut failed = 0u32;
    let mut total_original_size = 0u64;
    let mut total_output_size = 0u64;

    // Ensure output directory exists
    fs::create_dir_all(&output_dir).map_err(|e| format!("Failed to create output dir: {}", e))?;

    // Reset cancel flag at start of new batch
    cancel_flag.0.store(false, Ordering::Relaxed);
    let cancel = cancel_flag.0.clone();

    // Process images in parallel using rayon for maximum throughput
    let results = tokio::task::spawn_blocking(move || {
        let counter = Arc::new(AtomicU32::new(0));
        let claimed_names = std::sync::Mutex::new(std::collections::HashSet::new());

        let results: Vec<_> = tasks.par_iter().map(|task| {
            let path = &task.path;
            let settings = &task.settings;

            // Get original file size
            let orig_size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);

            // Check cancellation before processing
            if cancel.load(Ordering::Relaxed) {
                let current = counter.fetch_add(1, Ordering::Relaxed) + 1;
                let result = ProcessResult {
                    id: path.clone(),
                    success: false,
                    output_path: None,
                    output_size: None,
                    error: Some("Cancelled".to_string()),
                };
                let _ = window.emit("processing-progress", ProgressEvent {
                    current,
                    total,
                    current_file: path.clone(),
                    result: Some(result.clone()),
                });
                return (orig_size, result);
            }

            // Process the image (with thread-safe filename collision prevention)
            let result = engine::process_image(path, &output_dir, settings, &claimed_names);

            // Increment and emit progress (atomic, thread-safe)
            let current = counter.fetch_add(1, Ordering::Relaxed) + 1;
            let _ = window.emit("processing-progress", ProgressEvent {
                current,
                total,
                current_file: path.clone(),
                result: Some(result.clone()),
            });

            (orig_size, result)
        }).collect();

        results
    })
    .await
    .map_err(|e| format!("Processing task failed: {}", e))?;

    // Calculate summary
    for (orig_size, result) in &results {
        total_original_size += orig_size;
        if result.success {
            successful += 1;
            if let Some(out_size) = result.output_size {
                total_output_size += out_size;
            }
        } else {
            failed += 1;
        }
    }

    let space_saved = total_original_size.saturating_sub(total_output_size);
    let average_compression = if total_original_size > 0 {
        (space_saved as f64 / total_original_size as f64) * 100.0
    } else {
        0.0
    };

    Ok(BatchSummary {
        total_images: total,
        successful,
        failed,
        total_original_size,
        total_output_size,
        space_saved,
        average_compression,
    })
}

/// Quick preview: runs on a blocking thread, generates a downscaled
/// EXIF-oriented preview with optional crop applied.
#[tauri::command]
pub async fn preview_image(
    path: String,
    settings: ProcessingSettings,
    max_preview_size: Option<u32>,
) -> Result<PreviewResult, String> {
    // Get oriented dimensions (fast, no full decode)
    let (orig_w, orig_h, orig_size) = engine::get_image_info(&path)
        .map_err(|e| format!("Failed to read image: {}", e))?;

    let preview_max = max_preview_size.unwrap_or(1200);

    // Run the heavy work on a blocking thread
    let path_clone = path.clone();
    let (data_url, pw, ph, _) = tokio::task::spawn_blocking(move || {
        engine::generate_preview(&path_clone, &settings, preview_max)
            .map_err(|e| format!("Preview failed: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    Ok(PreviewResult {
        data_url,
        original_width: orig_w,
        original_height: orig_h,
        original_size: orig_size,
        preview_width: pw,
        preview_height: ph,
    })
}

/// Cache for estimate_size: stores the decoded+cropped+resized image so that
/// adjusting quality/format sliders doesn't re-decode from disk every time.
pub struct EstimateSizeCache {
    pub inner: Arc<Mutex<Option<CachedEstimate>>>,
}

pub struct CachedEstimate {
    pub key: String,
    pub image: DynamicImage,
}

impl Default for EstimateSizeCache {
    fn default() -> Self {
        Self { inner: Arc::new(Mutex::new(None)) }
    }
}

/// Build a cache key from the settings that affect the decoded image
/// (path + crop + resize). Quality and format are NOT included because
/// the cache stores the pre-encode image.
fn estimate_cache_key(path: &str, settings: &ProcessingSettings) -> String {
    format!(
        "{}|{:?}|{:?}|{:?}|{}|{:.4}|{:.4}|{:.4}",
        path,
        settings.crop_preset.as_ref().map(|p| (&p.name, p.width, p.height)),
        settings.resize_width,
        settings.resize_height,
        settings.maintain_aspect_ratio,
        settings.crop_offset_x,
        settings.crop_offset_y,
        settings.crop_scale,
    )
}

#[tauri::command]
pub async fn estimate_size(
    path: String,
    settings: ProcessingSettings,
    cache: tauri::State<'_, EstimateSizeCache>,
) -> Result<u64, String> {
    let key = estimate_cache_key(&path, &settings);

    // Check if cached image matches
    let cached_img = {
        let guard = cache.inner.lock().unwrap();
        if let Some(ref cached) = *guard {
            if cached.key == key {
                Some(cached.image.clone())
            } else {
                None
            }
        } else {
            None
        }
    };

    let cache_inner = cache.inner.clone();
    let settings_clone = settings.clone();
    let key_clone = key.clone();
    let path_clone = path.clone();

    let est_size = tokio::task::spawn_blocking(move || {
        let img = if let Some(img) = cached_img {
            img
        } else {
            // Decode + crop + resize and cache the result
            let decoded = engine::open_image_oriented(&path_clone)
                .map_err(|e| format!("Failed to open: {}", e))?;
            let cropped = engine::apply_crop_public(&decoded, &settings_clone);
            let resized = engine::apply_resize_public(cropped, &settings_clone);

            // Store in cache
            {
                let mut guard = cache_inner.lock().unwrap();
                *guard = Some(CachedEstimate {
                    key: key_clone,
                    image: resized.clone(),
                });
            }
            resized
        };

        engine::encode_and_measure(&img, &path_clone, &settings_clone)
            .map_err(|e| format!("Estimation failed: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    Ok(est_size)
}

#[tauri::command]
pub async fn preview_compressed_image(
    path: String,
    settings: ProcessingSettings,
    max_preview_size: Option<u32>,
) -> Result<String, String> {
    let preview_max = max_preview_size.unwrap_or(1200);
    let path_clone = path.clone();
    let data_url = tokio::task::spawn_blocking(move || {
        engine::generate_compressed_preview(&path_clone, &settings, preview_max)
            .map_err(|e| format!("Compressed preview failed: {}", e))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    Ok(data_url)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewResult {
    pub data_url: String,
    pub original_width: u32,
    pub original_height: u32,
    pub original_size: u64,
    pub preview_width: u32,
    pub preview_height: u32,
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
