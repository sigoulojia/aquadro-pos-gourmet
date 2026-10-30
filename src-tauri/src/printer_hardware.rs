// Aquadro POS — Native Printer & Cash Drawer Hardware Controller
// Gère l'envoi de commandes brutes ESC/POS et l'impulsion électrique RJ11 (Tiroir-Caisse)
// Version Windows Spooler Native (Win32 winspool) — Zéro PowerShell, Zéro CMD, Zéro fenêtre intempestive

#[cfg(target_os = "linux")]
use std::fs::OpenOptions;
#[cfg(target_os = "linux")]
use std::io::Write;
#[cfg(target_os = "linux")]
use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HardwareDeviceInfo {
    pub name: String,
    pub device_type: String, // "USB_RAW", "CUPS", "SERIAL", "WINDOWS_SPOOLER"
    pub path_or_id: String,
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DrawerKickResult {
    pub success: bool,
    pub method_used: String,
    pub message: String,
}

/// Construit la charge utile ESC/POS pour déclencher le solénoïde du tiroir-caisse
pub fn build_drawer_kick_payload(pin: Option<u8>) -> Vec<u8> {
    let mut payload = Vec::new();

    let primary_pin = pin.unwrap_or(0); // 0 = Broche 2 (Standard), 1 = Broche 5
    let secondary_pin = if primary_pin == 0 { 1 } else { 0 };

    // 1. ESC p m t1 t2 (Standard Epson / Xprinter / Star)
    // m = pin, t1 = 25 (50ms pulse ON), t2 = 250 (500ms OFF)
    payload.extend_from_slice(&[0x1B, 0x70, primary_pin, 25, 250]);

    // 2. Également envoyer sur la broche secondaire pour compatibilité avec tous les câbles RJ11/RJ12
    payload.extend_from_slice(&[0x1B, 0x70, secondary_pin, 25, 250]);

    // 3. DLE DC4 n m t (Impulsion temps réel pour modèles récents / Rongta / Bixolon)
    // 0x10, 0x14, 0x01, 0x00, 0x05
    payload.extend_from_slice(&[0x10, 0x14, 0x01, 0x00, 0x05]);

    payload
}

#[cfg(target_os = "windows")]
mod winspool {
    use std::ffi::c_void;
    use super::HardwareDeviceInfo;

    #[repr(C)]
    struct DocInfo1W {
        p_doc_name: *const u16,
        p_output_file: *const u16,
        p_datatype: *const u16,
    }

    #[repr(C)]
    struct PrinterInfo4W {
        p_printer_name: *const u16,
        p_server_name: *const u16,
        attributes: u32,
    }

    #[link(name = "winspool")]
    extern "system" {
        fn OpenPrinterW(
            p_printer_name: *const u16,
            ph_printer: *mut isize,
            p_default: *const c_void,
        ) -> i32;

        fn StartDocPrinterW(
            h_printer: isize,
            level: u32,
            p_doc_info: *const DocInfo1W,
        ) -> u32;

        fn StartPagePrinter(h_printer: isize) -> i32;

        fn WritePrinter(
            h_printer: isize,
            p_buf: *const u8,
            cb_buf: u32,
            pc_written: *mut u32,
        ) -> i32;

        fn EndPagePrinter(h_printer: isize) -> i32;
        fn EndDocPrinter(h_printer: isize) -> i32;
        fn ClosePrinter(h_printer: isize) -> i32;

        fn GetDefaultPrinterW(
            psz_buffer: *mut u16,
            pcch_buffer: *mut u32,
        ) -> i32;

        fn EnumPrintersW(
            flags: u32,
            name: *const u16,
            level: u32,
            p_printer_enum: *mut u8,
            cb_buf: u32,
            pcb_needed: *mut u32,
            pc_returned: *mut u32,
        ) -> i32;
    }

    pub fn get_default_printer_name() -> Option<String> {
        let mut buffer_size = 0u32;
        unsafe {
            GetDefaultPrinterW(std::ptr::null_mut(), &mut buffer_size);
        }
        if buffer_size == 0 {
            return None;
        }

        let mut buffer: Vec<u16> = vec![0; buffer_size as usize];
        let res = unsafe {
            GetDefaultPrinterW(buffer.as_mut_ptr(), &mut buffer_size)
        };
        if res == 0 {
            return None;
        }

        let len = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
        String::from_utf16(&buffer[..len]).ok()
    }

    pub fn send_raw_bytes(printer_name: Option<&str>, data: &[u8]) -> Result<String, String> {
        let target_name = match printer_name {
            Some(n) if !n.trim().is_empty() => n.trim().to_string(),
            _ => {
                if let Some(def) = get_default_printer_name() {
                    def
                } else {
                    let all = list_printers();
                    if let Some(first) = all.first() {
                        first.name.clone()
                    } else {
                        return Err("لم يتم العثور على أي طابعة في نظام Windows. يرجى التأكد من تعريف وتوصيل طابعة فواتير عبر منفذ USB.".to_string());
                    }
                }
            }
        };

        let wide_name: Vec<u16> = target_name.encode_utf16().chain(std::iter::once(0)).collect();

        let mut h_printer: isize = 0;
        let open_res = unsafe {
            OpenPrinterW(wide_name.as_ptr(), &mut h_printer, std::ptr::null())
        };
        if open_res == 0 || h_printer == 0 {
            return Err(format!(
                "تعذر فتح الاتصال بالطابعة '{}'. يرجى التأكد من تشغيل الطابعة وتوصيل كابل USB.",
                target_name
            ));
        }

        struct AutoClose(isize);
        impl Drop for AutoClose {
            fn drop(&mut self) {
                if self.0 != 0 {
                    unsafe { ClosePrinter(self.0); }
                }
            }
        }
        let _guard = AutoClose(h_printer);

        let doc_name: Vec<u16> = "Aquadro POS Ticket".encode_utf16().chain(std::iter::once(0)).collect();
        let data_type: Vec<u16> = "RAW".encode_utf16().chain(std::iter::once(0)).collect();

        let doc_info = DocInfo1W {
            p_doc_name: doc_name.as_ptr(),
            p_output_file: std::ptr::null(),
            p_datatype: data_type.as_ptr(),
        };

        let job_id = unsafe { StartDocPrinterW(h_printer, 1, &doc_info) };
        if job_id == 0 {
            return Err(format!("فشل بدء مهمة الطباعة المباشرة على '{}'.", target_name));
        }

        unsafe {
            StartPagePrinter(h_printer);
            let mut written = 0u32;
            let write_res = WritePrinter(h_printer, data.as_ptr(), data.len() as u32, &mut written);
            EndPagePrinter(h_printer);
            EndDocPrinter(h_printer);

            if write_res == 0 || written == 0 {
                return Err(format!("فشل إرسال البيانات المباشرة إلى منفذ الطابعة '{}'.", target_name));
            }
        }

        Ok(target_name)
    }

    pub fn list_printers() -> Vec<HardwareDeviceInfo> {
        let mut list = Vec::new();
        let default_name = get_default_printer_name();

        let flags = 0x00000002 | 0x00000004; // PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS
        let mut needed = 0u32;
        let mut returned = 0u32;

        unsafe {
            EnumPrintersW(flags, std::ptr::null(), 4, std::ptr::null_mut(), 0, &mut needed, &mut returned);
        }

        if needed > 0 {
            let mut buffer: Vec<u8> = vec![0; needed as usize];
            let res = unsafe {
                EnumPrintersW(flags, std::ptr::null(), 4, buffer.as_mut_ptr(), needed, &mut needed, &mut returned)
            };
            if res != 0 && returned > 0 {
                let items = buffer.as_ptr() as *const PrinterInfo4W;
                for i in 0..returned as usize {
                    let info = unsafe { &*items.add(i) };
                    if !info.p_printer_name.is_null() {
                        let mut len = 0;
                        while unsafe { *info.p_printer_name.add(len) } != 0 {
                            len += 1;
                        }
                        let slice = unsafe { std::slice::from_raw_parts(info.p_printer_name, len) };
                        if let Ok(name) = String::from_utf16(slice) {
                            let is_def = default_name.as_ref().map(|d| d.eq_ignore_ascii_case(&name)).unwrap_or(false);
                            list.push(HardwareDeviceInfo {
                                name: name.clone(),
                                device_type: "WINDOWS_SPOOLER".to_string(),
                                path_or_id: name,
                                is_default: is_def,
                            });
                        }
                    }
                }
            }
        }

        list
    }
}

/// Envoie la commande d'ouverture du tiroir-caisse connecté à une imprimante thermique
pub fn trigger_cash_drawer(pin: Option<u8>, preferred_printer: Option<String>) -> Result<DrawerKickResult, String> {
    let payload = build_drawer_kick_payload(pin);
    let mut attempted_methods: Vec<String> = Vec::new();

    // -------------------------------------------------------------------------
    // STRATÉGIE 1 (Linux Direct USB Raw : /dev/usb/lp0..lp3)
    // -------------------------------------------------------------------------
    #[cfg(target_os = "linux")]
    {
        let raw_ports = ["/dev/usb/lp0", "/dev/usb/lp1", "/dev/usb/lp2", "/dev/usb/lp3", "/dev/lp0", "/dev/lp1"];
        for port in &raw_ports {
            if std::path::Path::new(port).exists() {
                match OpenOptions::new().write(true).open(port) {
                    Ok(mut file) => {
                        if file.write_all(&payload).is_ok() && file.flush().is_ok() {
                            crate::logger::log_info("DRAWER", &format!("Tiroir-caisse ouvert avec succès via port brut {}", port));
                            return Ok(DrawerKickResult {
                                success: true,
                                method_used: format!("Port USB direct ({})", port),
                                message: format!("Impulsion ESC/POS envoyée avec succès au port {}", port),
                            });
                        }
                    }
                    Err(e) => {
                        attempted_methods.push(format!("{} (Erreur accès: {})", port, e));
                    }
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // STRATÉGIE 2 (Linux CUPS : commande `lp -o raw`)
    // -------------------------------------------------------------------------
    #[cfg(target_os = "linux")]
    {
        let mut target_printers = Vec::new();
        if let Some(ref name) = preferred_printer {
            if !name.trim().is_empty() {
                target_printers.push(name.clone());
            }
        }

        if target_printers.is_empty() {
            if let Ok(output) = Command::new("lpstat").arg("-e").output() {
                if output.status.success() {
                    let text = String::from_utf8_lossy(&output.stdout);
                    for line in text.lines() {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            target_printers.push(trimmed.to_string());
                        }
                    }
                }
            }
        }

        for printer in &target_printers {
            match Command::new("lp")
                .arg("-d")
                .arg(printer)
                .arg("-o")
                .arg("raw")
                .stdin(std::process::Stdio::piped())
                .spawn()
            {
                Ok(mut child) => {
                    if let Some(mut stdin) = child.stdin.take() {
                        let _ = stdin.write_all(&payload);
                        let _ = stdin.flush();
                    }
                    if let Ok(status) = child.wait() {
                        if status.success() {
                            crate::logger::log_info("DRAWER", &format!("Tiroir-caisse ouvert via CUPS sur l'imprimante '{}'", printer));
                            return Ok(DrawerKickResult {
                                success: true,
                                method_used: format!("CUPS ({})", printer),
                                message: format!("Impulsion ESC/POS transmise avec succès à l'imprimante '{}'", printer),
                            });
                        } else {
                            attempted_methods.push(format!("CUPS '{}' (Code sortie non-zéro)", printer));
                        }
                    }
                }
                Err(e) => {
                    attempted_methods.push(format!("CUPS '{}' ({})", printer, e));
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // STRATÉGIE 3 (Linux Déclencheur Série / USB Dongle : /dev/ttyUSB*, /dev/ttyACM*)
    // -------------------------------------------------------------------------
    #[cfg(target_os = "linux")]
    {
        let serial_ports = ["/dev/ttyUSB0", "/dev/ttyUSB1", "/dev/ttyACM0", "/dev/ttyACM1"];
        for port in &serial_ports {
            if std::path::Path::new(port).exists() {
                if let Ok(mut file) = OpenOptions::new().write(true).open(port) {
                    let _ = file.write_all(&payload);
                    let _ = file.write_all(b"\x07"); // Caractère BELL standard déclencheur USB
                    let _ = file.flush();
                    crate::logger::log_info("DRAWER", &format!("Impulsion envoyée au port série {}", port));
                    return Ok(DrawerKickResult {
                        success: true,
                        method_used: format!("Port Série Déclencheur ({})", port),
                        message: format!("Signal envoyé au déclencheur USB sur {}", port),
                    });
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // STRATÉGIE 4 (Windows Spooler RAW Direct API — ZÉRO POWERSHELL, ZÉRO CMD)
    // -------------------------------------------------------------------------
    #[cfg(target_os = "windows")]
    {
        match winspool::send_raw_bytes(preferred_printer.as_deref(), &payload) {
            Ok(printer_used) => {
                crate::logger::log_info("DRAWER", &format!("Tiroir-caisse ouvert via Windows Spooler sur '{}'", printer_used));
                return Ok(DrawerKickResult {
                    success: true,
                    method_used: format!("Windows Spooler RAW ({})", printer_used),
                    message: format!("Impulsion électrique RJ11 transmise avec succès à l'imprimante '{}'", printer_used),
                });
            }
            Err(e) => {
                attempted_methods.push(format!("Windows Spooler ({})", e));
            }
        }
    }

    let detail = if attempted_methods.is_empty() {
        "لم يتم العثور على أي طابعة فواتير أو منفذ USB لطابعة متصلة بالنظام.".to_string()
    } else {
        format!("تمت محاولة المنافذ التالية دون استجابة: {}", attempted_methods.join(", "))
    };

    crate::logger::log_warn("DRAWER", &format!("Échec impulsion tiroir-caisse: {}", detail));

    Err(format!(
        "لم يتمكن البرنامج من فتح درج النقود: {}\n\nيرجى التأكد من:\n1. تشغيل طابعة الفواتير (زر Power مشتعل).\n2. توصيل كابل USB بين الطابعة والحاسوب.\n3. توصيل كابل درج النقود (RJ11) في منفذ DK خلف الطابعة.",
        detail
    ))
}

/// Détecte toutes les imprimantes et ports matériels disponibles
pub fn scan_available_printers() -> Vec<HardwareDeviceInfo> {
    let mut list = Vec::new();

    #[cfg(target_os = "linux")]
    {
        // 1. Ports USB bruts
        for i in 0..4 {
            let path = format!("/dev/usb/lp{}", i);
            if std::path::Path::new(&path).exists() {
                list.push(HardwareDeviceInfo {
                    name: format!("Port USB Direct ({})", path),
                    device_type: "USB_RAW".to_string(),
                    path_or_id: path,
                    is_default: list.is_empty(),
                });
            }
        }

        // 2. Imprimantes CUPS
        if let Ok(output) = Command::new("lpstat").arg("-p").arg("-d").output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                let mut default_printer = String::new();
                for line in text.lines() {
                    if line.starts_with("system default destination:") {
                        default_printer = line.replace("system default destination:", "").trim().to_string();
                    }
                }

                for line in text.lines() {
                    if line.starts_with("printer ") {
                        let parts: Vec<&str> = line.split_whitespace().collect();
                        if parts.len() >= 2 {
                            let p_name = parts[1].to_string();
                            let is_def = p_name == default_printer;
                            list.push(HardwareDeviceInfo {
                                name: p_name.clone(),
                                device_type: "CUPS".to_string(),
                                path_or_id: p_name,
                                is_default: is_def,
                            });
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        list.extend(winspool::list_printers());
    }

    list
}

// Envoie un tampon d'octets brut vers l'imprimante thermique (Linux direct /dev/usb/lpX, CUPS, ou Windows Spooler)
pub fn send_bytes_to_hardware(bytes: &[u8], preferred_printer: Option<&str>) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        // 1. Si une imprimante ou un port spécifique a été sélectionné par l'utilisateur
        if let Some(target) = preferred_printer {
            let trimmed = target.trim();
            if !trimmed.is_empty() {
                // Détecter si la chaîne contient un chemin de périphérique direct (/dev/usb/lpX ou /dev/lpX)
                if let Some(dev_idx) = trimmed.find("/dev/") {
                    let raw_part = &trimmed[dev_idx..];
                    let dev_path = raw_part.split(|c: char| c == ')' || c.is_whitespace() || c == ',').next().unwrap_or(raw_part).trim();
                    
                    if !std::path::Path::new(dev_path).exists() {
                        let err_msg = format!("Le port d'imprimante sélectionné \"{}\" n'est pas connecté ou introuvable.", dev_path);
                        crate::logger::log_warn("PRINTER", &err_msg);
                        return Err(err_msg);
                    }

                    match OpenOptions::new().write(true).open(dev_path) {
                        Ok(mut file) => {
                            // Écriture cadencée sécurisée pour éviter les débordements de tampon USB matériel
                            const CHUNK_SIZE: usize = 2048;
                            for chunk in bytes.chunks(CHUNK_SIZE) {
                                if let Err(e) = file.write_all(chunk) {
                                    let err_msg = format!("Échec d'écriture sur {} : {}", dev_path, e);
                                    crate::logger::log_error("PRINTER", &err_msg);
                                    return Err(err_msg);
                                }
                                let _ = file.flush();
                                std::thread::sleep(std::time::Duration::from_millis(3));
                            }
                            crate::logger::log_info("PRINTER", &format!("Données transmises avec succès via {}", dev_path));
                            return Ok(format!("Données transmises avec succès via {}", dev_path));
                        }
                        Err(e) => {
                            let reason = match e.kind() {
                                std::io::ErrorKind::PermissionDenied => {
                                    format!("Permission refusée sur \"{}\". Ajoutez l'utilisateur au groupe lp via sudo usermod -aG lp.", dev_path)
                                }
                                std::io::ErrorKind::NotFound => {
                                    format!("Port \"{}\" introuvable. L'imprimante est peut-être éteinte ou déconnectée.", dev_path)
                                }
                                _ => format!("Impossible d'ouvrir le port \"{}\" : {}", dev_path, e),
                            };
                            crate::logger::log_error("PRINTER", &reason);
                            return Err(reason);
                        }
                    }
                }

                // Si ce n'est pas un /dev/, tenter l'impression directe via CUPS pour cette imprimante nommée
                match Command::new("lp")
                    .arg("-d")
                    .arg(trimmed)
                    .arg("-o")
                    .arg("raw")
                    .stdin(std::process::Stdio::piped())
                    .spawn()
                {
                    Ok(mut child) => {
                        if let Some(mut stdin) = child.stdin.take() {
                            let _ = stdin.write_all(bytes);
                            let _ = stdin.flush();
                        }
                        if let Ok(status) = child.wait() {
                            if status.success() {
                                crate::logger::log_info("PRINTER", &format!("Données transmises à CUPS sur '{}'", trimmed));
                                return Ok(format!("Données transmises à l'imprimante CUPS '{}'", trimmed));
                            } else {
                                let err_msg = format!("Échec de la tâche d'impression CUPS sur '{}' (code sortie non-zéro).", trimmed);
                                crate::logger::log_warn("PRINTER", &err_msg);
                                return Err(err_msg);
                            }
                        }
                    }
                    Err(e) => {
                        let err_msg = format!("Impossible d'exécuter la commande 'lp' pour '{}' : {}", trimmed, e);
                        crate::logger::log_warn("PRINTER", &err_msg);
                        return Err(err_msg);
                    }
                }
            }
        }

        // 2. Détection automatique : balayer les ports USB bruts connus
        let raw_ports = ["/dev/usb/lp0", "/dev/usb/lp1", "/dev/usb/lp2", "/dev/usb/lp3", "/dev/lp0", "/dev/lp1"];
        let mut last_error: Option<String> = None;
        for port in &raw_ports {
            if std::path::Path::new(port).exists() {
                match OpenOptions::new().write(true).open(port) {
                    Ok(mut file) => {
                        let mut success = true;
                        const CHUNK_SIZE: usize = 2048;
                        for chunk in bytes.chunks(CHUNK_SIZE) {
                            if let Err(e) = file.write_all(chunk) {
                                success = false;
                                last_error = Some(format!("Échec écriture {}: {}", port, e));
                                break;
                            }
                            let _ = file.flush();
                            std::thread::sleep(std::time::Duration::from_millis(3));
                        }
                        if success {
                            crate::logger::log_info("PRINTER", &format!("Données envoyées avec succès via {}", port));
                            return Ok(format!("Données envoyées avec succès via {}", port));
                        }
                    }
                    Err(e) => {
                        let err_str = match e.kind() {
                            std::io::ErrorKind::PermissionDenied => {
                                format!("Permission refusée sur \"{}\". Exécutez sudo usermod -aG lp $USER puis redémarrez la session.", port)
                            }
                            _ => format!("Erreur d'accès à {} : {}", port, e),
                        };
                        last_error = Some(err_str);
                    }
                }
            }
        }

        // 3. Repli CUPS par défaut si aucun port brut n'a fonctionné
        if let Ok(mut child) = Command::new("lp")
            .arg("-o")
            .arg("raw")
            .stdin(std::process::Stdio::piped())
            .spawn()
        {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(bytes);
                let _ = stdin.flush();
            }
            if let Ok(status) = child.wait() {
                if status.success() {
                    crate::logger::log_info("PRINTER", "Données transmises à l'imprimante CUPS par défaut");
                    return Ok("Données transmises à l'imprimante CUPS par défaut".to_string());
                }
            }
        }

        let detail = last_error.unwrap_or_else(|| "Aucun port d'impression directe USB (/dev/usb/lp0) ou CUPS disponible.".to_string());
        crate::logger::log_warn("PRINTER", &format!("Échec impression matérielle Linux: {}", detail));
        return Err(format!("لم يتم العثور على طابعة فواتير حرارية متصلة مباشرة عبر USB أو تعذر الاتصال بها: {}", detail));
    }

    #[cfg(target_os = "windows")]
    {
        match winspool::send_raw_bytes(preferred_printer, bytes) {
            Ok(printer_used) => {
                crate::logger::log_info("PRINTER", &format!("Données imprimées via Windows Spooler sur '{}'", printer_used));
                return Ok(format!("Ticket imprimé avec succès via '{}'", printer_used));
            }
            Err(e) => {
                crate::logger::log_warn("PRINTER", &format!("Échec impression Windows Spooler: {}", e));
                return Err(e);
            }
        }
    }

    #[allow(unreachable_code)]
    {
        crate::logger::log_info("PRINTER", "Système d'impression générique non supporté");
        Err("Plateforme sans pilote d'impression thermique directe".to_string())
    }
}

// Construit la commande ESC/POS raster (GS v 0) par bandes verticales sécurisées
pub fn build_escpos_raster(
    data: &[u8],
    width: u32,
    height: u32,
    feed_lines: Option<u8>,
    cut: Option<bool>,
) -> Result<Vec<u8>, String> {
    if width == 0 || height == 0 {
        return Err("Dimensions d'image invalides (largeur ou hauteur égale à 0)".to_string());
    }
    if width > 2048 || height > 50000 {
        return Err(format!("Dimensions d'image hors limites supportées ({}x{})", width, height));
    }
    if data.is_empty() {
        return Err("Données d'image thermiques vides (charge utile vide)".to_string());
    }

    let bytes_per_row = (width + 7) / 8;
    let expected_1bit_len = (bytes_per_row * height) as usize;

    let packed_data: std::borrow::Cow<[u8]> = if data.len() == expected_1bit_len {
        // Déjà formaté en bitmap 1-bit monochrome compacté (MSB en premier)
        std::borrow::Cow::Borrowed(data)
    } else if data.len() == (width * height) as usize {
        // Grayscale 8-bit (1 octet par pixel : < 128 = point noir)
        let mut packed = vec![0u8; expected_1bit_len];
        for y in 0..height {
            for x in 0..width {
                let pixel = data[(y * width + x) as usize];
                if pixel < 128 {
                    let byte_idx = (y * bytes_per_row + (x / 8)) as usize;
                    let bit = 7 - (x % 8);
                    packed[byte_idx] |= 1 << bit;
                }
            }
        }
        std::borrow::Cow::Owned(packed)
    } else if data.len() == (width * height * 4) as usize {
        // RGBA 32-bit (4 octets par pixel)
        let mut packed = vec![0u8; expected_1bit_len];
        for y in 0..height {
            for x in 0..width {
                let idx = ((y * width + x) * 4) as usize;
                let r = data[idx] as u32;
                let g = data[idx + 1] as u32;
                let b = data[idx + 2] as u32;
                let a = data[idx + 3] as u32;
                if a >= 128 {
                    let lum = (299 * r + 587 * g + 114 * b) / 1000;
                    if lum < 180 {
                        let byte_idx = (y * bytes_per_row + (x / 8)) as usize;
                        let bit = 7 - (x % 8);
                        packed[byte_idx] |= 1 << bit;
                    }
                }
            }
        }
        std::borrow::Cow::Owned(packed)
    } else {
        return Err(format!(
            "Taille de charge utile invalide : {} octets reçus (attendu {} octets pour {}x{})",
            data.len(),
            expected_1bit_len,
            width,
            height
        ));
    };

    // Construction du flux ESC/POS raster
    // Initialisation imprimante : ESC @ (0x1B, 0x40)
    let mut payload = Vec::with_capacity(packed_data.len() + 64);
    payload.extend_from_slice(&[0x1B, 0x40]);

    // Alignement au centre ou à gauche selon le mode
    // Découpage en tranches verticales sécurisées (max 128 lignes par commande GS v 0)
    // IMPORTANT : max 128 lignes garantit que yL <= 128 et yH == 0 TOUJOURS.
    // Cela élimine le bogue de microcontrôleur POS-80 où yL == 0 (pour 256) était interprété comme fin de commande
    // provoquant l'impression de milliers de caractères chinois et aléatoires corrompus !
    const MAX_CHUNK_LINES: u32 = 128;
    let mut y_offset = 0u32;

    while y_offset < height {
        let lines_in_chunk = std::cmp::min(MAX_CHUNK_LINES, height - y_offset);
        let chunk_byte_start = (y_offset * bytes_per_row) as usize;
        let chunk_byte_end = ((y_offset + lines_in_chunk) * bytes_per_row) as usize;
        let chunk_slice = &packed_data[chunk_byte_start..chunk_byte_end];

        let x_l = (bytes_per_row & 0xFF) as u8;
        let x_h = ((bytes_per_row >> 8) & 0xFF) as u8;
        let y_l = (lines_in_chunk & 0xFF) as u8;
        let y_h = ((lines_in_chunk >> 8) & 0xFF) as u8;

        // Commande ESC/POS : GS v 0 m xL xH yL yH [data...]
        // m = 0 : Mode normal 203 DPI x 203 DPI
        payload.extend_from_slice(&[0x1D, 0x76, 0x30, 0x00, x_l, x_h, y_l, y_h]);
        payload.extend_from_slice(chunk_slice);

        y_offset += lines_in_chunk;
    }

    // Avancement contrôlé du papier en fin d'impression (ESC d n)
    // 5 lignes d'avance permettent au contenu de franchir la distance tête-massicot (~20mm)
    let feed = feed_lines.unwrap_or(5);
    if feed > 0 {
        payload.extend_from_slice(&[0x1B, 0x64, feed]);
    }

    // Découpe papier automatique :
    // GS V 0 (0x1D 0x56 0x00) : Coupe complète standard Format A reconnue universellement par les POS-80
    if cut.unwrap_or(true) {
        payload.extend_from_slice(&[0x1D, 0x56, 0x00]);
    }

    Ok(payload)
}

// Imprime une image monochrome raster vers l'imprimante thermique
pub fn print_raster_image(
    data: Vec<u8>,
    width: u32,
    height: u32,
    preferred_printer: Option<String>,
    feed_lines: Option<u8>,
    cut: Option<bool>,
) -> Result<String, String> {
    let escpos_payload = build_escpos_raster(&data, width, height, feed_lines, cut)?;
    send_bytes_to_hardware(&escpos_payload, preferred_printer.as_deref())
}

/// Imprime un contenu brut ESC/POS vers l'imprimante thermique
pub fn print_raw_receipt(content: String, preferred_printer: Option<String>) -> Result<String, String> {
    let mut bytes = content.into_bytes();
    // Saut de lignes et découpe papier universelle : ESC d 5 + GS V 0
    bytes.extend_from_slice(&[0x1B, 0x64, 0x05, 0x1D, 0x56, 0x00]);
    send_bytes_to_hardware(&bytes, preferred_printer.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_escpos_raster_valid() {
        let width = 576u32;
        let height = 10u32;
        let bytes_per_row = (width + 7) / 8; // 72
        let data = vec![0xFFu8; (bytes_per_row * height) as usize];

        let result = build_escpos_raster(&data, width, height, Some(3), Some(true));
        assert!(result.is_ok());
        let payload = result.unwrap();

        // Vérifie en-tête ESC @
        assert_eq!(&payload[0..2], &[0x1B, 0x40]);
        // Vérifie GS v 0 0 xL xH yL yH
        assert_eq!(&payload[2..6], &[0x1D, 0x76, 0x30, 0x00]);
        assert_eq!(payload[6], 72); // xL
        assert_eq!(payload[7], 0);  // xH
        assert_eq!(payload[8], 10); // yL
        assert_eq!(payload[9], 0);  // yH

        // Vérifie la fin : ESC d 3 suivi de GS V 0 (Coupe complète)
        let len = payload.len();
        assert_eq!(&payload[len - 6..len - 3], &[0x1B, 0x64, 0x03]);
        assert_eq!(&payload[len - 3..len], &[0x1D, 0x56, 0x00]);
    }

    #[test]
    fn test_build_escpos_raster_no_cut() {
        let width = 384u32;
        let height = 5u32;
        let bytes_per_row = (width + 7) / 8; // 48
        let data = vec![0xAAu8; (bytes_per_row * height) as usize];

        let result = build_escpos_raster(&data, width, height, Some(2), Some(false));
        assert!(result.is_ok());
        let payload = result.unwrap();

        let len = payload.len();
        // Vérifie ESC d 2 à la fin et AUCUNE commande de découpe GS V
        assert_eq!(&payload[len - 3..len], &[0x1B, 0x64, 0x02]);
    }

    #[test]
    fn test_build_escpos_raster_invalid_dimensions() {
        let data = vec![0u8; 100];
        assert!(build_escpos_raster(&data, 0, 10, None, None).is_err());
        assert!(build_escpos_raster(&data, 576, 0, None, None).is_err());
    }

    #[test]
    fn test_build_escpos_raster_empty_data() {
        let data = Vec::new();
        assert!(build_escpos_raster(&data, 576, 10, None, None).is_err());
    }

    #[test]
    fn test_build_escpos_raster_payload_mismatch() {
        let data = vec![0u8; 10]; // Mauvaise taille
        assert!(build_escpos_raster(&data, 576, 10, None, None).is_err());
    }

    #[test]
    fn test_build_escpos_raster_chunking() {
        let width = 576u32;
        let height = 300u32; // > 128 lignes pour tester le découpage en chunks
        let bytes_per_row = 72;
        let data = vec![0u8; (bytes_per_row * height) as usize];

        let result = build_escpos_raster(&data, width, height, Some(0), None);
        assert!(result.is_ok());
        let payload = result.unwrap();

        // Avec MAX_CHUNK_LINES = 128, 300 lignes = 128 + 128 + 44 = 3 chunks
        let gs_v_count = payload.windows(4).filter(|w| *w == [0x1D, 0x76, 0x30, 0x00]).count();
        assert_eq!(gs_v_count, 3);
    }

    #[test]
    fn test_build_escpos_raster_grayscale_and_rgba() {
        let width = 8u32;
        let height = 2u32;

        // Grayscale 8-bit (16 bytes) : premier pixel noir (0), reste blanc (255)
        let mut gray = vec![255u8; 16];
        gray[0] = 0; // pixel (0,0) noir
        let res_gray = build_escpos_raster(&gray, width, height, Some(0), None);
        assert!(res_gray.is_ok());
        let payload_gray = res_gray.unwrap();
        // Le premier octet de données après l'en-tête (2 init + 8 raster cmd = 10) doit avoir le MSB à 1 (0x80)
        assert_eq!(payload_gray[10], 0x80);

        // RGBA 32-bit (64 bytes) : premier pixel noir (0,0,0,255), reste blanc (255,255,255,255)
        let mut rgba = vec![255u8; 64];
        rgba[0] = 0;
        rgba[1] = 0;
        rgba[2] = 0;
        rgba[3] = 255;
        let res_rgba = build_escpos_raster(&rgba, width, height, Some(0), None);
        assert!(res_rgba.is_ok());
        let payload_rgba = res_rgba.unwrap();
        assert_eq!(payload_rgba[10], 0x80);
    }

    #[test]
    fn test_scan_available_printers_structure() {
        let list = scan_available_printers();
        // Vérifie que les objets retournés ont des identifiants valides
        for p in &list {
            assert!(!p.name.is_empty());
            assert!(!p.device_type.is_empty());
            assert!(!p.path_or_id.is_empty());
        }
    }

    #[test]
    fn test_send_bytes_explicit_missing_device() {
        // Lorsqu'un port direct inexistant est explicitement demandé, une erreur claire doit être retournée
        let dummy_data = vec![0x1B, 0x40];
        let res = send_bytes_to_hardware(&dummy_data, Some("Port USB Direct (/dev/usb/lp999)"));
        #[cfg(target_os = "linux")]
        {
            assert!(res.is_err());
            let err = res.unwrap_err();
            assert!(err.contains("lp999") || err.contains("introuvable") || err.contains("connecté"));
        }
    }

    #[test]
    fn test_hardware_direct_raster_if_device_present() {
        // Si /dev/usb/lp0 est présent sur la machine de test, tester la transmission raster réelle
        if std::path::Path::new("/dev/usb/lp0").exists() {
            let width = 576u32;
            let height = 40u32;
            let bytes_per_row = 72usize;
            let mut bitmap = vec![0u8; bytes_per_row * height as usize];
            // Dessiner deux bordures horizontales et quelques motifs
            for x in 0..bytes_per_row {
                bitmap[x] = 0xFF; // Première ligne noire
                bitmap[x + bytes_per_row] = 0xFF; // Deuxième ligne noire
                bitmap[(height as usize - 1) * bytes_per_row + x] = 0xFF; // Dernière ligne
            }
            // Envoyer avec 3 lignes d'avance et AUCUNE découpe
            let res = print_raster_image(bitmap, width, height, Some("/dev/usb/lp0".to_string()), Some(3), Some(false));
            println!("Résultat test matériel /dev/usb/lp0 : {:?}", res);
            assert!(res.is_ok());
        }
    }
}
