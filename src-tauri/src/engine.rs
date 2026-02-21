use flate2::read::ZlibDecoder;
use image::{imageops::FilterType, DynamicImage, GenericImageView, ImageFormat};
use std::collections::HashSet;
use std::fs;
use std::io::{BufReader, Cursor, Read as _};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::types::{CropPreset, OutputFormat, ProcessResult, ProcessingSettings};

// ─── EXIF Orientation ──────────────────────────────────────────────────────

/// Read the EXIF orientation tag from a file (returns 1-8, or 1 as default)
fn read_exif_orientation(path: &str) -> u32 {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return 1,
    };
    let mut buf_reader = BufReader::new(&file);
    let exif_reader = exif::Reader::new();
    let exif = match exif_reader.read_from_container(&mut buf_reader) {
        Ok(e) => e,
        Err(_) => return 1,
    };
    exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)
        .and_then(|f| f.value.get_uint(0))
        .unwrap_or(1)
}

/// Apply EXIF orientation transform to an image
fn apply_orientation(img: DynamicImage, orientation: u32) -> DynamicImage {
    match orientation {
        1 => img,                     // Normal
        2 => img.fliph(),             // Mirrored horizontal
        3 => img.rotate180(),         // Rotated 180°
        4 => img.flipv(),             // Mirrored vertical
        5 => img.rotate90().fliph(),  // Rotated 90° CW + mirrored
        6 => img.rotate90(),          // Rotated 90° CW (portrait)
        7 => img.rotate270().fliph(), // Rotated 270° CW + mirrored
        8 => img.rotate270(),         // Rotated 270° CW
        _ => img,
    }
}

/// Open an image and auto-apply EXIF orientation
pub fn open_image_oriented(path: &str) -> Result<DynamicImage, Box<dyn std::error::Error>> {
    let orientation = read_exif_orientation(path);
    let img = image::open(path)?;
    Ok(apply_orientation(img, orientation))
}

// ─── Image Info (fast — NO full decode) ────────────────────────────────────

/// Get basic image info (dimensions accounting for EXIF orientation, file size)
/// Uses ImageReader::into_dimensions() to avoid fully decoding the pixel data.
pub fn get_image_info(path: &str) -> Result<(u32, u32, u64), Box<dyn std::error::Error>> {
    let metadata = fs::metadata(path)?;
    let file_size = metadata.len();

    // Fast dimension read (no full decode)
    let reader = image::ImageReader::open(path)?.with_guessed_format()?;
    let (mut w, mut h) = reader.into_dimensions()?;

    // Swap dimensions if EXIF says rotated 90°/270°
    let orientation = read_exif_orientation(path);
    if orientation >= 5 && orientation <= 8 {
        std::mem::swap(&mut w, &mut h);
    }

    Ok((w, h, file_size))
}

// ─── EXIF Metadata Preservation ────────────────────────────────────────────

/// Read the raw APP1 (EXIF) segment from a JPEG file, if present.
/// Returns the full APP1 marker + length + payload bytes.
fn read_jpeg_app1_segment(path: &str) -> Option<Vec<u8>> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut data = Vec::new();
    file.read_to_end(&mut data).ok()?;

    // JPEG must start with SOI (FF D8)
    if data.len() < 4 || data[0] != 0xFF || data[1] != 0xD8 {
        return None;
    }

    let mut pos = 2;
    while pos + 3 < data.len() {
        if data[pos] != 0xFF {
            return None; // Invalid JPEG structure
        }
        let marker = data[pos + 1];
        // APP1 = 0xE1
        if marker == 0xE1 {
            let seg_len = ((data[pos + 2] as usize) << 8) | (data[pos + 3] as usize);
            let total_len = 2 + seg_len; // marker(2) + length(2) + payload
            if pos + total_len <= data.len() {
                return Some(data[pos..pos + total_len].to_vec());
            }
            return None;
        }
        // Skip this segment
        let seg_len = ((data[pos + 2] as usize) << 8) | (data[pos + 3] as usize);
        pos += 2 + seg_len;
    }
    None
}

/// Patch EXIF orientation tag to 1 (Normal) in an APP1 segment.
/// This is needed because we've already applied the rotation to pixels.
fn patch_exif_orientation_to_1(app1: &mut [u8]) {
    // APP1 structure: FF E1 [len:2] "Exif\0\0" [TIFF header] [IFD entries...]
    // We need at least the marker(2) + length(2) + "Exif\0\0"(6) + TIFF header(8) = 18 bytes
    if app1.len() < 18 {
        return;
    }

    // Check "Exif\0\0" signature at offset 4
    if &app1[4..10] != b"Exif\0\0" {
        return;
    }

    let tiff_start = 10; // Start of TIFF header within app1 buffer
    let byte_order = &app1[tiff_start..tiff_start + 2];
    let big_endian = byte_order == b"MM";
    if !big_endian && byte_order != b"II" {
        return;
    }

    let read_u16 = |offset: usize| -> u16 {
        if big_endian {
            ((app1[offset] as u16) << 8) | (app1[offset + 1] as u16)
        } else {
            (app1[offset] as u16) | ((app1[offset + 1] as u16) << 8)
        }
    };

    let read_u32 = |offset: usize| -> u32 {
        if big_endian {
            ((app1[offset] as u32) << 24)
                | ((app1[offset + 1] as u32) << 16)
                | ((app1[offset + 2] as u32) << 8)
                | (app1[offset + 3] as u32)
        } else {
            (app1[offset] as u32)
                | ((app1[offset + 1] as u32) << 8)
                | ((app1[offset + 2] as u32) << 16)
                | ((app1[offset + 3] as u32) << 24)
        }
    };

    let write_u16 = |buf: &mut [u8], offset: usize, val: u16| {
        if big_endian {
            buf[offset] = (val >> 8) as u8;
            buf[offset + 1] = val as u8;
        } else {
            buf[offset] = val as u8;
            buf[offset + 1] = (val >> 8) as u8;
        }
    };

    // IFD0 offset is at tiff_start + 4
    let ifd0_offset = read_u32(tiff_start + 4) as usize;
    let ifd0_abs = tiff_start + ifd0_offset;

    if ifd0_abs + 2 > app1.len() {
        return;
    }

    let entry_count = read_u16(ifd0_abs) as usize;
    let entries_start = ifd0_abs + 2;

    // Each IFD entry is 12 bytes: tag(2) + type(2) + count(4) + value(4)
    for i in 0..entry_count {
        let entry_offset = entries_start + i * 12;
        if entry_offset + 12 > app1.len() {
            break;
        }
        let tag = read_u16(entry_offset);
        if tag == 0x0112 {
            // Orientation tag found — set value to 1 (Normal)
            write_u16(app1, entry_offset + 8, 1);
            return;
        }
    }
}

/// Inject an APP1 EXIF segment into encoded JPEG bytes, right after the SOI marker.
fn inject_app1_into_jpeg(jpeg_bytes: &[u8], app1: &[u8]) -> Vec<u8> {
    // JPEG starts with FF D8. Insert APP1 right after.
    let mut result = Vec::with_capacity(jpeg_bytes.len() + app1.len());
    result.extend_from_slice(&jpeg_bytes[..2]); // SOI
    result.extend_from_slice(app1);              // APP1 segment
    result.extend_from_slice(&jpeg_bytes[2..]);  // Rest of JPEG
    result
}

// ─── sRGB Color Profile Conversion ─────────────────────────────────────────

/// Extract raw ICC profile bytes from a JPEG file (APP2 segments).
/// JPEG ICC profiles may be split across multiple APP2 markers — reassembles them in order.
fn read_jpeg_icc_profile(path: &str) -> Option<Vec<u8>> {
    let mut file = fs::File::open(path).ok()?;
    let mut data = Vec::new();
    file.read_to_end(&mut data).ok()?;

    // JPEG must start with SOI (FF D8)
    if data.len() < 4 || data[0] != 0xFF || data[1] != 0xD8 {
        return None;
    }

    const ICC_SIG: &[u8] = b"ICC_PROFILE\0";
    let mut chunks: std::collections::BTreeMap<u8, Vec<u8>> = std::collections::BTreeMap::new();
    let mut total_chunks: u8 = 0;

    let mut pos = 2; // skip SOI marker
    while pos + 3 < data.len() {
        if data[pos] != 0xFF {
            break;
        }
        let marker = data[pos + 1];

        // Standalone markers have no length field (SOI, EOI, RST0–RST7)
        if marker == 0xD8 || marker == 0xD9 || (0xD0..=0xD7).contains(&marker) {
            pos += 2;
            continue;
        }

        if pos + 4 > data.len() {
            break;
        }

        let seg_len = ((data[pos + 2] as usize) << 8) | (data[pos + 3] as usize);
        if seg_len < 2 {
            break; // malformed segment — prevent infinite loop
        }

        // APP2 with enough room for ICC_PROFILE\0 + chunk# + total# (14 bytes)
        if marker == 0xE2 && seg_len >= 16 {
            let payload = pos + 4;
            if payload + 14 <= data.len() && &data[payload..payload + 12] == ICC_SIG {
                let chunk_num = data[payload + 12]; // 1-based
                let chunk_total = data[payload + 13];
                let icc_start = payload + 14;
                let icc_end = (pos + 2 + seg_len).min(data.len());
                if chunk_num >= 1 && icc_start < icc_end {
                    chunks.insert(chunk_num, data[icc_start..icc_end].to_vec());
                    if total_chunks == 0 {
                        total_chunks = chunk_total;
                    }
                }
            }
        }

        // SOS starts compressed image data — no more headers after this
        if marker == 0xDA {
            break;
        }

        pos += 2 + seg_len;
    }

    if chunks.is_empty() {
        return None;
    }

    let expected = if total_chunks > 0 { total_chunks } else { 1 };
    let mut profile = Vec::new();
    for i in 1..=expected {
        profile.extend_from_slice(chunks.get(&i)?);
    }
    Some(profile)
}

/// Extract and decompress the ICC profile from a PNG file (iCCP chunk).
fn read_png_icc_profile(path: &str) -> Option<Vec<u8>> {
    let mut file = fs::File::open(path).ok()?;
    let mut data = Vec::new();
    file.read_to_end(&mut data).ok()?;

    // PNG signature: 8 bytes
    if data.len() < 8 || &data[0..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }

    let mut pos = 8;
    while pos + 12 <= data.len() {
        let chunk_len =
            u32::from_be_bytes([data[pos], data[pos + 1], data[pos + 2], data[pos + 3]]) as usize;
        let chunk_type = &data[pos + 4..pos + 8];
        let chunk_data_start = pos + 8;
        let chunk_data_end = chunk_data_start + chunk_len;

        if chunk_data_end + 4 > data.len() {
            break;
        }

        if chunk_type == b"iCCP" {
            let chunk_data = &data[chunk_data_start..chunk_data_end];

            // Profile name is null-terminated; compression method follows the null byte
            let null_pos = chunk_data.iter().position(|&b| b == 0)?;
            if null_pos + 2 >= chunk_data.len() {
                return None;
            }
            // chunk_data[null_pos + 1] = compression method (0 = deflate/zlib)
            let compressed = &chunk_data[null_pos + 2..];

            let mut decoder = ZlibDecoder::new(compressed);
            let mut icc_bytes = Vec::new();
            decoder.read_to_end(&mut icc_bytes).ok()?;

            return if icc_bytes.is_empty() { None } else { Some(icc_bytes) };
        }

        // IEND chunk — stop scanning
        if chunk_type == b"IEND" {
            break;
        }

        pos = chunk_data_end + 4; // skip data + CRC (4 bytes)
    }

    None
}

/// Convert image pixels from an arbitrary ICC color profile to sRGB using lcms2.
/// Preserves the alpha channel unchanged. Returns None on any error (malformed
/// profile, unsupported color space, etc.) so the caller can fall back gracefully.
fn apply_srgb_conversion(img: &DynamicImage, icc_bytes: &[u8]) -> Option<DynamicImage> {
    let src_profile = lcms2::Profile::new_icc(icc_bytes).ok()?;
    let dst_profile = lcms2::Profile::new_srgb();

    // [u8; 3] maps 1:1 to RGB_8 (3 bytes per pixel) — avoids any rgb-crate version dependency
    let transform = lcms2::Transform::<[u8; 3], [u8; 3]>::new(
        &src_profile,
        lcms2::PixelFormat::RGB_8,
        &dst_profile,
        lcms2::PixelFormat::RGB_8,
        lcms2::Intent::Perceptual,
    )
    .ok()?;

    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let raw = rgba.as_raw();
    let pixel_count = (w * h) as usize;

    // Separate RGB from alpha so we only transform color channels
    let input_rgb: Vec<[u8; 3]> = raw.chunks_exact(4).map(|c| [c[0], c[1], c[2]]).collect();
    let alpha: Vec<u8> = raw.chunks_exact(4).map(|c| c[3]).collect();

    let mut output_rgb = vec![[0u8; 3]; pixel_count];
    transform.transform_pixels(&input_rgb, &mut output_rgb);

    // Reconstruct RGBA with original alpha
    let mut output_raw: Vec<u8> = Vec::with_capacity(pixel_count * 4);
    for (px, a) in output_rgb.iter().zip(alpha.iter()) {
        output_raw.push(px[0]);
        output_raw.push(px[1]);
        output_raw.push(px[2]);
        output_raw.push(*a);
    }

    image::RgbaImage::from_raw(w, h, output_raw).map(DynamicImage::ImageRgba8)
}

/// If `convert_to_srgb` is enabled, read the embedded ICC profile and convert pixels.
/// Silently returns the original image unchanged if no profile is found or on any error.
fn maybe_convert_to_srgb(
    img: DynamicImage,
    input_path: &str,
    settings: &crate::types::ProcessingSettings,
) -> DynamicImage {
    if !settings.convert_to_srgb {
        return img;
    }

    let ext = Path::new(input_path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());

    let icc_bytes = match ext.as_deref() {
        Some("jpg") | Some("jpeg") => read_jpeg_icc_profile(input_path),
        Some("png") => read_png_icc_profile(input_path),
        _ => None,
    };

    match icc_bytes {
        None => img, // No embedded profile — treat as sRGB already, nothing to do
        Some(icc) => apply_srgb_conversion(&img, &icc).unwrap_or(img),
    }
}

// ─── Processing ────────────────────────────────────────────────────────────

/// Process a single image according to the given settings.
/// `claimed_names` is a thread-safe set of output paths already claimed by parallel workers,
/// preventing TOCTOU races when multiple images have the same base filename.
pub fn process_image(
    input_path: &str,
    output_dir: &str,
    settings: &ProcessingSettings,
    claimed_names: &Mutex<HashSet<PathBuf>>,
) -> ProcessResult {
    let id = input_path.to_string();

    match process_image_inner(input_path, output_dir, settings, claimed_names) {
        Ok((output_path, output_size)) => ProcessResult {
            id,
            success: true,
            output_path: Some(output_path),
            output_size: Some(output_size),
            error: None,
        },
        Err(e) => ProcessResult {
            id,
            success: false,
            output_path: None,
            output_size: None,
            error: Some(e.to_string()),
        },
    }
}

fn process_image_inner(
    input_path: &str,
    output_dir: &str,
    settings: &ProcessingSettings,
    claimed_names: &Mutex<HashSet<PathBuf>>,
) -> Result<(String, u64), Box<dyn std::error::Error>> {
    // Load the image with correct EXIF orientation
    let img = open_image_oriented(input_path)?;

    // Convert from embedded ICC color profile to sRGB if requested
    let img = maybe_convert_to_srgb(img, input_path, settings);

    // Get original format for "Original" output mode
    let original_format = detect_format(input_path);

    // Apply crop if preset is set
    let img = if let Some(ref preset) = settings.crop_preset {
        crop_to_preset(&img, preset, settings)
    } else {
        img
    };

    // Apply resize if dimensions are specified (owned to avoid unnecessary clone)
    let img = apply_resize_owned(img, settings);

    // Determine output format
    let effective_format = if settings.output_format == OutputFormat::Original {
        original_format.unwrap_or(OutputFormat::Jpeg)
    } else {
        settings.output_format.clone()
    };

    // Resolve filename pattern
    let input_filename = Path::new(input_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");
    let ext = effective_format.extension();
    let (out_w, out_h) = img.dimensions();

    let resolved_stem = settings
        .filename_pattern
        .replace("{name}", input_filename)
        .replace("{width}", &out_w.to_string())
        .replace("{height}", &out_h.to_string())
        .replace("{quality}", &settings.quality.to_string())
        .replace("{format}", ext);

    // Use resolved stem, falling back to original name if pattern produced empty string
    let stem = if resolved_stem.trim().is_empty() {
        input_filename.to_string()
    } else {
        resolved_stem
    };

    // Build output path with collision protection (thread-safe)
    let output_path = {
        let mut guard = claimed_names.lock().unwrap();
        let mut candidate = PathBuf::from(output_dir).join(format!("{}.{}", stem, ext));
        let mut counter = 1u32;
        // Check both the claimed set AND the filesystem
        while guard.contains(&candidate) || candidate.exists() {
            candidate = PathBuf::from(output_dir)
                .join(format!("{}_{}.{}", stem, counter, ext));
            counter += 1;
        }
        guard.insert(candidate.clone());
        candidate
    };

    // Encode and save
    let mut output_bytes = encode_image(&img, &effective_format, settings)?;

    // Preserve EXIF metadata for JPEG→JPEG when strip_metadata is false
    if !settings.strip_metadata && effective_format == OutputFormat::Jpeg {
        if let Some(mut app1) = read_jpeg_app1_segment(input_path) {
            // Patch orientation to 1 since pixels are already rotated
            patch_exif_orientation_to_1(&mut app1);
            output_bytes = inject_app1_into_jpeg(&output_bytes, &app1);
        }
    }

    // Ensure output directory exists
    fs::create_dir_all(output_dir)?;
    fs::write(&output_path, &output_bytes)?;

    let output_size = output_bytes.len() as u64;
    let output_path_str = output_path.to_string_lossy().to_string();

    Ok((output_path_str, output_size))
}

/// Detect the format of an input file by extension
fn detect_format(path: &str) -> Option<OutputFormat> {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());

    match ext.as_deref() {
        Some("jpg") | Some("jpeg") => Some(OutputFormat::Jpeg),
        Some("png") => Some(OutputFormat::Png),
        Some("webp") => Some(OutputFormat::WebP),
        Some("avif") => Some(OutputFormat::Avif),
        _ => None,
    }
}

// ─── Crop & Resize ─────────────────────────────────────────────────────────

/// Crop an image to match a social media preset aspect ratio
/// Supports user-defined offset from center and zoom scale.
fn crop_to_preset(
    img: &DynamicImage,
    preset: &CropPreset,
    settings: &ProcessingSettings,
) -> DynamicImage {
    let (src_w, src_h) = img.dimensions();
    let target_ratio = preset.width as f64 / preset.height as f64;
    let src_ratio = src_w as f64 / src_h as f64;

    // Base crop dimensions (maximum area for this aspect ratio)
    let (base_w, base_h) = if src_ratio > target_ratio {
        let new_w = (src_h as f64 * target_ratio) as u32;
        (new_w, src_h)
    } else {
        let new_h = (src_w as f64 / target_ratio) as u32;
        (src_w, new_h)
    };

    // Apply scale (1.0 = full crop, <1.0 = zoomed in = smaller area)
    let scale = settings.crop_scale.clamp(0.2, 1.0);
    let crop_w = ((base_w as f64) * scale).max(1.0) as u32;
    let crop_h = ((base_h as f64) * scale).max(1.0) as u32;

    // Center + offset, clamped so crop stays within image
    let half_cw = crop_w as f64 / 2.0;
    let half_ch = crop_h as f64 / 2.0;
    let cx = (src_w as f64 / 2.0 + settings.crop_offset_x).clamp(half_cw, src_w as f64 - half_cw);
    let cy = (src_h as f64 / 2.0 + settings.crop_offset_y).clamp(half_ch, src_h as f64 - half_ch);

    let x = (cx - half_cw).max(0.0) as u32;
    let y = (cy - half_ch).max(0.0) as u32;
    let crop_w = crop_w.min(src_w - x);
    let crop_h = crop_h.min(src_h - y);

    let cropped = img.crop_imm(x, y, crop_w, crop_h);
    cropped.resize_exact(preset.width, preset.height, FilterType::Lanczos3)
}

/// Apply resize settings to an image
fn apply_resize(img: &DynamicImage, settings: &ProcessingSettings) -> DynamicImage {
    let (orig_w, orig_h) = img.dimensions();

    match (settings.resize_width, settings.resize_height) {
        (Some(w), Some(h)) if settings.maintain_aspect_ratio => {
            img.resize(w, h, FilterType::Lanczos3)
        }
        (Some(w), Some(h)) => img.resize_exact(w, h, FilterType::Lanczos3),
        (Some(w), None) => {
            if settings.maintain_aspect_ratio {
                let ratio = w as f64 / orig_w as f64;
                let new_h = (orig_h as f64 * ratio) as u32;
                img.resize_exact(w, new_h, FilterType::Lanczos3)
            } else {
                img.resize_exact(w, orig_h, FilterType::Lanczos3)
            }
        }
        (None, Some(h)) => {
            if settings.maintain_aspect_ratio {
                let ratio = h as f64 / orig_h as f64;
                let new_w = (orig_w as f64 * ratio) as u32;
                img.resize_exact(new_w, h, FilterType::Lanczos3)
            } else {
                img.resize_exact(orig_w, h, FilterType::Lanczos3)
            }
        }
        (None, None) => img.clone(),
    }
}

/// Apply resize, returning a Cow-like result to avoid cloning when no resize is needed
fn apply_resize_owned(img: DynamicImage, settings: &ProcessingSettings) -> DynamicImage {
    match (settings.resize_width, settings.resize_height) {
        (None, None) => img, // No clone needed — move ownership directly
        _ => apply_resize(&img, settings),
    }
}

// ─── Encoding ──────────────────────────────────────────────────────────────

/// Encode an image to the specified format
fn encode_image(
    img: &DynamicImage,
    format: &OutputFormat,
    settings: &ProcessingSettings,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    match format {
        OutputFormat::Jpeg => {
            let mut buf = Cursor::new(Vec::new());
            let encoder =
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, settings.quality);
            img.write_with_encoder(encoder)?;
            Ok(buf.into_inner())
        }
        OutputFormat::Png => {
            let mut buf = Cursor::new(Vec::new());
            let (compression, filter) = match settings.png_compression {
                1 => (image::codecs::png::CompressionType::Fast, image::codecs::png::FilterType::NoFilter),
                2..=3 => (image::codecs::png::CompressionType::Fast, image::codecs::png::FilterType::Adaptive),
                4..=6 => (image::codecs::png::CompressionType::Default, image::codecs::png::FilterType::Adaptive),
                _ => (image::codecs::png::CompressionType::Best, image::codecs::png::FilterType::Adaptive),
            };
            let encoder = image::codecs::png::PngEncoder::new_with_quality(&mut buf, compression, filter);
            img.write_with_encoder(encoder)?;
            Ok(buf.into_inner())
        }
        OutputFormat::WebP => encode_webp(img, settings),
        OutputFormat::Avif => encode_avif(img, settings),
        OutputFormat::Original => {
            // Fallback to JPEG
            let mut buf = Cursor::new(Vec::new());
            img.write_to(&mut buf, ImageFormat::Jpeg)?;
            Ok(buf.into_inner())
        }
    }
}

/// Encode to WebP using the webp crate (lossy with quality control)
fn encode_webp(
    img: &DynamicImage,
    settings: &ProcessingSettings,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();

    let encoder = webp::Encoder::from_rgba(&rgba, width, height);
    let quality = settings.quality as f32;
    let webp_data = encoder.encode(quality);

    Ok(webp_data.to_vec())
}

/// Encode to AVIF using the ravif crate (zero-copy pixel reinterpretation via bytemuck)
fn encode_avif(
    img: &DynamicImage,
    settings: &ProcessingSettings,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();

    // Zero-copy: reinterpret &[u8] as &[rgb::RGBA8] without allocating a new Vec
    let raw = rgba.as_raw();
    let pixels: &[rgb::RGBA8] = bytemuck::cast_slice(raw);

    let img_ref = ravif::Img::new(pixels, width as usize, height as usize);

    let res = ravif::Encoder::new()
        .with_quality(settings.quality as f32)
        .with_speed(settings.avif_speed)
        .encode_rgba(img_ref)?;

    Ok(res.avif_file)
}

// ─── Thumbnail & Preview ──────────────────────────────────────────────────

/// Generate a thumbnail from an image file (returns base64-encoded JPEG)
/// Uses EXIF orientation and fast Triangle filter for speed.
pub fn generate_thumbnail(
    input_path: &str,
    max_size: u32,
) -> Result<(String, u32, u32), Box<dyn std::error::Error>> {
    let img = open_image_oriented(input_path)?;
    let thumb = img.resize(max_size, max_size, FilterType::Triangle);
    let (w, h) = thumb.dimensions();

    let mut buf = Cursor::new(Vec::new());
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 70);
    thumb.write_with_encoder(encoder)?;

    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, buf.into_inner());

    Ok((format!("data:image/jpeg;base64,{}", b64), w, h))
}

pub fn generate_preview(
    input_path: &str,
    settings: &ProcessingSettings,
    max_preview_size: u32,
) -> Result<(String, u32, u32, u64), Box<dyn std::error::Error>> {
    let img = open_image_oriented(input_path)?;

    // Apply crop if preset is set
    let img = if let Some(ref preset) = settings.crop_preset {
        crop_to_preset(&img, preset, settings)
    } else {
        img
    };

    // Downscale for preview (matching export high-quality filter for sharp Squoosh-like results)
    let preview = img.resize(max_preview_size, max_preview_size, FilterType::Lanczos3);
    let (pw, ph) = preview.dimensions();

    let mut buf = Cursor::new(Vec::new());
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 85);
    preview.write_with_encoder(encoder)?;

    let bytes = buf.into_inner();
    let orig_size = fs::metadata(input_path).map(|m| m.len()).unwrap_or(0);

    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);

    Ok((format!("data:image/jpeg;base64,{}", b64), pw, ph, orig_size))
}

/// Apply crop settings to an image (public wrapper for commands.rs cache)
pub fn apply_crop_public(img: &DynamicImage, settings: &ProcessingSettings) -> DynamicImage {
    if let Some(ref preset) = settings.crop_preset {
        crop_to_preset(img, preset, settings)
    } else {
        img.clone()
    }
}

/// Apply resize with ownership transfer (public wrapper for commands.rs cache)
pub fn apply_resize_public(img: DynamicImage, settings: &ProcessingSettings) -> DynamicImage {
    apply_resize_owned(img, settings)
}

/// Encode a pre-processed image and return its byte size (used by estimate_size cache)
pub fn encode_and_measure(
    img: &DynamicImage,
    input_path: &str,
    settings: &ProcessingSettings,
) -> Result<u64, Box<dyn std::error::Error>> {
    let original_format = detect_format(input_path);
    let effective_format = if settings.output_format == OutputFormat::Original {
        original_format.unwrap_or(OutputFormat::Jpeg)
    } else {
        settings.output_format.clone()
    };

    let estimated_size = match encode_image(img, &effective_format, settings) {
        Ok(encoded) => encoded.len() as u64,
        Err(_) => 0,
    };

    Ok(estimated_size)
}

pub fn generate_compressed_preview(
    input_path: &str,
    settings: &ProcessingSettings,
    max_preview_size: u32,
) -> Result<String, Box<dyn std::error::Error>> {
    let img = open_image_oriented(input_path)?;

    // 1. Apply explicit user Resize settings first so encoding artifacts match the output!
    // We explicitly SKIP the `crop_to_preset` step here so the returned compressed preview
    // maintains identical aspect ratio and dimensions to the uncropped background preview
    // generated by `generate_preview()`. This ensures the React frontend `imgStyle` maps 1:1.
    let custom_resized = apply_resize(&img, settings);

    // 3. Resize to viewport max to prevent encoding massive 4K arrays dynamically on sliders
    let preview = custom_resized.resize(max_preview_size, max_preview_size, FilterType::Lanczos3);

    // 3. Determine Format
    let original_format = detect_format(input_path);
    let effective_format = if settings.output_format == OutputFormat::Original {
        original_format.unwrap_or(OutputFormat::Jpeg)
    } else {
        settings.output_format.clone()
    };

    // 4. Encode directly to base64
    let buffer = encode_image(&preview, &effective_format, settings)?;

    let mime_type = match effective_format {
        OutputFormat::WebP => "image/webp",
        OutputFormat::Avif => "image/avif",
        OutputFormat::Png => "image/png",
        OutputFormat::Jpeg | OutputFormat::Original => "image/jpeg",
    };

    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buffer);
    Ok(format!("data:{};base64,{}", mime_type, b64))
}
