mod pdf_marks;

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

/// Zapíše bajty na libovolnou cestu přístupnou OS – obchází fs scope pluginu.
/// Nutné pro ukládání na síťové/UNC disky a do složek mimo statický scope
/// (Dokumenty, Plocha…), kam plugin-fs writeFile zapsat nesmí.
#[tauri::command]
fn write_file_bytes(path: String, contents: Vec<u8>) -> Result<(), String> {
  if let Some(parent) = std::path::Path::new(&path).parent() {
    if !parent.as_os_str().is_empty() {
      std::fs::create_dir_all(parent).map_err(|e| format!("create_dir_all selhalo: {e}"))?;
    }
  }
  std::fs::write(&path, &contents).map_err(|e| format!("write selhalo: {e}"))
}

/// Ověří existenci souboru na libovolné cestě (pro strategii přepisu/suffixu).
#[tauri::command]
fn file_exists(path: String) -> bool {
  std::path::Path::new(&path).is_file()
}

/// Načte bajty z libovolné cesty přístupné OS – obchází fs scope pluginu.
/// Vrací efektivní binární odpověď (ArrayBuffer na straně JS).
#[tauri::command]
fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
  let bytes = std::fs::read(&path).map_err(|e| format!("read selhalo: {e}"))?;
  Ok(tauri::ipc::Response::new(bytes))
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
    .invoke_handler(tauri::generate_handler![
      get_app_runtime_info,
      write_file_bytes,
      file_exists,
      read_file_bytes,
      pdf_marks::add_grommet_marks_native
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
