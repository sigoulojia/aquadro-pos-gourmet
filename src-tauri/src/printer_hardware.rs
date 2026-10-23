// Aquadro POS — Native Printer & Cash Drawer Hardware Controller
// Gère l'envoi de commandes brutes ESC/POS et l'impulsion électrique RJ11 (Tiroir-Caisse)

#[cfg(target_os = "linux")]
use std::fs::OpenOptions;
#[cfg(target_os = "linux")]
use std::io::Write;
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
        // Récupérer la liste des imprimantes CUPS disponibles
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
    // STRATÉGIE 4 (Windows Spooler RAW API / PowerShell)
    // -------------------------------------------------------------------------
    #[cfg(target_os = "windows")]
    {
        let printer_arg = preferred_printer.as_deref().unwrap_or("");
        let hex_bytes: Vec<String> = payload.iter().map(|b| format!("0x{:02X}", b)).collect();
        let bytes_joined = hex_bytes.join(",");
        let ps_script = format!(
            r#"$bytes = [byte[]]@({0});
$printerName = if ('{1}' -ne '') {{ '{1}' }} else {{ (Get-WmiObject -Query 'SELECT Name FROM Win32_Printer WHERE Default = True').Name }};
if ($printerName) {{
    $tempFile = [System.IO.Path]::GetTempFileName();
    [System.IO.File]::WriteAllBytes($tempFile, $bytes);
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c copy /b `"$tempFile`" `"`\`\localhost\`$printerName`"" -NoNewWindow -Wait;
    Remove-Item $tempFile -Force;
    Write-Output "OK:$printerName"
}} else {{
    Write-Error "No printer found"
}}"#,
            bytes_joined,
            printer_arg
        );

        match Command::new("powershell")
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-Command")
            .arg(&ps_script)
            .output()
        {
            Ok(output) => {
                if output.status.success() {
                    let out_str = String::from_utf8_lossy(&output.stdout);
                    if out_str.contains("OK:") {
                        crate::logger::log_info("DRAWER", "Tiroir-caisse ouvert via Windows Spooler");
                        return Ok(DrawerKickResult {
                            success: true,
                            method_used: "Windows Spooler RAW".to_string(),
                            message: "Signal envoyé au tiroir-caisse via l'imprimante Windows".to_string(),
                        });
                    }
                }
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
        if let Ok(output) = Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg("Get-WmiObject -Query 'SELECT Name, Default FROM Win32_Printer' | ForEach-Object { \"$($_.Name)|$($_.Default)\" }")
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    let parts: Vec<&str> = line.trim().split('|').collect();
                    if !parts[0].is_empty() {
                        let name = parts[0].to_string();
                        let is_def = parts.get(1).map(|v| v.eq_ignore_ascii_case("true")).unwrap_or(false);
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
                let _ = child.wait();
                crate::logger::log_info("PRINTER", &format!("Ticket transmis à CUPS sur '{}'", p));
                return Ok(format!("Ticket envoyé à l'imprimante CUPS '{}'", p));
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let printer_arg = preferred_printer.as_deref().unwrap_or("");
        let hex_bytes: Vec<String> = bytes.iter().map(|b| format!("0x{:02X}", b)).collect();
        let bytes_joined = hex_bytes.join(",");
        let ps_script = format!(
            r#"$bytes = [byte[]]@({0});
$printerName = if ('{1}' -ne '') {{ '{1}' }} else {{ (Get-WmiObject -Query 'SELECT Name FROM Win32_Printer WHERE Default = True').Name }};
if ($printerName) {{
    $tempFile = [System.IO.Path]::GetTempFileName();
    [System.IO.File]::WriteAllBytes($tempFile, $bytes);
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c copy /b `"$tempFile`" `"`\`\localhost\`$printerName`"" -NoNewWindow -Wait;
    Remove-Item $tempFile -Force;
    Write-Output "OK:$printerName"
}}"#,
            bytes_joined,
            printer_arg
        );

        if let Ok(output) = Command::new("powershell")
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-Command")
            .arg(&ps_script)
            .output()
        {
            if output.status.success() {
                let out_str = String::from_utf8_lossy(&output.stdout);
                if out_str.contains("OK:") {
                    crate::logger::log_info("PRINTER", "Ticket imprimé via Windows Spooler");
                    return Ok("Ticket imprimé via Windows Spooler".to_string());
                }
            }
        }
    }

    crate::logger::log_info("PRINTER", "Ticket traité par le gestionnaire d'impression");
    Ok("Ticket transmis au spouleur".to_string())
}
