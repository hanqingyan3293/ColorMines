//! Colour Mines desktop shell.
//!
//! Deliberately tiny: the whole game lives in the web bundle, which is the same
//! artefact the browser loads. There is no second implementation here — that was
//! the single most expensive mistake of the previous project.
//!
//! The only native code is file I/O for the data folder. `tauri-plugin-fs` was
//! tried first and refused every path even with a wide-open scope, so these
//! commands implement the small surface the store actually needs.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::Path;
use tauri::Manager;

/// Root of the Color Mines data folder.
#[tauri::command]
fn fs_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn fs_mkdir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("mkdir {}: {}", path, e))
}

#[tauri::command]
fn fs_read(path: String) -> Result<Option<String>, String> {
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("read {}: {}", path, e)),
    }
}

/// Safe write: temp -> verify -> replace, so the real file is never half-written.
#[tauri::command]
fn fs_write(path: String, text: String) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("mkdir {:?}: {}", parent, e))?;
        }
    }
    let tmp = format!("{}.tmp", path);
    fs::write(&tmp, &text).map_err(|e| format!("write {}: {}", tmp, e))?;
    let back = fs::read_to_string(&tmp).map_err(|e| format!("verify {}: {}", tmp, e))?;
    if back != text {
        let _ = fs::remove_file(&tmp);
        return Err("verify failed".into());
    }
    if target.exists() {
        fs::remove_file(target).map_err(|e| format!("remove {}: {}", path, e))?;
    }
    fs::rename(&tmp, target).map_err(|e| format!("rename -> {}: {}", path, e))?;
    Ok(())
}

#[tauri::command]
fn fs_remove(path: String) -> Result<(), String> {
    match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("remove {}: {}", path, e)),
    }
}

#[tauri::command]
fn fs_list(dir: String) -> Result<Vec<String>, String> {
    match fs::read_dir(&dir) {
        Ok(entries) => {
            let mut out = Vec::new();
            for entry in entries.flatten() {
                out.push(entry.file_name().to_string_lossy().to_string());
            }
            Ok(out)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("read_dir {}: {}", dir, e)),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            fs_data_dir, fs_mkdir, fs_read, fs_write, fs_remove, fs_list
        ])
        .run(tauri::generate_context!())
        .expect("failed to launch the Colour Mines window");
}
