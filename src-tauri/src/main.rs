// Programa de escritorio del Gestor de Comunidades: una ventana con la misma aplicación web,
// más acceso a los diálogos del sistema para guardar archivos y abrir documentos.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("no se ha podido iniciar el Gestor de Comunidades");
}
