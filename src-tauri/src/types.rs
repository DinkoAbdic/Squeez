use serde::{Deserialize, Serialize};

/// Supported output image formats
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OutputFormat {
    Jpeg,
    Png,
    WebP,
    Avif,
    Original,
}

impl std::fmt::Display for OutputFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OutputFormat::Jpeg => write!(f, "jpeg"),
            OutputFormat::Png => write!(f, "png"),
            OutputFormat::WebP => write!(f, "webp"),
            OutputFormat::Avif => write!(f, "avif"),
            OutputFormat::Original => write!(f, "original"),
        }
    }
}

impl OutputFormat {
    pub fn extension(&self) -> &str {
        match self {
            OutputFormat::Jpeg => "jpg",
            OutputFormat::Png => "png",
            OutputFormat::WebP => "webp",
            OutputFormat::Avif => "avif",
            OutputFormat::Original => "",
        }
    }
}

/// Social media crop preset
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CropPreset {
    pub name: String,
    pub platform: String,
    pub width: u32,
    pub height: u32,
    pub aspect_ratio: String,
}

/// Settings for processing a batch of images
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingSettings {
    pub output_format: OutputFormat,
    pub quality: u8,
    pub avif_speed: u8,
    #[serde(default = "default_png_compression")]
    pub png_compression: u8,
    pub resize_width: Option<u32>,
    pub resize_height: Option<u32>,
    pub maintain_aspect_ratio: bool,
    pub crop_preset: Option<CropPreset>,
    pub strip_metadata: bool,
    #[serde(default)]
    pub convert_to_srgb: bool,
    #[serde(default)]
    pub crop_offset_x: f64,
    #[serde(default)]
    pub crop_offset_y: f64,
    #[serde(default = "default_crop_scale")]
    pub crop_scale: f64,
    #[serde(default = "default_filename_pattern")]
    pub filename_pattern: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageExportTask {
    pub path: String,
    pub settings: ProcessingSettings,
}

fn default_crop_scale() -> f64 {
    1.0
}

fn default_filename_pattern() -> String {
    "{name}".to_string()
}

fn default_png_compression() -> u8 {
    9
}

impl Default for ProcessingSettings {
    fn default() -> Self {
        Self {
            output_format: OutputFormat::WebP,
            quality: 80,
            avif_speed: 6,
            png_compression: 9,
            resize_width: None,
            resize_height: None,
            maintain_aspect_ratio: true,
            crop_preset: None,
            strip_metadata: true,
            convert_to_srgb: true,
            crop_offset_x: 0.0,
            crop_offset_y: 0.0,
            crop_scale: 1.0,
            filename_pattern: default_filename_pattern(),
        }
    }
}

/// Represents a single image in the queue
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageItem {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub original_size: u64,
    pub width: u32,
    pub height: u32,
    pub status: ImageStatus,
    pub output_size: Option<u64>,
    pub error: Option<String>,
}

/// Status of an image in the processing queue
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ImageStatus {
    Pending,
    Processing,
    Done,
    Error,
}

/// Result of processing a single image
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessResult {
    pub id: String,
    pub success: bool,
    pub output_path: Option<String>,
    pub output_size: Option<u64>,
    pub error: Option<String>,
}

/// Overall batch processing summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchSummary {
    pub total_images: u32,
    pub successful: u32,
    pub failed: u32,
    pub total_original_size: u64,
    pub total_output_size: u64,
    pub space_saved: u64,
    pub average_compression: f64,
}

/// Thumbnail data for preview
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThumbnailData {
    pub id: String,
    pub data_url: String,
    pub width: u32,
    pub height: u32,
}
