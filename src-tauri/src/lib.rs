#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AppRuntimeInfo {
  version: String,
  executable_name: Option<String>,
  is_portable: bool,
}

#[tauri::command]
fn get_app_runtime_info(app: tauri::AppHandle) -> AppRuntimeInfo {
  let executable_name = std::env::current_exe()
    .ok()
    .and_then(|path| path.file_name().map(|name| name.to_string_lossy().to_string()));
  let is_portable = std::env::var("GROMMET_MARKS_PORTABLE")
    .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
    .unwrap_or(false)
    || executable_name
      .as_deref()
      .map(|name| {
        let lower = name.to_lowercase();
        lower.contains("portable")
      })
      .unwrap_or(false);

  AppRuntimeInfo {
    version: app.package_info().version.to_string(),
    executable_name,
    is_portable,
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![get_app_runtime_info])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
