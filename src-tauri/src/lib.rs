mod commands;
mod engine;
mod presets;
mod types;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::CancelFlag::default())
        .manage(commands::ImportCancelFlag::default())
        .manage(commands::EstimateSizeCache::default())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
