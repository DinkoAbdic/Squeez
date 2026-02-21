export interface ImageItem {
  id: string;
  path: string;
  filename: string;
  original_size: number;
  width: number;
  height: number;
  status: 'Pending' | 'Processing' | 'Done' | 'Error';
  output_size: number | null;
  error: string | null;
  thumbnailUrl?: string;
  cropOverride?: {
    crop_offset_x: number;
    crop_offset_y: number;
    crop_scale: number;
  };
}

export interface CropPreset {
  name: string;
  platform: string;
  width: number;
  height: number;
  aspect_ratio: string;
}

export interface ProcessingSettings {
  output_format: 'Jpeg' | 'Png' | 'WebP' | 'Avif' | 'Original';
  quality: number;
  avif_speed: number;
  png_compression: number;
  resize_width: number | null;
  resize_height: number | null;
  maintain_aspect_ratio: boolean;
  crop_preset: CropPreset | null;
  strip_metadata: boolean;
  convert_to_srgb: boolean;
  crop_offset_x: number;
  crop_offset_y: number;
  crop_scale: number;
  filename_pattern: string;
}

export interface ImageExportTask {
  path: string;
  settings: ProcessingSettings;
}

export interface ProcessResult {
  id: string;
  success: boolean;
  output_path: string | null;
  output_size: number | null;
  error: string | null;
}

export interface ProgressEvent {
  current: number;
  total: number;
  current_file: string;
  result: ProcessResult | null;
}

export interface BatchSummary {
  total_images: number;
  successful: number;
  failed: number;
  total_original_size: number;
  total_output_size: number;
  space_saved: number;
  average_compression: number;
}

export interface ThumbnailData {
  id: string;
  data_url: string;
  width: number;
  height: number;
}

export interface ImportProgressEvent {
  image: ImageItem;
}

export interface ImportSummary {
  total: number;
}

export interface PreviewResult {
  data_url: string;
  original_width: number;
  original_height: number;
  original_size: number;
  preview_width: number;
  preview_height: number;
  imageId?: string;
}
