mod commands;
mod engine;
mod presets;
mod shell;
mod types;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Capture --shell-process <path> before the Tauri runtime starts so we can
    // pass it as managed state and resize the window from the frontend.
    let args: Vec<String> = std::env::args().collect();
    let shell_path: Option<String> = args
        .iter()
        .position(|a| a == "--shell-process")
        .and_then(|i| args.get(i + 1))
        .cloned();

    tauri::Builder::default()
        .manage(commands::CancelFlag::default())
        .manage(commands::ImportCancelFlag::default())
        .manage(commands::EstimateSizeCache::default())
        .manage(shell::ShellPath(std::sync::Mutex::new(shell_path)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::import_images,
            commands::cancel_import,
            commands::get_thumbnail,
            commands::get_presets,
            commands::process_images,
            commands::cancel_processing,
            commands::preview_image,
            commands::estimate_size,
            commands::open_folder,
            commands::preview_compressed_image,
            shell::get_shell_path,
            shell::resize_for_shell_mode,
            shell::process_shell_image,
            shell::register_context_menu,
            shell::unregister_context_menu,
            shell::is_context_menu_registered,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
