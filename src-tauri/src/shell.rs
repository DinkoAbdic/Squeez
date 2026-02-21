use crate::engine;
use crate::types::{OutputFormat, ProcessingSettings};
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;

// ─── Managed state ────────────────────────────────────────────────────────────

/// Holds the image path supplied via `--shell-process <path>`, if any.
pub struct ShellPath(pub Mutex<Option<String>>);

// ─── Commands ─────────────────────────────────────────────────────────────────

/// Result returned to the frontend after shell-mode image processing.
#[derive(Debug, Clone, Serialize)]
pub struct ShellResult {
    pub success: bool,
    pub input_filename: String,
    pub output_path: Option<String>,
    pub output_filename: Option<String>,
    pub original_size: u64,
    pub output_size: Option<u64>,
    pub savings_percent: Option<f64>,
    pub error: Option<String>,
}

/// Returns the `--shell-process` path when launched from the right-click menu,
/// or `null` for a normal launch.
#[tauri::command]
pub fn get_shell_path(state: tauri::State<'_, ShellPath>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

/// Resize the main window down to the compact shell-mode dimensions and center it.
/// Called by the frontend immediately after it detects a shell-mode launch.
#[tauri::command]
pub fn resize_for_shell_mode(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Window not found".to_string())?;
    // Clear the min-size constraint that the main app enforces (1600×1000),
    // then set the compact shell size.
    let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize {
        width: 480.0_f64,
        height: 148.0_f64,
    })));
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: 480.0_f64,
        height: 148.0_f64,
    }));
    let _ = window.center();
    Ok(())
}

/// Process a single image file using the shell-mode defaults:
/// WebP @ quality 80, strip metadata, convert to sRGB.
/// The output is written to the same directory as the input.
#[tauri::command]
pub async fn process_shell_image(path: String) -> Result<ShellResult, String> {
    let output_dir = Path::new(&path)
        .parent()
        .and_then(|p| p.to_str())
        .unwrap_or(".")
        .to_string();

    let input_filename = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    tokio::task::spawn_blocking(move || {
        let original_size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

        let settings = ProcessingSettings {
            output_format: OutputFormat::WebP,
            quality: 80,
            strip_metadata: true,
            convert_to_srgb: true,
            ..ProcessingSettings::default()
        };

        let claimed = Mutex::new(HashSet::new());
        let result = engine::process_image(&path, &output_dir, &settings, &claimed);

        let output_filename = result
            .output_path
            .as_ref()
            .and_then(|p| Path::new(p).file_name())
            .and_then(|n| n.to_str())
            .map(|s| s.to_string());

        let savings_percent = match (result.output_size, original_size) {
            (Some(out), orig) if orig > 0 => Some((1.0 - out as f64 / orig as f64) * 100.0),
            _ => None,
        };

        ShellResult {
            success: result.success,
            input_filename,
            output_path: result.output_path,
            output_filename,
            original_size,
            output_size: result.output_size,
            savings_percent,
            error: result.error,
        }
    })
    .await
    .map_err(|e| e.to_string())
}

// ─── Windows context menu registration ───────────────────────────────────────

/// Write the "Squeez this image" entry to the Windows registry.
/// Uses HKEY_CURRENT_USER — no administrator rights required.
#[tauri::command]
pub fn register_context_menu() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let exe = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string();

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let label = "Squeez this image";
        let icon = format!("{},0", exe);
        let command = format!("\"{}\" --shell-process \"%1\"", exe);

        // All files Windows classifies as images (JPEG, PNG, GIF, BMP, TIFF…)
        write_shell_entry(
            &hkcu,
            r"Software\Classes\SystemFileAssociations\image\shell\Squeez",
            label,
            &icon,
            &command,
        )?;

        // WebP and AVIF may not be in the `image` class on older Windows builds
        for ext in &[".webp", ".avif"] {
            write_shell_entry(
                &hkcu,
                &format!(r"Software\Classes\{}\shell\Squeez", ext),
                label,
                &icon,
                &command,
            )?;
        }

        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Err("Context menu integration is only available on Windows.".to_string())
}

/// Remove the "Squeez this image" entry from the Windows registry.
#[tauri::command]
pub fn unregister_context_menu() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::RegKey;
        use winreg::enums::HKEY_CURRENT_USER;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for key in &[
            r"Software\Classes\SystemFileAssociations\image\shell\Squeez",
            r"Software\Classes\.webp\shell\Squeez",
            r"Software\Classes\.avif\shell\Squeez",
        ] {
            let _ = hkcu.delete_subkey_all(key); // silently ignore if already absent
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Err("Context menu integration is only available on Windows.".to_string())
}

/// Returns `true` if the context menu entry is currently registered.
#[tauri::command]
pub fn is_context_menu_registered() -> bool {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(r"Software\Classes\SystemFileAssociations\image\shell\Squeez")
            .is_ok()
    }
    #[cfg(not(target_os = "windows"))]
    false
}

// ─── Private helpers ──────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn write_shell_entry(
    hkcu: &winreg::RegKey,
    base: &str,
    label: &str,
    icon: &str,
    command: &str,
) -> Result<(), String> {
    let (key, _) = hkcu.create_subkey(base).map_err(|e| e.to_string())?;
    key.set_value("", &label).map_err(|e| e.to_string())?;
    key.set_value("Icon", &icon).map_err(|e| e.to_string())?;
    let (cmd_key, _) = hkcu
        .create_subkey(&format!(r"{}\command", base))
        .map_err(|e| e.to_string())?;
    cmd_key
        .set_value("", &command)
        .map_err(|e| e.to_string())?;
    Ok(())
}
