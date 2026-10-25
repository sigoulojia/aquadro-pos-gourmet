use chrono::Local;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteConnectOptions, Row, SqliteConnection, Connection, SqlitePool};
use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RuntimePathsInfo {
    pub app_data_dir: String,
    pub database_path: String,
    pub logs_dir: String,
    pub backups_dir: String,
    pub config_dir: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupInfo {
    pub filename: String,
    pub filepath: String,
    pub size_bytes: u64,
    pub created_at: String,
    pub is_valid: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IntegrityReport {
    pub is_healthy: bool,
    pub checks: Vec<String>,
}

/// Resolves the application runtime directory structure
pub fn resolve_runtime_paths(app_handle: &AppHandle) -> Result<(PathBuf, PathBuf, PathBuf, PathBuf, PathBuf), String> {
    let app_data = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to resolve AppData directory: {}", e))?;
    
    let db_path = app_data.join("pizzeria_pos.db");
    let logs_dir = app_data.join("logs");
    let backups_dir = app_data.join("backups");
    let config_dir = app_data.join("config");

    Ok((app_data, db_path, logs_dir, backups_dir, config_dir))
}

/// Creates all required runtime directories on application startup
pub fn ensure_runtime_directories(app_handle: &AppHandle) -> Result<RuntimePathsInfo, String> {
    let (app_data, db_path, logs_dir, backups_dir, config_dir) = resolve_runtime_paths(app_handle)?;

    fs::create_dir_all(&app_data).map_err(|e| format!("Failed to create AppData directory: {}", e))?;
    fs::create_dir_all(&logs_dir).map_err(|e| format!("Failed to create logs directory: {}", e))?;
    fs::create_dir_all(&backups_dir).map_err(|e| format!("Failed to create backups directory: {}", e))?;
    fs::create_dir_all(&config_dir).map_err(|e| format!("Failed to create config directory: {}", e))?;

    Ok(RuntimePathsInfo {
        app_data_dir: app_data.display().to_string(),
        database_path: db_path.display().to_string(),
        logs_dir: logs_dir.display().to_string(),
        backups_dir: backups_dir.display().to_string(),
        config_dir: config_dir.display().to_string(),
    })
}

/// Verifies database integrity via PRAGMA integrity_check
pub async fn check_pool_integrity(pool: &SqlitePool) -> Result<IntegrityReport, String> {
    let rows = sqlx::query("PRAGMA integrity_check(10);")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to run integrity check: {}", e))?;

    let mut checks = Vec::new();
    let mut is_healthy = true;

    for row in rows {
        let result: String = row.try_get(0).unwrap_or_else(|_| "unknown".to_string());
        if result != "ok" {
            is_healthy = false;
        }
        checks.push(result);
    }

    Ok(IntegrityReport {
        is_healthy,
        checks,
    })
}

/// Checks the integrity of a standalone SQLite database file on disk
pub async fn check_file_integrity(db_file: &Path) -> Result<bool, String> {
    if !db_file.exists() {
        return Ok(false);
    }
    let db_url = format!("sqlite:{}?mode=ro", db_file.display().to_string().replace('\\', "/"));
    let options = SqliteConnectOptions::from_str(&db_url).map_err(|e| e.to_string())?;
    let mut conn = SqliteConnection::connect_with(&options).await.map_err(|e| e.to_string())?;

    let row = sqlx::query("PRAGMA quick_check(1);")
        .fetch_one(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    let result: String = row.try_get(0).unwrap_or_default();
    Ok(result == "ok")
}

/// Tauri Command: Get active runtime directories information
#[tauri::command]
pub fn get_runtime_paths(app_handle: tauri::AppHandle) -> Result<RuntimePathsInfo, String> {
    ensure_runtime_directories(&app_handle)
}

/// Tauri Command: Create an atomic database backup into backups/
#[tauri::command]
pub async fn create_database_backup(
    label: Option<String>,
    pool: tauri::State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
) -> Result<BackupInfo, String> {
    let (_, _, _, backups_dir, _) = resolve_runtime_paths(&app_handle)?;
    fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;

    let now = Local::now();
    let timestamp = now.format("%Y%m%d_%H%M%S").to_string();
    let clean_label = label
        .map(|l| {
            l.chars()
                .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
                .collect::<String>()
        })
        .unwrap_or_else(|| "manual".to_string());

    let filename = format!("backup_aquadro_{}_{}.db", timestamp, clean_label);
    let target_path = backups_dir.join(&filename);
    let target_str = target_path.display().to_string().replace('\\', "/");

    crate::logger::log_info("BACKUP", &format!("Starting atomic backup to: {}", target_str));

    // Execute SQLite VACUUM INTO for consistent online snapshot
    let query_str = format!("VACUUM INTO '{}';", target_str);
    sqlx::query(&query_str)
        .execute(&*pool)
        .await
        .map_err(|e| {
            crate::logger::log_error("BACKUP", &format!("VACUUM INTO failed: {}", e));
            format!("Backup creation failed: {}", e)
        })?;

    // Verify integrity of the backup
    let is_valid = check_file_integrity(&target_path).await.unwrap_or(false);
    let size_bytes = fs::metadata(&target_path).map(|m| m.len()).unwrap_or(0);

    crate::logger::log_info(
        "BACKUP",
        &format!("Backup created: {} ({} bytes, valid: {})", filename, size_bytes, is_valid),
    );

    Ok(BackupInfo {
        filename,
        filepath: target_str,
        size_bytes,
        created_at: now.to_rfc3339(),
        is_valid,
    })
}

/// Tauri Command: List all available backups
#[tauri::command]
pub async fn list_database_backups(app_handle: tauri::AppHandle) -> Result<Vec<BackupInfo>, String> {
    let (_, _, _, backups_dir, _) = resolve_runtime_paths(&app_handle)?;
    if !backups_dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();
    let entries = fs::read_dir(&backups_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("db") {
            let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            let size_bytes = metadata.len();
            let created_at = metadata
                .created()
                .or_else(|_| metadata.modified())
                .map(|t| chrono::DateTime::<Local>::from(t).to_rfc3339())
                .unwrap_or_else(|_| "".to_string());

            // Quick check
            let is_valid = check_file_integrity(&path).await.unwrap_or(false);

            backups.push(BackupInfo {
                filename,
                filepath: path.display().to_string().replace('\\', "/"),
                size_bytes,
                created_at,
                is_valid,
            });
        }
    }

    // Sort newest first
    backups.sort_by(|a, b| b.filename.cmp(&a.filename));
    Ok(backups)
}

/// Tauri Command: Verify active database health
#[tauri::command]
pub async fn verify_database_integrity(pool: tauri::State<'_, SqlitePool>) -> Result<IntegrityReport, String> {
    check_pool_integrity(&pool).await
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SaveReportResult {
    pub success: bool,
    pub filename: String,
    pub filepath: String,
    pub folderpath: String,
}

/// Resolves the dedicated "التقارير" directory
pub fn resolve_reports_dir(app_handle: &AppHandle) -> PathBuf {
    // 1. Program folder ./التقارير (directly in the current working directory)
    let local_dir = PathBuf::from("التقارير");
    if fs::create_dir_all(&local_dir).is_ok() {
        if let Ok(abs) = fs::canonicalize(&local_dir) {
            return abs;
        }
        return local_dir;
    }
    // 2. In AppData
    if let Ok((app_data, _, _, _, _)) = resolve_runtime_paths(app_handle) {
        let app_reports = app_data.join("التقارير");
        let _ = fs::create_dir_all(&app_reports);
        return app_reports;
    }
    PathBuf::from("التقارير")
}

/// Resolves the dedicated "سجلات_النشاط" directory
pub fn resolve_activity_logs_dir(app_handle: &AppHandle) -> PathBuf {
    // 1. Program folder ./سجلات_النشاط
    let local_dir = PathBuf::from("سجلات_النشاط");
    if fs::create_dir_all(&local_dir).is_ok() {
        if let Ok(abs) = fs::canonicalize(&local_dir) {
            return abs;
        }
        return local_dir;
    }
    // 2. In AppData
    if let Ok((app_data, _, _, _, _)) = resolve_runtime_paths(app_handle) {
        let app_logs = app_data.join("سجلات_النشاط");
        let _ = fs::create_dir_all(&app_logs);
        return app_logs;
    }
    PathBuf::from("سجلات_النشاط")
}

/// Helper to open a directory in the OS file manager
pub fn open_path_in_explorer(target_path: &Path) -> Result<bool, String> {
    if !target_path.exists() {
        let _ = fs::create_dir_all(target_path);
    }

    let path_str = target_path.display().to_string();

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Failed to open Windows Explorer: {}", e))?;
        return Ok(true);
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Failed to open Linux File Manager: {}", e))?;
        return Ok(true);
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Failed to open macOS Finder: {}", e))?;
        return Ok(true);
    }

    #[allow(unreachable_code)]
    Ok(false)
}

/// Tauri Command: Save a report file automatically into the dedicated "التقارير" folder
#[tauri::command]
pub fn save_report_file(
    app_handle: tauri::AppHandle,
    filename: String,
    content: String,
) -> Result<SaveReportResult, String> {
    let reports_dir = resolve_reports_dir(&app_handle);
    let _ = fs::create_dir_all(&reports_dir);

    // Also mirror to local ./التقارير if possible
    let _ = fs::create_dir_all("التقارير");
    let local_file = PathBuf::from("التقارير").join(&filename);
    let _ = fs::write(&local_file, content.as_bytes());

    let target_path = reports_dir.join(&filename);
    fs::write(&target_path, content.as_bytes())
        .map_err(|e| format!("Erreur lors de l'écriture du rapport: {}", e))?;

    let filepath_str = target_path.display().to_string().replace('\\', "/");
    let folderpath_str = reports_dir.display().to_string().replace('\\', "/");

    crate::logger::log_info("RAPPORT", &format!("Rapport sauvegardé automatiquement : {}", filepath_str));

    Ok(SaveReportResult {
        success: true,
        filename,
        filepath: filepath_str,
        folderpath: folderpath_str,
    })
}

/// Tauri Command: Open the "التقارير" folder directly on the computer
#[tauri::command]
pub fn open_reports_folder(app_handle: tauri::AppHandle) -> Result<String, String> {
    let reports_dir = resolve_reports_dir(&app_handle);
    let folder_str = reports_dir.display().to_string();
    open_path_in_explorer(&reports_dir)?;
    Ok(folder_str)
}

/// Tauri Command: Open the "سجلات_النشاط" folder directly on the computer
#[tauri::command]
pub fn open_logs_folder(app_handle: tauri::AppHandle) -> Result<String, String> {
    let logs_dir = resolve_activity_logs_dir(&app_handle);
    let folder_str = logs_dir.display().to_string();
    open_path_in_explorer(&logs_dir)?;
    Ok(folder_str)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UsageSessionInfo {
    pub id: String,
    pub name: String,
    pub folder_path: String,
    pub is_active: bool,
    pub created_at: String,
    pub reports_count: usize,
    pub logs_count: usize,
    pub has_backup: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateUsageSessionResult {
    pub success: bool,
    pub session_name: String,
    pub session_folder: String,
    pub archive_folder: Option<String>,
    pub message: String,
}

fn copy_dir_contents(src: &Path, dst: &Path) -> std::io::Result<usize> {
    if !src.exists() {
        return Ok(0);
    }
    fs::create_dir_all(dst)?;
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(src) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(file_name) = path.file_name() {
                    let dest_file = dst.join(file_name);
                    let _ = fs::copy(&path, &dest_file);
                    count += 1;
                }
            }
        }
    }
    Ok(count)
}

fn clear_dir_files(dir: &Path) {
    if dir.exists() {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let _ = fs::remove_file(path);
                }
            }
        }
    }
}

/// Resolves the dedicated "جلسات_الاستخدام" base directory
pub fn resolve_sessions_base_dir(app_handle: &AppHandle) -> PathBuf {
    let local_dir = PathBuf::from("جلسات_الاستخدام");
    if fs::create_dir_all(&local_dir).is_ok() {
        if let Ok(abs) = fs::canonicalize(&local_dir) {
            return abs;
        }
        return local_dir;
    }
    if let Ok((app_data, _, _, _, _)) = resolve_runtime_paths(app_handle) {
        let app_sessions = app_data.join("جلسات_الاستخدام");
        let _ = fs::create_dir_all(&app_sessions);
        return app_sessions;
    }
    PathBuf::from("جلسات_الاستخدام")
}

/// Resolves the dedicated "أرشيف_الاستخدامات_السابقة" directory
pub fn resolve_archives_base_dir(app_handle: &AppHandle) -> PathBuf {
    let local_dir = PathBuf::from("أرشيف_الاستخدامات_السابقة");
    if fs::create_dir_all(&local_dir).is_ok() {
        if let Ok(abs) = fs::canonicalize(&local_dir) {
            return abs;
        }
        return local_dir;
    }
    if let Ok((app_data, _, _, _, _)) = resolve_runtime_paths(app_handle) {
        let app_archives = app_data.join("أرشيف_الاستخدامات_السابقة");
        let _ = fs::create_dir_all(&app_archives);
        return app_archives;
    }
    PathBuf::from("أرشيف_الاستخدامات_السابقة")
}

/// Tauri Command: Create a brand new usage session folder and archive the previous usage completely
#[tauri::command]
pub async fn create_new_usage_session(
    session_name: String,
    archive_label: Option<String>,
    pool: tauri::State<'_, SqlitePool>,
    app_handle: tauri::AppHandle,
) -> Result<CreateUsageSessionResult, String> {
    let now = Local::now();
    let timestamp = now.format("%Y%m%d_%H%M%S").to_string();

    let archives_base = resolve_archives_base_dir(&app_handle);
    let sessions_base = resolve_sessions_base_dir(&app_handle);
    fs::create_dir_all(&archives_base).map_err(|e| e.to_string())?;
    fs::create_dir_all(&sessions_base).map_err(|e| e.to_string())?;

    // 1. ARCHIVAGE DU DOSSIER ACTUEL
    let clean_archive_name = archive_label
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| format!("أرشيف_{}", timestamp));

    let archive_dir = archives_base.join(&clean_archive_name);
    fs::create_dir_all(&archive_dir).map_err(|e| e.to_string())?;

    // a. Instantané de la base de données
    let db_archive_dir = archive_dir.join("قاعدة_البيانات");
    fs::create_dir_all(&db_archive_dir).map_err(|e| e.to_string())?;
    let db_snapshot_file = db_archive_dir.join("pizzeria_pos_snapshot.db");
    let db_snapshot_str = db_snapshot_file.display().to_string().replace('\\', "/");

    let query_str = format!("VACUUM INTO '{}';", db_snapshot_str);
    if let Err(e) = sqlx::query(&query_str).execute(&*pool).await {
        crate::logger::log_warn("ARCHIVE", &format!("Note: VACUUM INTO warning: {}", e));
    }

    // b. Copier tous les rapports actuels vers l'archive
    let reports_archive_dir = archive_dir.join("التقارير");
    let current_reports = resolve_reports_dir(&app_handle);
    let copied_reports = copy_dir_contents(&current_reports, &reports_archive_dir).unwrap_or(0);
    clear_dir_files(&current_reports);
    clear_dir_files(&PathBuf::from("التقارير"));

    // c. Copier tous les logs d'activité actuels vers l'archive
    let logs_archive_dir = archive_dir.join("سجلات_النشاط");
    let current_logs = resolve_activity_logs_dir(&app_handle);
    let copied_logs = copy_dir_contents(&current_logs, &logs_archive_dir).unwrap_or(0);
    clear_dir_files(&current_logs);
    clear_dir_files(&PathBuf::from("سجلات_النشاط"));

    // d. Fiche d'information de l'archive
    let archive_info = serde_json::json!({
        "archive_name": clean_archive_name,
        "archived_at": now.to_rfc3339(),
        "reports_archived": copied_reports,
        "logs_archived": copied_logs,
        "db_snapshot": db_snapshot_str,
        "status": "SEALED",
        "description": "تمت أرشفة وتجميد هذا الاستخدام السابق بالكامل لتجنب خلط البيانات"
    });
    let _ = fs::write(
        archive_dir.join("معلومات_الأرشيف.json"),
        serde_json::to_string_pretty(&archive_info).unwrap_or_default(),
    );

    // 2. CREATION DU NOUVEAU DOSSIER D'UTILISATION (NOUVELLE SESSION)
    let clean_session_name = if session_name.trim().is_empty() {
        format!("استخدام_جديد_{}", timestamp)
    } else {
        session_name.trim().replace('/', "_").replace('\\', "_")
    };

    let new_session_dir = sessions_base.join(&clean_session_name);
    fs::create_dir_all(&new_session_dir).map_err(|e| e.to_string())?;

    let session_reports = new_session_dir.join("التقارير");
    let session_logs = new_session_dir.join("سجلات_النشاط");
    let session_backups = new_session_dir.join("النسخ_الاحتياطية");
    let _ = fs::create_dir_all(&session_reports);
    let _ = fs::create_dir_all(&session_logs);
    let _ = fs::create_dir_all(&session_backups);

    let session_info = serde_json::json!({
        "id": format!("sess_{}", timestamp),
        "name": clean_session_name,
        "started_at": now.to_rfc3339(),
        "status": "ACTIVE",
        "folder_path": new_session_dir.display().to_string().replace('\\', "/")
    });
    let _ = fs::write(
        new_session_dir.join("معلومات_الاستخدام.json"),
        serde_json::to_string_pretty(&session_info).unwrap_or_default(),
    );

    crate::logger::log_info(
        "SESSION",
        &format!("Nouvelle session d'utilisation créée : {} | Archive : {}", clean_session_name, clean_archive_name)
    );

    // Ouvrir le nouveau dossier dans l'explorateur
    let _ = open_path_in_explorer(&new_session_dir);

    Ok(CreateUsageSessionResult {
        success: true,
        session_name: clean_session_name,
        session_folder: new_session_dir.display().to_string().replace('\\', "/"),
        archive_folder: Some(archive_dir.display().to_string().replace('\\', "/")),
        message: "تم إنشاء مجلد الاستخدام الجديد وأرشفة السابق بأمان".to_string(),
    })
}

/// Tauri Command: List all usage sessions (active and archived)
#[tauri::command]
pub fn list_usage_sessions(app_handle: tauri::AppHandle) -> Result<Vec<UsageSessionInfo>, String> {
    let mut sessions = Vec::new();
    let sessions_base = resolve_sessions_base_dir(&app_handle);
    let archives_base = resolve_archives_base_dir(&app_handle);

    // 1. Lire les sessions
    if sessions_base.exists() {
        if let Ok(entries) = fs::read_dir(&sessions_base) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                    let created_at = path.metadata()
                        .and_then(|m| m.created().or_else(|_| m.modified()))
                        .map(|t| chrono::DateTime::<Local>::from(t).to_rfc3339())
                        .unwrap_or_default();
                    let reports_count = path.join("التقارير").read_dir().map(|d| d.count()).unwrap_or(0);
                    let logs_count = path.join("سجلات_النشاط").read_dir().map(|d| d.count()).unwrap_or(0);

                    sessions.push(UsageSessionInfo {
                        id: format!("sess_{}", name),
                        name,
                        folder_path: path.display().to_string().replace('\\', "/"),
                        is_active: true,
                        created_at,
                        reports_count,
                        logs_count,
                        has_backup: true,
                    });
                }
            }
        }
    }

    // 2. Lire les archives précédentes
    if archives_base.exists() {
        if let Ok(entries) = fs::read_dir(&archives_base) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                    let created_at = path.metadata()
                        .and_then(|m| m.created().or_else(|_| m.modified()))
                        .map(|t| chrono::DateTime::<Local>::from(t).to_rfc3339())
                        .unwrap_or_default();
                    let reports_count = path.join("التقارير").read_dir().map(|d| d.count()).unwrap_or(0);
                    let logs_count = path.join("سجلات_النشاط").read_dir().map(|d| d.count()).unwrap_or(0);
                    let has_backup = path.join("قاعدة_البيانات").exists();

                    sessions.push(UsageSessionInfo {
                        id: format!("arch_{}", name),
                        name,
                        folder_path: path.display().to_string().replace('\\', "/"),
                        is_active: false,
                        created_at,
                        reports_count,
                        logs_count,
                        has_backup,
                    });
                }
            }
        }
    }

    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(sessions)
}

/// Tauri Command: Open any arbitrary folder path in the OS file explorer
#[tauri::command]
pub fn open_folder_path(path: String) -> Result<bool, String> {
    open_path_in_explorer(Path::new(&path))
}


