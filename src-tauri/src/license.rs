// Aquadro POS Algérie V2 — Module Cryptographique de Licence & Protection Anti-Piratage (Aegis License Shield)
// Verrouillage matériel (HWID), signature HMAC-SHA256, protection contre le recul d'horloge et filtrage strict du kernel Rust.

use chrono::{Local, NaiveDate};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

type HmacSha256 = Hmac<Sha256>;

// Clé secrète Maître du Développeur (obfusquée par XOR pour résister à l'analyse binaire / extraction de chaînes)
const VENDOR_SECRET_OBFUSCATED: [u8; 36] = [
    0x41, 0x51, 0x55, 0x41, 0x44, 0x52, 0x4F, 0x5F,
    0x47, 0x4F, 0x55, 0x52, 0x4D, 0x45, 0x54, 0x5F,
    0x4D, 0x41, 0x53, 0x54, 0x45, 0x52, 0x5F, 0x4B,
    0x45, 0x59, 0x5F, 0x32, 0x30, 0x32, 0x36, 0x5F,
    0x44, 0x5A, 0x21, 0x21
];
const VENDOR_XOR_MASK: u8 = 0x55;

fn get_master_vendor_key() -> Vec<u8> {
    VENDOR_SECRET_OBFUSCATED.iter().map(|b| b ^ VENDOR_XOR_MASK).collect()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicensePayload {
    pub store_name: String,
    pub hwid: String,
    pub license_type: String, // "LIFETIME" | "ANNUAL" | "TRIAL"
    pub issued_at: String,
    pub expires_at: String,
    pub tier: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicenseStatusResponse {
    pub is_licensed: bool,
    pub hwid: String,
    pub store_name: Option<String>,
    pub license_type: Option<String>,
    pub expires_at: Option<String>,
    pub days_remaining: Option<i64>,
    pub is_lifetime: bool,
    pub error: Option<String>,
    // Période d'essai Démo 7 jours
    pub is_trial_active: bool,
    pub is_trial_expired: bool,
    pub trial_days_remaining: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActivationResult {
    pub success: bool,
    pub message: String,
    pub status: LicenseStatusResponse,
}

/// Calcule l'empreinte matérielle unique et non-falsifiable de cette machine (HWID)
pub fn get_hardware_fingerprint() -> String {
    let mut raw_ids: Vec<String> = Vec::new();

    // 1. Sur Linux : lire /etc/machine-id ou /var/lib/dbus/machine-id
    #[cfg(target_os = "linux")]
    {
        if let Ok(id) = fs::read_to_string("/etc/machine-id") {
            let t = id.trim();
            if !t.is_empty() {
                raw_ids.push(t.to_string());
            }
        }
        if raw_ids.is_empty() {
            if let Ok(id) = fs::read_to_string("/var/lib/dbus/machine-id") {
                let t = id.trim();
                if !t.is_empty() {
                    raw_ids.push(t.to_string());
                }
            }
        }
    }

    // 2. Sur Windows : MachineGuid du registre ou WMIC csproduct
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("reg")
            .args(&["query", "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("MachineGuid") {
                    if let Some(guid) = line.split_whitespace().last() {
                        raw_ids.push(guid.to_string());
                    }
                }
            }
        }
        if raw_ids.is_empty() {
            if let Ok(output) = std::process::Command::new("wmic")
                .args(&["csproduct", "get", "uuid"])
                .output()
            {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    let t = line.trim();
                    if !t.is_empty() && !t.eq_ignore_ascii_case("uuid") {
                        raw_ids.push(t.to_string());
                        break;
                    }
                }
            }
        }
    }

    // 3. Fallbacks et complément d'environnement
    if let Ok(host) = std::env::var("HOSTNAME").or_else(|_| std::env::var("COMPUTERNAME")) {
        raw_ids.push(host);
    }
    if let Ok(user) = std::env::var("USER").or_else(|_| std::env::var("USERNAME")) {
        raw_ids.push(user);
    }

    if raw_ids.is_empty() {
        raw_ids.push("AQUADRO_GENERIC_MACHINE_HWID".to_string());
    }

    let combined = raw_ids.join("::");
    let mut hasher = Sha256::new();
    hasher.update(b"AQUADRO_AEGIS_HWID_SALT_V2_2026_@#!");
    hasher.update(combined.as_bytes());
    let digest = hasher.finalize();
    let hex_full = hex::encode(digest).to_uppercase();

    // Formater en format lisible : AQ-XXXX-XXXX-XXXX-XXXX (20 caractères)
    let s = &hex_full[0..16];
    format!("AQ-{}-{}-{}-{}", &s[0..4], &s[4..8], &s[8..12], &s[12..16])
}

fn get_canonical_representation(payload: &LicensePayload) -> String {
    format!(
        "{}:{}:{}:{}:{}",
        payload.store_name.trim(),
        payload.hwid.trim().to_uppercase(),
        payload.license_type.trim().to_uppercase(),
        payload.expires_at.trim(),
        payload.tier.trim().to_uppercase()
    )
}

fn compute_hmac_signature(canonical: &str) -> String {
    let key = get_master_vendor_key();
    let mut mac = HmacSha256::new_from_slice(&key).expect("HMAC accepts any key size");
    mac.update(canonical.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

/// Décode et valide cryptographiquement une clé de licence
pub fn verify_license_string(license_str: &str, current_hwid: &str) -> Result<LicensePayload, String> {
    let clean = license_str.trim();
    let key_body = clean.strip_prefix("AQLIC-").unwrap_or(clean);

    let parts: Vec<&str> = key_body.split('.').collect();
    if parts.len() != 2 {
        return Err("Format de clé de licence invalide (doit contenir payload.signature)".to_string());
    }

    let b64_payload = parts[0];
    let expected_sig = parts[1].trim();

    // Décodage base64 URL safe
    let mut padded_b64 = b64_payload.to_string();
    while padded_b64.len() % 4 != 0 {
        padded_b64.push('=');
    }
    // Remplacer les caractères url-safe si présents
    let std_b64 = padded_b64.replace('-', "+").replace('_', "/");
    let json_bytes = match base64_decode(&std_b64) {
        Ok(b) => b,
        Err(e) => return Err(format!("Échec de décodage de la clé : {}", e)),
    };

    let payload: LicensePayload = serde_json::from_slice(&json_bytes)
        .map_err(|e| format!("Données de licence corrompues : {}", e))?;

    // 1. Vérification de la signature cryptographique
    let canonical = get_canonical_representation(&payload);
    let computed_sig = compute_hmac_signature(&canonical);

    if !constant_time_compare(&computed_sig, expected_sig) {
        return Err("Signature cryptographique invalide : clé falsifiée ou corrompue".to_string());
    }

    // 2. Vérification stricte du verrouillage matériel (HWID)
    if payload.hwid.trim().to_uppercase() != current_hwid.trim().to_uppercase() {
        return Err(format!(
            "Cette clé est liée à une autre machine (HWID {}), impossible de l'utiliser sur ce PC ({})",
            payload.hwid, current_hwid
        ));
    }

    // 3. Vérification de la date d'expiration
    let is_lifetime = payload.license_type.eq_ignore_ascii_case("LIFETIME")
        || payload.expires_at.starts_with("2099")
        || payload.expires_at.starts_with("9999");

    if !is_lifetime {
        if let Ok(exp_date) = NaiveDate::parse_from_str(payload.expires_at.trim(), "%Y-%m-%d") {
            let today = Local::now().date_naive();
            if today > exp_date {
                return Err(format!("Cette licence a expiré le {}", payload.expires_at));
            }
        }
    }

    Ok(payload)
}

fn constant_time_compare(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.bytes().zip(b.bytes()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    // Décodage base64 standard simple et rapide
    const TABLE: [i8; 256] = {
        let mut t = [-1i8; 256];
        let chars = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut i = 0usize;
        while i < 64 {
            t[chars[i] as usize] = i as i8;
            i += 1;
        }
        t
    };

    let bytes = input.as_bytes();
    let mut out = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;

    for &b in bytes {
        if b == b'=' {
            break;
        }
        let val = TABLE[b as usize];
        if val < 0 {
            continue;
        }
        buf = (buf << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }

    Ok(out)
}

fn resolve_license_file_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app_handle.path().app_data_dir()
        .map_err(|e| format!("Impossible de résoudre AppData: {}", e))?;
    let _ = fs::create_dir_all(&app_data);
    Ok(app_data.join("aquadro_pos.lic"))
}

/// Sauvegarde le timestamp actuel pour détecter le recul d'horloge système
fn update_anti_tamper_clock(app_handle: &AppHandle) {
    if let Ok(app_data) = app_handle.path().app_data_dir() {
        let clock_file = app_data.join(".sys_clock.dat");
        let now_sec = Local::now().timestamp();
        let _ = fs::write(&clock_file, now_sec.to_string());
    }
}

/// Vérifie qu'aucun retour en arrière d'horloge n'a été fait
fn verify_clock_integrity(app_handle: &AppHandle) -> Result<(), String> {
    if let Ok(app_data) = app_handle.path().app_data_dir() {
        let clock_file = app_data.join(".sys_clock.dat");
        if clock_file.exists() {
            if let Ok(content) = fs::read_to_string(&clock_file) {
                if let Ok(last_sec) = content.trim().parse::<i64>() {
                    let now_sec = Local::now().timestamp();
                    // Si l'horloge a été reculée de plus de 24h
                    if now_sec < (last_sec - 86400) {
                        return Err("ERR_CLOCK_TAMPERED: تم اكتشاف تلاعب بساعة الجهاز لتمديد صلاحية الترخيص. الرجاء ضبط تاريخ ووقت الحاسوب الصحيح.".to_string());
                    }
                }
            }
        }
    }
    update_anti_tamper_clock(app_handle);
    Ok(())
}

const TRIAL_DURATION_SECONDS: i64 = 7 * 86400; // 7 jours = 604 800 secondes

fn compute_trial_signature(hwid: &str, timestamp: i64) -> String {
    let canonical = format!("AQUADRO_TRIAL_V2:{}:{}", hwid.trim().to_uppercase(), timestamp);
    let key = get_master_vendor_key();
    let mut mac = HmacSha256::new_from_slice(&key).expect("HMAC accepts any key size");
    mac.update(canonical.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

fn get_redundant_trial_file_paths(app_handle: &AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // 1. AppData de l'application
    if let Ok(app_data) = app_handle.path().app_data_dir() {
        paths.push(app_data.join(".aegis_trial.dat"));
    }

    // 2. Dossiers persistants du système d'exploitation
    #[cfg(target_os = "windows")]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            paths.push(PathBuf::from(local).join(".aquadro_hwid_trial.dat"));
        }
        if let Ok(profile) = std::env::var("USERPROFILE") {
            paths.push(PathBuf::from(profile).join(".aquadro_sys_clock.sys"));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = std::env::var("HOME") {
            paths.push(PathBuf::from(&home).join(".local/share/.aquadro_trial.dat"));
            paths.push(PathBuf::from(&home).join(".config/.aquadro_hwid_trial.dat"));
        }
    }

    paths
}

/// Résout ou initialise le premier horodatage d'essai pour ce HWID avec protection anti-réinstallation
fn resolve_or_init_trial_start(app_handle: &AppHandle, current_hwid: &str) -> (i64, bool) {
    let paths = get_redundant_trial_file_paths(app_handle);
    let mut detected_timestamps: Vec<i64> = Vec::new();

    for path in &paths {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(path) {
                let parts: Vec<&str> = content.trim().split(':').collect();
                if parts.len() == 3 {
                    if let Ok(ts) = parts[0].parse::<i64>() {
                        let token_hwid = parts[1].trim();
                        let token_sig = parts[2].trim();
                        if token_hwid.eq_ignore_ascii_case(current_hwid) {
                            let expected_sig = compute_trial_signature(current_hwid, ts);
                            if constant_time_compare(&expected_sig, token_sig) {
                                detected_timestamps.push(ts);
                            }
                        }
                    }
                }
            }
        }
    }

    let now_sec = Local::now().timestamp();

    if let Some(&oldest_ts) = detected_timestamps.iter().min() {
        // Le commerçant a déjà lancé un essai par le passé.
        // Synchroniser tous les emplacements redondants
        let sig = compute_trial_signature(current_hwid, oldest_ts);
        let record = format!("{}:{}:{}", oldest_ts, current_hwid, sig);
        for path in &paths {
            if !path.exists() {
                if let Some(parent) = path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::write(path, &record);
            }
        }
        (oldest_ts, false)
    } else {
        // Premier lancement absolu sur ce PC : Création du marqueur de démo 7 jours
        let sig = compute_trial_signature(current_hwid, now_sec);
        let record = format!("{}:{}:{}", now_sec, current_hwid, sig);
        for path in &paths {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(path, &record);
        }
        (now_sec, true)
    }
}

/// Commande Tauri : Obtenir le statut actuel de la licence et le HWID
#[tauri::command]
pub fn get_license_status(app_handle: tauri::AppHandle) -> Result<LicenseStatusResponse, String> {
    let current_hwid = get_hardware_fingerprint();

    // 1. Calcul de la période d'essai Demo 7 jours
    let (trial_start_ts, _) = resolve_or_init_trial_start(&app_handle, &current_hwid);
    let now_sec = Local::now().timestamp();
    let elapsed_sec = now_sec - trial_start_ts;

    let (is_trial_active, is_trial_expired, trial_days_remaining) = if elapsed_sec < 0 {
        // Tentative de recul d'horloge avant le début de l'essai
        (false, true, 0)
    } else if elapsed_sec >= TRIAL_DURATION_SECONDS {
        (false, true, 0)
    } else {
        let remaining_secs = TRIAL_DURATION_SECONDS - elapsed_sec;
        let days = (remaining_secs + 86399) / 86400;
        (true, false, days)
    };

    // 2. Vérifier l'intégrité de l'horloge
    if let Err(e) = verify_clock_integrity(&app_handle) {
        return Ok(LicenseStatusResponse {
            is_licensed: false,
            hwid: current_hwid,
            store_name: None,
            license_type: None,
            expires_at: None,
            days_remaining: None,
            is_lifetime: false,
            error: Some(e),
            is_trial_active: false,
            is_trial_expired: true,
            trial_days_remaining: 0,
        });
    }

    // 3. Tenter de lire le fichier de licence sauvegardé
    let license_path = match resolve_license_file_path(&app_handle) {
        Ok(p) => p,
        Err(_) => {
            return Ok(LicenseStatusResponse {
                is_licensed: false,
                hwid: current_hwid,
                store_name: None,
                license_type: None,
                expires_at: None,
                days_remaining: None,
                is_lifetime: false,
                error: Some("Fichier de licence introuvable".to_string()),
                is_trial_active,
                is_trial_expired,
                trial_days_remaining,
            });
        }
    };

    if !license_path.exists() {
        return Ok(LicenseStatusResponse {
            is_licensed: false,
            hwid: current_hwid,
            store_name: None,
            license_type: None,
            expires_at: None,
            days_remaining: None,
            is_lifetime: false,
            error: None,
            is_trial_active,
            is_trial_expired,
            trial_days_remaining,
        });
    }

    let key_content = match fs::read_to_string(&license_path) {
        Ok(c) => c,
        Err(e) => {
            return Ok(LicenseStatusResponse {
                is_licensed: false,
                hwid: current_hwid,
                store_name: None,
                license_type: None,
                expires_at: None,
                days_remaining: None,
                is_lifetime: false,
                error: Some(format!("Erreur lecture licence : {}", e)),
                is_trial_active,
                is_trial_expired,
                trial_days_remaining,
            });
        }
    };

    match verify_license_string(&key_content, &current_hwid) {
        Ok(payload) => {
            let is_lifetime = payload.license_type.eq_ignore_ascii_case("LIFETIME")
                || payload.expires_at.starts_with("2099")
                || payload.expires_at.starts_with("9999");

            let days_remaining = if is_lifetime {
                Some(36500)
            } else if let Ok(exp_date) = NaiveDate::parse_from_str(payload.expires_at.trim(), "%Y-%m-%d") {
                let today = Local::now().date_naive();
                Some((exp_date - today).num_days())
            } else {
                None
            };

            Ok(LicenseStatusResponse {
                is_licensed: true,
                hwid: current_hwid,
                store_name: Some(payload.store_name),
                license_type: Some(payload.license_type),
                expires_at: Some(payload.expires_at),
                days_remaining,
                is_lifetime,
                error: None,
                is_trial_active: false,
                is_trial_expired: false,
                trial_days_remaining: 0,
            })
        }
        Err(err) => Ok(LicenseStatusResponse {
            is_licensed: false,
            hwid: current_hwid,
            store_name: None,
            license_type: None,
            expires_at: None,
            days_remaining: None,
            is_lifetime: false,
            error: Some(err),
            is_trial_active,
            is_trial_expired,
            trial_days_remaining,
        }),
    }
}

/// Commande Tauri : Activer une nouvelle clé de licence
#[tauri::command]
pub fn activate_license_key(
    key: String,
    app_handle: tauri::AppHandle,
) -> Result<ActivationResult, String> {
    let current_hwid = get_hardware_fingerprint();

    // 1. Valider la clé
    let payload = verify_license_string(&key, &current_hwid)?;

    // 2. Sauvegarder dans le fichier de licence
    let license_path = resolve_license_file_path(&app_handle)?;
    fs::write(&license_path, key.trim())
        .map_err(|e| format!("Échec d'enregistrement de la licence : {}", e))?;

    update_anti_tamper_clock(&app_handle);

    let is_lifetime = payload.license_type.eq_ignore_ascii_case("LIFETIME")
        || payload.expires_at.starts_with("2099");

    let days_remaining = if is_lifetime {
        Some(36500)
    } else if let Ok(exp_date) = NaiveDate::parse_from_str(payload.expires_at.trim(), "%Y-%m-%d") {
        let today = Local::now().date_naive();
        Some((exp_date - today).num_days())
    } else {
        None
    };

    crate::logger::log_info(
        "LICENCE",
        &format!("Licence activée avec succès pour le magasin : {} (Type: {})", payload.store_name, payload.license_type),
    );

    Ok(ActivationResult {
        success: true,
        message: format!("تم تنشيط البرنامج بنجاح لمتجر : {}", payload.store_name),
        status: LicenseStatusResponse {
            is_licensed: true,
            hwid: current_hwid,
            store_name: Some(payload.store_name),
            license_type: Some(payload.license_type),
            expires_at: Some(payload.expires_at),
            days_remaining,
            is_lifetime,
            error: None,
            is_trial_active: false,
            is_trial_expired: false,
            trial_days_remaining: 0,
        },
    })
}

/// Verrou de sécurité au niveau du Kernel Rust : bloque immédiatement si non licencié et période d'essai expirée
pub fn ensure_license_active_or_die(app_handle: &AppHandle) -> Result<(), String> {
    let status = get_license_status(app_handle.clone())?;
    if status.is_licensed {
        return Ok(());
    }
    if status.is_trial_active {
        return Ok(());
    }
    if status.is_trial_expired {
        return Err(format!(
            "ERR_TRIAL_EXPIRED: انتهت فترة التجربة المجانية (7 أيام) لهذا الجهاز (HWID: {}). يرجى إدخال مفتاح ترخيص رسمي لمتابعة استخدام البرنامج.",
            status.hwid
        ));
    }
    Err(format!(
        "ERR_LICENSE_LOCKED: النسخة غير منشطة على هذا الحاسوب (HWID: {}). يرجى إدخال مفتاح ترخيص صالح.",
        status.hwid
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hwid_generation_format() {
        let hwid = get_hardware_fingerprint();
        assert!(hwid.starts_with("AQ-"));
        assert_eq!(hwid.len(), 22); // AQ-XXXX-XXXX-XXXX-XXXX (3 + 4*4 + 3 = 22)
        let parts: Vec<&str> = hwid.split('-').collect();
        assert_eq!(parts.len(), 5);
        assert_eq!(parts[0], "AQ");
        assert_eq!(parts[1].len(), 4);
        assert_eq!(parts[2].len(), 4);
        assert_eq!(parts[3].len(), 4);
        assert_eq!(parts[4].len(), 4);
    }

    #[test]
    fn test_valid_license_verification_cross_platform() {
        let hwid = "AQ-1111-2222-3333-4444";
        // Key generated by tools/keygen.py for "Pizzeria Test" and HWID "AQ-1111-2222-3333-4444"
        let key = "AQLIC-eyJzdG9yZV9uYW1lIjoiUGl6emVyaWEgVGVzdCIsImh3aWQiOiJBUS0xMTExLTIyMjItMzMzMy00NDQ0IiwibGljZW5zZV90eXBlIjoiTElGRVRJTUUiLCJpc3N1ZWRfYXQiOiIyMDI2LTEwLTI1IiwiZXhwaXJlc19hdCI6IjIwOTktMTItMzEiLCJ0aWVyIjoiUFJPX0dPVVJNRVQifQ.1066e38405d139b9a252e5c76fc5f7341b396ec5fb3be5b8225c12b23b393105";

        let res = verify_license_string(key, hwid);
        assert!(res.is_ok(), "Expected valid license verification, got: {:?}", res.err());
        let payload = res.unwrap();
        assert_eq!(payload.store_name, "Pizzeria Test");
        assert_eq!(payload.hwid, "AQ-1111-2222-3333-4444");
        assert_eq!(payload.license_type, "LIFETIME");
    }

    #[test]
    fn test_tampered_signature_rejected() {
        let hwid = "AQ-1111-2222-3333-4444";
        // Signature tampered by changing the last character '5' to '0'
        let tampered_key = "AQLIC-eyJzdG9yZV9uYW1lIjoiUGl6emVyaWEgVGVzdCIsImh3aWQiOiJBUS0xMTExLTIyMjItMzMzMy00NDQ0IiwibGljZW5zZV90eXBlIjoiTElGRVRJTUUiLCJpc3N1ZWRfYXQiOiIyMDI2LTEwLTI1IiwiZXhwaXJlc19hdCI6IjIwOTktMTItMzEiLCJ0aWVyIjoiUFJPX0dPVVJNRVQifQ.1066e38405d139b9a252e5c76fc5f7341b396ec5fb3be5b8225c12b23b393100";

        let res = verify_license_string(tampered_key, hwid);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Signature cryptographique invalide"));
    }

    #[test]
    fn test_mismatched_hwid_rejected() {
        let different_hwid = "AQ-9999-8888-7777-6666";
        // Valid signature for AQ-1111-2222-3333-4444
        let key = "AQLIC-eyJzdG9yZV9uYW1lIjoiUGl6emVyaWEgVGVzdCIsImh3aWQiOiJBUS0xMTExLTIyMjItMzMzMy00NDQ0IiwibGljZW5zZV90eXBlIjoiTElGRVRJTUUiLCJpc3N1ZWRfYXQiOiIyMDI2LTEwLTI1IiwiZXhwaXJlc19hdCI6IjIwOTktMTItMzEiLCJ0aWVyIjoiUFJPX0dPVVJNRVQifQ.1066e38405d139b9a252e5c76fc5f7341b396ec5fb3be5b8225c12b23b393105";

        let res = verify_license_string(key, different_hwid);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Cette clé est liée à une autre machine"));
    }

    #[test]
    fn test_trial_signature_validation() {
        let hwid = "AQ-1111-2222-3333-4444";
        let now = 1730000000i64;
        let sig = compute_trial_signature(hwid, now);
        let expected = compute_trial_signature(hwid, now);
        assert_eq!(sig, expected);
        let tampered = compute_trial_signature("AQ-9999-0000-1111-2222", now);
        assert_ne!(sig, tampered);
    }
}
