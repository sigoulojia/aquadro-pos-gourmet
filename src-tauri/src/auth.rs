    use argon2::{
        password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
        Argon2,
    };
    use chrono::{DateTime, Utc};
    use keyring::Entry;
    use lazy_static::lazy_static;
    use rand::{distributions::Alphanumeric, Rng};
    use serde::{Deserialize, Serialize};
    use sha2::{Digest, Sha256};
    use sqlx::{FromRow, SqlitePool};
    use std::collections::HashMap;
    use std::fs;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    #[derive(Debug, Serialize, Deserialize, Clone, FromRow)]
    pub struct SafeUser {
        pub id: String,
        pub name: String,
        pub role: String,
        pub store_id: Option<String>,
    }

    #[derive(Debug, Clone)]
    pub struct Session {
        pub token: String,
        pub user: SafeUser,
        pub expires_at: DateTime<Utc>,
    }

    #[derive(Debug, Serialize, Deserialize)]
    pub struct SessionResponse {
        pub token: String,
        pub user: SafeUser,
    }

    lazy_static! {
        static ref SESSION_STORE: Arc<RwLock<HashMap<String, Session>>> = Arc::new(RwLock::new(HashMap::new()));
        static ref RATE_LIMIT: Arc<RwLock<HashMap<String, (u32, DateTime<Utc>)>>> = Arc::new(RwLock::new(HashMap::new()));
    }

    fn generate_opaque_token() -> String {
        rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(64)
            .map(char::from)
            .collect()
    }

    pub fn validate_new_pin_backend(pin: &str) -> Result<(), String> {
        let trimmed = pin.trim();
        if trimmed.len() < 4 || trimmed.len() > 8 {
            return Err("Le code PIN doit comporter entre 4 et 8 chiffres.".to_string());
        }
        if !trimmed.chars().all(|c| c.is_ascii_digit()) {
            return Err("Le code PIN ne doit contenir que des chiffres.".to_string());
        }
        const BLOCKED_PINS: &[&str] = &[
            "0000", "1111", "2222", "3333", "4444",
            "5555", "6666", "7777", "8888", "9999",
            "1234", "4321", "2345", "5432", "3456",
            "6543", "4567", "7654", "5678", "8765",
            "6789", "9876", "0123", "3210",
            "12345", "123456", "1234567", "12345678",
            "00000", "000000", "11111", "111111",
        ];
        if BLOCKED_PINS.contains(&trimmed) {
            return Err("Ce code PIN est trop simple ou par défaut. Veuillez choisir une combinaison sécurisée.".to_string());
        }
        Ok(())
    }

    pub async fn hash_pin(pin: &str) -> Result<String, String> {
        validate_new_pin_backend(pin)?;
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(pin.trim().as_bytes(), &salt)
            .map_err(|e| format!("Erreur de hachage: {}", e))?
            .to_string();
        Ok(password_hash)
    }

    fn is_valid_salted_sha256_format(hash: &str) -> Option<(&str, &str)> {
        let mut parts = hash.split(':');
        let salt = parts.next()?;
        let digest_hex = parts.next()?;
        if parts.next().is_some() {
            return None;
        }
        if salt.len() < 8 || salt.len() > 64 {
            return None;
        }
        if !salt.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
            return None;
        }
        if digest_hex.len() != 64 || !digest_hex.chars().all(|c| c.is_ascii_hexdigit()) {
            return None;
        }
        Some((salt, digest_hex))
    }

    fn constant_time_eq_hex(a: &str, b: &str) -> bool {
        if a.len() != b.len() {
            return false;
        }
        let mut diff: u8 = 0;
        for (byte_a, byte_b) in a.bytes().zip(b.bytes()) {
            diff |= byte_a.to_ascii_lowercase() ^ byte_b.to_ascii_lowercase();
        }
        diff == 0
    }

    /// Vérifie un code PIN contre un hachage Argon2id (`$argon2...`) ou un hachage
    /// SHA-256 salé legacy (`salt:64HexChars`). Rejette strictement les PINs en clair,
    /// `mock-hash-*` et les formats malformés.
    pub async fn verify_pin(pin: &str, hash: &str) -> Result<bool, String> {
        if pin.trim().is_empty() || hash.trim().is_empty() {
            return Ok(false);
        }
        if hash.starts_with("mock-hash-") {
            return Err("Format de hachage de test (mock-hash) interdit.".to_string());
        }
        if hash.starts_with("$argon2") {
            let parsed_hash = PasswordHash::new(hash).map_err(|e| format!("Format hash Argon2 invalide: {}", e))?;
            let argon2 = Argon2::default();
            return Ok(argon2.verify_password(pin.as_bytes(), &parsed_hash).is_ok());
        }
        if let Some((salt, expected_hex)) = is_valid_salted_sha256_format(hash) {
            let mut hasher = Sha256::new();
            hasher.update(format!("{}:{}", salt, pin).as_bytes());
            let computed_hex = hex::encode(hasher.finalize());
            return Ok(constant_time_eq_hex(&computed_hex, expected_hex));
        }
        Err("Format de hachage PIN non reconnu ou invalide.".to_string())
    }

    #[tauri::command]
    pub async fn verify_pin_credential(pin: String, hash: String) -> Result<bool, String> {
        verify_pin(&pin, &hash).await
    }

    #[tauri::command]
    pub async fn authenticate_user(
        pin: String,
        pool: tauri::State<'_, SqlitePool>,
    ) -> Result<SessionResponse, String> {
        {
            let mut rate_limit = RATE_LIMIT.write().await;
            if let Some((attempts, lockout_until)) = rate_limit.get_mut("system") {
                if Utc::now() < *lockout_until {
                    return Err("Trop de tentatives. Veuillez patienter 5 minutes.".to_string());
                }
                if *attempts > 5 {
                    *lockout_until = Utc::now() + chrono::Duration::minutes(5);
                    *attempts = 0;
                    log_audit(&pool, "system", "AUTH_LOCKOUT", "Brute force attempt detected", "FAILED").await;
                    return Err("Compte verrouillé pour 5 minutes.".to_string());
                }
            }
        }

        #[derive(FromRow)]
        struct UserAuthRow {
            id: String,
            name: String,
            role: String,
            store_id: Option<String>,
            pin_hash: String,
        }

        let users: Vec<UserAuthRow> = sqlx::query_as("SELECT id, name, role, store_id, pin_hash FROM users WHERE is_active = 1")
            .fetch_all(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        let mut matched_user: Option<(SafeUser, bool)> = None;
        for u in &users {
            if verify_pin(&pin, &u.pin_hash).await.unwrap_or(false) {
                let needs_argon2_migration = !u.pin_hash.starts_with("$argon2");
                matched_user = Some((
                    SafeUser {
                        id: u.id.clone(),
                        name: u.name.clone(),
                        role: u.role.clone(),
                        store_id: u.store_id.clone(),
                    },
                    needs_argon2_migration,
                ));
                break;
            }
        }

        if let Some((user, needs_argon2_migration)) = matched_user {
            RATE_LIMIT.write().await.remove("system");

            // Migration explicite et transparente des anciens hachages SHA-256 salés vers Argon2id après vérification réussie
            if needs_argon2_migration {
                if let Ok(upgraded_hash) = hash_pin(&pin).await {
                    let now = Utc::now().to_rfc3339();
                    let _ = sqlx::query("UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?")
                        .bind(&upgraded_hash)
                        .bind(&now)
                        .bind(&user.id)
                        .execute(&*pool)
                        .await;
                    log_audit(
                        &pool,
                        &user.id,
                        "PIN_HASH_MIGRATED_TO_ARGON2",
                        "Hachage PIN legacy SHA-256 migré en toute sécurité vers Argon2id",
                        "SUCCESS",
                    )
                    .await;
                }
            }

            let token = generate_opaque_token();
            let session = Session {
                token: token.clone(),
                user: user.clone(),
                expires_at: Utc::now() + chrono::Duration::hours(12),
            };

            SESSION_STORE.write().await.insert(token.clone(), session);
            log_audit(&pool, &user.id, "LOGIN_SUCCESS", &format!("Utilisateur {} connecté", user.name), "SUCCESS").await;

            Ok(SessionResponse { token, user })
        } else {
            let mut rate_limit = RATE_LIMIT.write().await;
            let entry = rate_limit.entry("system".to_string()).or_insert((0, Utc::now()));
            entry.0 += 1;
            
            log_audit(&pool, "system", "LOGIN_FAILED", "Tentative PIN invalide", "FAILED").await;
            Err("Code PIN incorrect.".to_string())
        }
    }

    #[tauri::command]
    pub async fn verify_session(token: String) -> Result<SafeUser, String> {
        let store = SESSION_STORE.read().await;
        if let Some(session) = store.get(&token) {
            if Utc::now() > session.expires_at {
                return Err("Session expirée.".to_string());
            }
            Ok(session.user.clone())
        } else {
            Err("Non authentifié.".to_string())
        }
    }

    #[tauri::command]
    pub async fn logout_user(token: String, pool: tauri::State<'_, SqlitePool>) -> Result<(), String> {
        let mut store = SESSION_STORE.write().await;
        if let Some(session) = store.remove(&token) {
            log_audit(&pool, &session.user.id, "LOGOUT", "Déconnexion réussie", "SUCCESS").await;
        }
        Ok(())
    }

    const KEYRING_SERVICE: &str = "AquadroPOS_V2";
    const KEYRING_USERNAME: &str = "DB_SECRET_PIN";

    #[tauri::command]
    pub async fn setup_db_secret(
        secret: String,
        token: Option<String>,
        pool: tauri::State<'_, SqlitePool>,
        app_handle: tauri::AppHandle,
    ) -> Result<(), String> {
        let trimmed = secret.trim().to_string();
        if trimmed.is_empty() {
            return Err("Le code secret ne peut pas être vide".to_string());
        }

        // Si un propriétaire actif existe déjà, exiger une session Propriétaire authentifiée
        let existing_owners: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM users WHERE role = 'owner' AND is_active = 1"
        )
        .fetch_one(&*pool)
        .await
        .unwrap_or(0);

        if existing_owners > 0 {
            let tok = token.ok_or_else(|| {
                "Action non autorisée : Session Propriétaire requise pour modifier le code secret."
                    .to_string()
            })?;
            let user = verify_session(tok).await?;
            if user.role != "owner" {
                return Err(
                    "Action non autorisée : Seul le Propriétaire peut modifier le code secret."
                        .to_string(),
                );
            }
        }

        // 1. Sauvegarder dans le Keyring OS sécurisé
        if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_USERNAME) {
            let _ = entry.set_password(&trimmed);
        }

        // 2. Sauvegarder dans le répertoire de configuration local sécurisé
        if let Ok((_, _, _, _, config_dir)) = crate::runtime::resolve_runtime_paths(&app_handle) {
            let _ = fs::create_dir_all(&config_dir);
            let secret_path = config_dir.join("db_secret.key");
            let _ = fs::write(secret_path, trimmed.as_bytes());
        }
        
        log_audit(&pool, "system", "DB_SECRET_SET", "Danger Zone PIN sécurisé dans le Keyring & Config", "SUCCESS").await;
        Ok(())
    }

    #[tauri::command]
    pub async fn verify_danger_zone(
        secret: String,
        token: String,
        pool: tauri::State<'_, SqlitePool>,
        app_handle: tauri::AppHandle,
    ) -> Result<bool, String> {
        let user = verify_session(token).await?;
        if user.role != "owner" && user.role != "admin" {
            return Err("Accès non autorisé : Cette opération critique est strictement réservée au Propriétaire.".to_string());
        }

        let input_secret = secret.trim();
        if input_secret.is_empty() {
            return Err("يرجى إدخال رمز الأمان السري لتأكيد هذه العملية الخطيرة.".to_string());
        }

        // 1. Récupérer le secret attendu depuis le Keyring OS
        let mut expected_secret: Option<String> = None;
        if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_USERNAME) {
            if let Ok(stored_secret) = entry.get_password() {
                let trimmed = stored_secret.trim().to_string();
                if !trimmed.is_empty() {
                    expected_secret = Some(trimmed);
                }
            }
        }

        // 2. Si non trouvé dans le Keyring (ou OS sans secret-service), lire dans config/db_secret.key
        if expected_secret.is_none() {
            if let Ok((_, _, _, _, config_dir)) = crate::runtime::resolve_runtime_paths(&app_handle) {
                let secret_path = config_dir.join("db_secret.key");
                if let Ok(content) = fs::read_to_string(secret_path) {
                    let trimmed = content.trim().to_string();
                    if !trimmed.is_empty() {
                        expected_secret = Some(trimmed);
                    }
                }
            }
        }

        // Vérification stricte contre le code secret de récupération
        if let Some(valid_code) = expected_secret {
            if input_secret == valid_code {
                log_audit(&pool, &user.id, "DANGER_ZONE_ACCESS", "Validation réussie via Secret Setup Charter", "SUCCESS").await;
                return Ok(true);
            } else {
                log_audit(&pool, &user.id, "DANGER_ZONE_FAILED", "Échec validation: Code secret incorrect", "FAILED").await;
                return Err("رمز الأمان غير مطابق للرمز السري المطبوع في وثيقة إعداد النظام (Setup Charter PDF). لا يمكن إتمام الحذف أو التنسيق برمز البائع أو المالك العادي.".to_string());
            }
        }

        Err("لم يتم العثور على رمز التهيئة المعتمد في النظام. يرجى التأكد من تشغيل وثيقة الإعداد الأولي.".to_string())
    }

    pub async fn log_audit(pool: &SqlitePool, user_id: &str, action: &str, details: &str, status: &str) {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let app_version = env!("CARGO_PKG_VERSION");
        
        let payload = format!(r#"{{"status":"{}","description":"{}","app_version":"{}"}}"#, status, details, app_version);
        
        let _ = sqlx::query(
            r#"
            INSERT INTO audit_logs (id, user_id, action, entity_type, details, created_at) 
            VALUES (?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(id)
        .bind(user_id)
        .bind(action)
        .bind("AUTH_EVENT")
        .bind(payload)
        .bind(now)
        .execute(pool).await;
    }

    #[derive(Deserialize)]
    pub struct SetupPayload {
        pub store_name_fr: String,
        pub store_name_ar: String,
        pub address: String,
        pub wilaya: String,
        pub commune: String,
        pub phone: String,
        pub email: Option<String>,
        pub rc: String,
        pub nif: String,
        pub nis: String,
        pub activity: String,
        pub fiscal_regime: String,
        pub tva_rate: f64,
        pub owner_name: String,
        pub owner_phone: String,
        pub owner_pin: String,
        pub token: Option<String>,
        pub current_owner_pin: Option<String>,
    }

    #[tauri::command]
    pub async fn check_setup_status(pool: tauri::State<'_, SqlitePool>) -> Result<bool, String> {
        let store_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM stores")
            .fetch_one(&*pool)
            .await
            .unwrap_or(0);
        let active_owner_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM users WHERE role = 'owner' AND is_active = 1"
        )
        .fetch_one(&*pool)
        .await
        .unwrap_or(0);

        Ok(store_count > 0 && active_owner_count > 0)
    }

    #[tauri::command]
    pub async fn complete_setup(
        payload: SetupPayload,
        token: Option<String>,
        current_owner_pin: Option<String>,
        pool: tauri::State<'_, SqlitePool>,
    ) -> Result<(), String> {
        validate_new_pin_backend(&payload.owner_pin)?;

        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
        
        let now = Utc::now().to_rfc3339();

        // 1. Inspecter l'état existant de la base de données dans la transaction
        let existing_store: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM stores ORDER BY created_at ASC LIMIT 1"
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        let existing_active_owners: Vec<(String, String)> = sqlx::query_as(
            "SELECT id, pin_hash FROM users WHERE role = 'owner' AND is_active = 1 ORDER BY created_at ASC"
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // 2. Protection stricte d'une base déjà configurée :
        // Dès qu'un propriétaire actif existe déjà, interdire toute réécriture ou réinitialisation non authentifiée.
        if !existing_active_owners.is_empty() {
            let effective_token = token.or_else(|| payload.token.clone());
            let effective_current_pin = current_owner_pin.or_else(|| payload.current_owner_pin.clone());

            let mut authorized = false;
            if let Some(tok) = effective_token {
                if let Ok(session_user) = verify_session(tok).await {
                    if session_user.role == "owner" {
                        authorized = true;
                    }
                }
            }
            if !authorized {
                if let Some(curr_pin) = effective_current_pin {
                    for (_, owner_hash) in &existing_active_owners {
                        if verify_pin(&curr_pin, owner_hash).await.unwrap_or(false) {
                            authorized = true;
                            break;
                        }
                    }
                }
            }

            if !authorized {
                log_audit(
                    &pool,
                    "system",
                    "SETUP_OVERWRITE_BLOCKED",
                    "Tentative non autorisée d'écraser une base déjà configurée via complete_setup",
                    "FAILED",
                )
                .await;
                return Err(
                    "Action non autorisée : La base de données est déjà configurée. Une authentification Propriétaire (Owner) est requise pour modifier la configuration existante.".to_string()
                );
            }
        }

        let pin_hash = hash_pin(&payload.owner_pin).await?;

        let store_id = existing_store
            .map(|(id,)| id)
            .unwrap_or_else(|| "store-alg-01".to_string());

        let clean_email = payload
            .email
            .as_ref()
            .map(|e| e.trim().to_string())
            .filter(|e| !e.is_empty());

        sqlx::query(
            r#"
            INSERT INTO stores (
              id, name_fr, name_ar, address, wilaya, commune,
              phone, email, rc_number, nif_number, nis_number,
              fiscal_regime, default_tva_rate, created_at, updated_at, ai_number
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name_fr = excluded.name_fr,
              name_ar = excluded.name_ar,
              address = excluded.address,
              wilaya = excluded.wilaya,
              commune = excluded.commune,
              phone = excluded.phone,
              email = COALESCE(excluded.email, stores.email),
              rc_number = excluded.rc_number,
              nif_number = excluded.nif_number,
              nis_number = excluded.nis_number,
              fiscal_regime = excluded.fiscal_regime,
              default_tva_rate = excluded.default_tva_rate,
              updated_at = excluded.updated_at
            "#,
        )
        .bind(&store_id)
        .bind(&payload.store_name_fr)
        .bind(&payload.store_name_ar)
        .bind(&payload.address)
        .bind(&payload.wilaya)
        .bind(&payload.commune)
        .bind(&payload.phone)
        .bind(&clean_email)
        .bind(&payload.rc)
        .bind(&payload.nif)
        .bind(&payload.nis)
        .bind(&payload.fiscal_regime)
        .bind(payload.tva_rate)
        .bind(&now)
        .bind(&now)
        .bind("AI-0000")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Réutiliser l'identifiant du propriétaire existant (même inactif lors d'une reprise de setup partiel)
        let any_existing_owner: Option<(String,)> = if let Some((ref id, _)) = existing_active_owners.first() {
            Some((id.clone(),))
        } else {
            sqlx::query_as("SELECT id FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
        };

        let owner_id = any_existing_owner
            .map(|(id,)| id)
            .unwrap_or_else(|| "usr-owner-01".to_string());

        sqlx::query(
            r#"
            INSERT INTO users (id, store_id, name, role, pin_hash, phone, is_active, created_at, updated_at) 
            VALUES (?, ?, ?, 'owner', ?, ?, 1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              store_id = excluded.store_id,
              name = excluded.name,
              role = 'owner',
              pin_hash = excluded.pin_hash,
              phone = excluded.phone,
              is_active = 1,
              updated_at = excluded.updated_at
            "#,
        )
        .bind(&owner_id)
        .bind(&store_id)
        .bind(&payload.owner_name)
        .bind(pin_hash)
        .bind(&payload.owner_phone)
        .bind(&now)
        .bind(&now)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Rattacher tout utilisateur ou produit existant sans store_id au magasin actif
        sqlx::query("UPDATE users SET store_id = ? WHERE store_id IS NULL OR store_id = ''")
            .bind(&store_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE products SET store_id = ? WHERE store_id IS NULL OR store_id = ''")
            .bind(&store_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        tx.commit().await.map_err(|e| e.to_string())?;
        
        log_audit(&pool, &owner_id, "SYSTEM_SETUP", "Initial setup completed safely (upsert)", "SUCCESS").await;

        Ok(())
    }

    #[tauri::command]
    pub async fn hash_new_pin(pin: String) -> Result<String, String> {
        hash_pin(&pin).await
    }

    #[tauri::command]
    pub async fn get_users(token: String, pool: tauri::State<'_, SqlitePool>) -> Result<Vec<crate::models::User>, String> {
        let acting_user = verify_session(token).await?;
        if acting_user.role != "owner" {
            return Err("Non autorisé. Action réservée au propriétaire (Owner).".to_string());
        }

        sqlx::query_as::<_, crate::models::User>(
            r#"SELECT id, store_id, name, role, pin_hash, phone, is_active, created_at, updated_at FROM users WHERE is_active = 1 ORDER BY name ASC"#
        )
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn create_user(
        name: String,
        role: String,
        pin: String,
        phone: Option<String>,
        token: String,
        pool: tauri::State<'_, SqlitePool>
    ) -> Result<crate::models::User, String> {
        let acting_user = verify_session(token).await?;
        if acting_user.role != "owner" {
            return Err("Non autorisé. Action réservée au propriétaire (Owner).".to_string());
        }

        let pin_hash = hash_pin(&pin).await?;
        let id = format!("usr-{}", uuid::Uuid::new_v4().simple());
        let now = chrono::Utc::now().to_rfc3339();

        let store_id: Option<String> = match acting_user.store_id {
            Some(sid) if !sid.is_empty() => Some(sid),
            _ => {
                let row: Option<(String,)> = sqlx::query_as("SELECT id FROM stores LIMIT 1")
                    .fetch_optional(&*pool)
                    .await
                    .map_err(|e| e.to_string())?;
                row.map(|(sid,)| sid)
            }
        };
        
        sqlx::query(
            r#"INSERT INTO users (id, store_id, name, role, pin_hash, phone, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)"#
        )
        .bind(&id).bind(&store_id).bind(&name).bind(&role).bind(&pin_hash).bind(&phone).bind(&now).bind(&now)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
        let user = sqlx::query_as::<_, crate::models::User>(
            r#"SELECT id, store_id, name, role, pin_hash, phone, is_active, created_at, updated_at FROM users WHERE id = ?"#
        )
        .bind(&id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
        Ok(user)
    }

    #[tauri::command]
    pub async fn update_user_pin(id: String, pin: String, token: String, pool: tauri::State<'_, SqlitePool>) -> Result<(), String> {
        let acting_user = verify_session(token).await?;
        if acting_user.role != "owner" {
            return Err("Non autorisé. Action réservée au propriétaire (Owner).".to_string());
        }

        let pin_hash = hash_pin(&pin).await?;
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            r#"UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?"#
        )
        .bind(&pin_hash).bind(&now).bind(&id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub async fn deactivate_user(id: String, token: String, pool: tauri::State<'_, SqlitePool>) -> Result<(), String> {
        let acting_user = verify_session(token).await?;
        if acting_user.role != "owner" {
            return Err("Non autorisé. Action réservée au propriétaire (Owner).".to_string());
        }

        // Check if the user is an owner, and if so, prevent deactivation if they are the last one
        let target_user: Option<(String,)> = sqlx::query_as(
            r#"SELECT role FROM users WHERE id = ?"#
        )
        .bind(&id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some((role,)) = target_user {
            if role == "owner" {
                let active_owners: Option<(i64,)> = sqlx::query_as(
                    r#"SELECT COUNT(*) FROM users WHERE is_active = 1 AND role = 'owner'"#
                )
                .fetch_optional(&*pool)
                .await
                .map_err(|e| e.to_string())?;

                if let Some((count,)) = active_owners {
                    if count <= 1 {
                        return Err("Impossible de désactiver le dernier propriétaire actif du système.".to_string());
                    }
                }
            }
        }

        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            r#"UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?"#
        )
        .bind(&now).bind(&id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[tauri::command]
    pub async fn get_store(pool: tauri::State<'_, SqlitePool>) -> Result<Option<crate::models::Store>, String> {
        sqlx::query_as::<_, crate::models::Store>(
            r#"SELECT id, name_fr, name_ar, wilaya, commune, address, phone, email, rc_number, nif_number, nis_number, ai_number, fiscal_regime, default_tva_rate, receipt_header, receipt_footer, currency, is_active, created_at, updated_at FROM stores LIMIT 1"#
        )
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub async fn update_store(
        store: crate::models::Store,
        token: Option<String>,
        pool: tauri::State<'_, SqlitePool>
    ) -> Result<(), String> {
        let existing_owners: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM users WHERE role = 'owner' AND is_active = 1"
        )
        .fetch_one(&*pool)
        .await
        .unwrap_or(0);

        if existing_owners > 0 {
            let tok = token.ok_or_else(|| {
                "Action non autorisée : Session Propriétaire requise pour modifier les paramètres du magasin."
                    .to_string()
            })?;
            let acting_user = verify_session(tok).await?;
            if acting_user.role != "owner" && acting_user.role != "admin" {
                return Err(
                    "Action non autorisée : Seul le Propriétaire peut modifier la configuration fiscale du magasin."
                        .to_string(),
                );
            }
        }

        sqlx::query(
            r#"UPDATE stores SET 
                name_fr = ?, name_ar = ?, wilaya = ?, commune = ?, address = ?, phone = ?, 
                email = ?, rc_number = ?, nif_number = ?, nis_number = ?, ai_number = ?, 
                fiscal_regime = ?, default_tva_rate = ?, receipt_header = ?, receipt_footer = ?, 
                currency = ?, is_active = ?, updated_at = ?
            WHERE id = ?"#
        )
        .bind(&store.name_fr).bind(&store.name_ar).bind(&store.wilaya).bind(&store.commune)
        .bind(&store.address).bind(&store.phone).bind(&store.email).bind(&store.rc_number)
        .bind(&store.nif_number).bind(&store.nis_number).bind(&store.ai_number)
        .bind(&store.fiscal_regime).bind(&store.default_tva_rate).bind(&store.receipt_header)
        .bind(&store.receipt_footer).bind(&store.currency).bind(&store.is_active)
        .bind(&chrono::Utc::now().to_rfc3339()).bind(&store.id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[tokio::test]
        async fn test_argon2_hashing_and_verification() {
            let pin = "492015";
            let hash = hash_pin(pin).await.expect("Failed to hash PIN");
            
            // التحقق من أن خوارزمية Argon2id هي المستخدمة فعلياً
            assert!(hash.starts_with("$argon2id"), "Hash does not start with $argon2id");
            
            // التحقق من الـ PIN الصحيح
            let is_valid = verify_pin(pin, &hash).await.expect("Verification failed");
            assert!(is_valid, "Correct PIN should be verified");
            
            // التحقق من الـ PIN الخاطئ
            let is_invalid = verify_pin("123456", &hash).await.expect("Verification failed");
            assert!(!is_invalid, "Incorrect PIN should not be verified");
        }

        #[test]
        fn test_opaque_token_generation() {
            let token1 = generate_opaque_token();
            let token2 = generate_opaque_token();
            
            // طول الـ Token يجب أن يكون 64 حرف للحد من هجمات التخمين
            assert_eq!(token1.len(), 64, "Token should be exactly 64 characters");
            assert_ne!(token1, token2, "Tokens should be random and unique");
        }
    }
