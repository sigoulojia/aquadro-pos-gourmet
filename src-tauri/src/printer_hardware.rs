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

/// Imprime un contenu brut ESC/POS vers l'imprimante thermique
pub fn print_raw_receipt(content: String, preferred_printer: Option<String>) -> Result<String, String> {
    let mut bytes = content.into_bytes();
    // Saut de lignes et découpe papier : ESC d 3 + GS V 65 0
    bytes.extend_from_slice(&[0x1B, 0x64, 0x03, 0x1D, 0x56, 0x41, 0x00]);

    #[cfg(target_os = "linux")]
    {
        let raw_ports = ["/dev/usb/lp0", "/dev/usb/lp1", "/dev/usb/lp2", "/dev/lp0"];
        for port in &raw_ports {
            if std::path::Path::new(port).exists() {
                if let Ok(mut file) = OpenOptions::new().write(true).open(port) {
                    if file.write_all(&bytes).is_ok() && file.flush().is_ok() {
                        crate::logger::log_info("PRINTER", &format!("Ticket imprimé via {}", port));
                        return Ok(format!("Ticket imprimé avec succès via {}", port));
                    }
                }
            }
        }

        if let Some(ref p) = preferred_printer {
            if !p.trim().is_empty() {
                if let Ok(mut child) = Command::new("lp")
                    .arg("-d")
                    .arg(p)
                    .arg("-o")
                    .arg("raw")
                    .stdin(std::process::Stdio::piped())
                    .spawn()
                {
                    if let Some(mut stdin) = child.stdin.take() {
                        let _ = stdin.write_all(&bytes);
                        let _ = stdin.flush();
                    }
                    if let Ok(status) = child.wait() {
                        if status.success() {
                            crate::logger::log_info("PRINTER", &format!("Ticket transmis à CUPS sur '{}'", p));
                            return Ok(format!("Ticket envoyé à l'imprimante CUPS '{}'", p));
                        }
                    }
                }
            }
        }

        crate::logger::log_warn("PRINTER", "Aucun port d'impression directe USB ou CUPS disponible");
        return Err("لم يتم العثور على طابعة فواتير حرارية متصلة مباشرة عبر USB. سيتم استخدام نافذة طباعة النظام.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        match winspool::send_raw_bytes(preferred_printer.as_deref(), &bytes) {
            Ok(printer_used) => {
                crate::logger::log_info("PRINTER", &format!("Ticket imprimé via Windows Spooler sur '{}'", printer_used));
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
        crate::logger::log_info("PRINTER", "Système d'impression générique");
        Err("Plateforme sans pilote d'impression thermique directe".to_string())
    }
}
