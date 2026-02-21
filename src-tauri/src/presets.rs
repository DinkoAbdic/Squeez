use crate::types::CropPreset;

/// Returns all built-in social media crop presets
pub fn get_all_presets() -> Vec<CropPreset> {
    vec![
        // Instagram
        CropPreset {
            name: "Instagram Post (Portrait)".into(),
            platform: "Instagram".into(),
            width: 1080,
            height: 1350,
            aspect_ratio: "4:5".into(),
        },
        CropPreset {
            name: "Instagram Post (Square)".into(),
            platform: "Instagram".into(),
            width: 1080,
            height: 1080,
            aspect_ratio: "1:1".into(),
        },
        CropPreset {
            name: "Instagram Post (Landscape)".into(),
            platform: "Instagram".into(),
            width: 1080,
            height: 566,
            aspect_ratio: "1.91:1".into(),
        },
        CropPreset {
            name: "Instagram Story / Reel".into(),
            platform: "Instagram".into(),
            width: 1080,
            height: 1920,
            aspect_ratio: "9:16".into(),
        },
        // Facebook
        CropPreset {
            name: "Facebook Post (Square)".into(),
            platform: "Facebook".into(),
            width: 1080,
            height: 1080,
            aspect_ratio: "1:1".into(),
        },
        CropPreset {
            name: "Facebook Post (Landscape)".into(),
            platform: "Facebook".into(),
            width: 1200,
            height: 630,
            aspect_ratio: "1.91:1".into(),
        },
        CropPreset {
            name: "Facebook Cover Photo".into(),
            platform: "Facebook".into(),
            width: 851,
            height: 315,
            aspect_ratio: "2.7:1".into(),
        },
        CropPreset {
            name: "Facebook Story".into(),
            platform: "Facebook".into(),
            width: 1080,
            height: 1920,
            aspect_ratio: "9:16".into(),
        },
        // LinkedIn
        CropPreset {
            name: "LinkedIn Post (Landscape)".into(),
            platform: "LinkedIn".into(),
            width: 1200,
            height: 627,
            aspect_ratio: "1.91:1".into(),
        },
        CropPreset {
            name: "LinkedIn Post (Square)".into(),
            platform: "LinkedIn".into(),
            width: 1200,
            height: 1200,
            aspect_ratio: "1:1".into(),
        },
        CropPreset {
            name: "LinkedIn Cover Photo".into(),
            platform: "LinkedIn".into(),
            width: 1584,
            height: 396,
            aspect_ratio: "4:1".into(),
        },
        // TikTok
        CropPreset {
            name: "TikTok Post / Video Cover".into(),
            platform: "TikTok".into(),
            width: 1080,
            height: 1920,
            aspect_ratio: "9:16".into(),
        },
        CropPreset {
            name: "TikTok Post (Square)".into(),
            platform: "TikTok".into(),
            width: 1080,
            height: 1080,
            aspect_ratio: "1:1".into(),
        },
    ]
}
