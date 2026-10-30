pub mod migrations;
pub mod db;
pub mod models;
pub mod commands;
pub mod auth;
pub mod repo;
pub mod logger;
pub mod runtime;
pub mod printer_hardware;
pub mod license;
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
pub struct TerminalInfo {
    pub os: String,
    pub hostname: String,
    pub app_version: String,
}

// Native command to trigger raw thermal printer ESC/POS commands
#[tauri::command]
fn raw_print_receipt(content: String, printer_name: Option<String>) -> Result<String, String> {
    printer_hardware::print_raw_receipt(content, printer_name)
}

// Native command to print raster ESC/POS monochrome image
#[tauri::command]
fn raw_print_image(
    data: Vec<u8>,
    width: u32,
    height: u32,
    printer_name: Option<String>,
    feed_lines: Option<u8>,
    cut: Option<bool>,
) -> Result<String, String> {
    printer_hardware::print_raster_image(data, width, height, printer_name, feed_lines, cut)
}

// Native command to fire RJ11 drawer kick pulse (ESC p 0 25 250)
#[tauri::command]
fn open_cash_drawer(pin: Option<u8>, printer_name: Option<String>) -> Result<printer_hardware::DrawerKickResult, String> {
    printer_hardware::trigger_cash_drawer(pin, printer_name)
}

#[tauri::command]
fn list_hardware_printers() -> Result<Vec<printer_hardware::HardwareDeviceInfo>, String> {
    Ok(printer_hardware::scan_available_printers())
}

#[tauri::command]
fn get_terminal_info() -> Result<TerminalInfo, String> {
    Ok(TerminalInfo {
        os: std::env::consts::OS.to_string(),
        hostname: std::env::var("COMPUTERNAME")
            .unwrap_or_else(|_| "ApexPOS-Terminal-01".to_string()),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                match db::init_db(&app_handle).await {
                    Ok(pool) => {
                        app_handle.manage(pool);
                    }
                    Err(e) => {
                        crate::logger::log_error("STARTUP", &format!("Fatal error initializing database: {}", e));
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            raw_print_receipt,
            raw_print_image,
            open_cash_drawer,
            list_hardware_printers,
            get_terminal_info,
            commands::process_checkout,
            auth::authenticate_user,
            auth::verify_session,
            auth::logout_user,
            auth::setup_db_secret,
            auth::verify_danger_zone,
            auth::check_setup_status,
            auth::complete_setup,
            auth::hash_new_pin,
            auth::verify_pin_credential,
            auth::get_users,
            auth::create_user,
            auth::update_user_pin,
            auth::deactivate_user,
            auth::get_store,
            auth::update_store,
            logger::log_event,
            logger::get_recent_logs,
            runtime::get_runtime_paths,
            runtime::create_database_backup,
            runtime::list_database_backups,
            runtime::verify_database_integrity,
            runtime::restore_json_backup_atomic,
            runtime::save_report_file,
            runtime::open_reports_folder,
            runtime::open_logs_folder,
            runtime::create_new_usage_session,
            runtime::list_usage_sessions,
            runtime::open_folder_path,
            runtime::get_active_session_info,
            runtime::delete_archived_session,
            license::get_license_status,
            license::activate_license_key
        ])
        .build(tauri::generate_context!())
        .expect("error while building Aquadro POS application");

    app.run(|_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            crate::logger::log_info("SHUTDOWN", "Aquadro POS application terminated cleanly.");
        }
    });
}

#[cfg(test)]
mod updater_tests {
    use minisign_verify::{PublicKey, Signature};

    const PUB_KEY_B64: &str = "RWSnPZ6XwPQgyB/VdPrja08/v72dR1BkNfnMooDInFjV4+wNJ8Bt53ov";
    const VALID_SIG: &str = "untrusted comment: signature from tauri secret key\nRUSnPZ6XwPQgyJmj/vIpkRDol1AfDYNqMFoHFs2w6SSTl7dFbUloYXsLgB2NZrhS63ZMZ3BnCXZDxcLJl1wfUlyChSfWnwv7Ogw=\ntrusted comment: timestamp:1791562663\tfile:AquadroPOS_1.0.1_x64-setup.nsis.zip\tversion:1.0.1\na7aw04qjfUcnkSiE3D+jdJudqMCpwI/1Pdjj3QEH3UZsHLSlrV7pfLkAd5E/oOVNpUjlb8JN3Q0Qmd0/uwzICA==\n";
    const ARTIFACT_BYTES: &[u8] = b"PK_TEST_DUMMY_ZIP_CONTENT_AQUADRO_POS_V1_0_1";

    #[test]
    fn test_signature_verification_success() {
        let pk = PublicKey::from_base64(PUB_KEY_B64).expect("Valid public key");
        let sig = Signature::decode(VALID_SIG).expect("Valid signature string");
        assert!(pk.verify(ARTIFACT_BYTES, &sig, false).is_ok(), "Signature must be valid");
    }

    #[test]
    fn test_tampered_payload_rejected() {
        let pk = PublicKey::from_base64(PUB_KEY_B64).expect("Valid public key");
        let sig = Signature::decode(VALID_SIG).expect("Valid signature string");
        let tampered_bytes = b"TAMPERED_INJECTED_MALICIOUS_PAYLOAD";
        assert!(pk.verify(tampered_bytes, &sig, false).is_err(), "Tampered payload must be rejected");
    }

    #[test]
    fn test_corrupted_signature_rejected() {
        let pk = PublicKey::from_base64(PUB_KEY_B64).expect("Valid public key");
        let corrupted_sig_str = VALID_SIG.replace("a7aw04", "000000");
        let sig = Signature::decode(&corrupted_sig_str).expect("Decode structure");
        assert!(pk.verify(ARTIFACT_BYTES, &sig, false).is_err(), "Corrupted signature must fail verification");
    }
}

