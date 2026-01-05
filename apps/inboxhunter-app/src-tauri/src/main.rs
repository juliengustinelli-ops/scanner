// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize database
            let app_handle = app.handle();
            let data_dir = app_handle.path_resolver()
                .app_data_dir()
                .expect("Failed to get app data directory");
            
            std::fs::create_dir_all(&data_dir).ok();
            
            let db_path = data_dir.join("inboxhunter.db");
            db::init_database(&db_path).expect("Failed to initialize database");
            
            // Store database path in app state
            app.manage(commands::AppState {
                db_path: std::sync::Mutex::new(db_path.to_string_lossy().to_string()),
                bot_running: std::sync::Mutex::new(false),
                bot_process: std::sync::Mutex::new(None),
            });
            
            println!("InboxHunter initialized. Data directory: {:?}", data_dir);
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_bot,
            commands::stop_bot,
            commands::get_bot_status,
            // Processed URLs
            commands::get_processed_urls,
            commands::get_processed_stats,
            commands::delete_processed_url,
            commands::clear_processed_urls,
            commands::export_processed_csv,
            // Scraped URLs
            commands::get_scraped_urls,
            commands::get_scraped_stats,
            commands::delete_scraped_url,
            commands::update_scraped_url_status,
            commands::clear_scraped_urls,
            commands::export_scraped_csv,
            // Settings
            commands::save_settings,
            commands::load_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
