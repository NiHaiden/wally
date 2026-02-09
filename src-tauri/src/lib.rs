use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, State};
use tokio::time::Duration;

#[cfg(target_os = "windows")]
use std::ffi::OsStr;
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WallpaperSettings {
    pub api_key: String,
    pub collection_id: String,
    pub interval_value: u32,
    pub interval_unit: String,
    pub auto_change: bool,
}

impl Default for WallpaperSettings {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            collection_id: "880012".to_string(),
            interval_value: 3,
            interval_unit: "hours".to_string(),
            auto_change: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnsplashUrls {
    pub raw: String,
    pub full: String,
    pub regular: String,
    pub small: String,
    pub thumb: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnsplashUser {
    pub name: String,
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnsplashLinks {
    pub html: String,
    pub download: String,
    pub download_location: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnsplashImage {
    pub id: String,
    pub description: Option<String>,
    pub alt_description: Option<String>,
    pub urls: UnsplashUrls,
    pub user: UnsplashUser,
    pub links: UnsplashLinks,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CurrentWallpaper {
    pub image: Option<UnsplashImage>,
    pub local_path: Option<String>,
    pub set_at: Option<String>,
}

pub struct AppState {
    pub settings: Mutex<WallpaperSettings>,
    pub current_wallpaper: Mutex<CurrentWallpaper>,
    pub daemon_running: Arc<AtomicBool>,
    pub space_watcher_running: Arc<AtomicBool>,
}

fn get_config_dir() -> PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("unsplash-wally");
    fs::create_dir_all(&config_dir).ok();
    config_dir
}

fn get_wallpaper_dir() -> PathBuf {
    let wallpaper_dir = dirs::picture_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
        .join("unsplash_wallpapers");
    fs::create_dir_all(&wallpaper_dir).ok();
    wallpaper_dir
}

fn load_settings() -> WallpaperSettings {
    let config_path = get_config_dir().join("settings.json");
    if let Ok(content) = fs::read_to_string(&config_path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        WallpaperSettings::default()
    }
}

fn load_current_wallpaper() -> CurrentWallpaper {
    let config_path = get_config_dir().join("current_wallpaper.json");
    if let Ok(content) = fs::read_to_string(&config_path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        CurrentWallpaper::default()
    }
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Result<WallpaperSettings, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

#[tauri::command]
fn save_settings(settings: WallpaperSettings, state: State<AppState>) -> Result<(), String> {
    let config_path = get_config_dir().join("settings.json");
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&config_path, content).map_err(|e| e.to_string())?;

    let mut state_settings = state.settings.lock().map_err(|e| e.to_string())?;
    *state_settings = settings;
    Ok(())
}

#[tauri::command]
fn get_current_wallpaper(state: State<AppState>) -> Result<CurrentWallpaper, String> {
    let current = state.current_wallpaper.lock().map_err(|e| e.to_string())?;
    Ok(current.clone())
}

#[tauri::command]
fn save_current_wallpaper(
    image: UnsplashImage,
    local_path: String,
    state: State<AppState>,
) -> Result<(), String> {
    let current = CurrentWallpaper {
        image: Some(image),
        local_path: Some(local_path),
        set_at: Some(chrono::Utc::now().to_rfc3339()),
    };

    let config_path = get_config_dir().join("current_wallpaper.json");
    let content = serde_json::to_string_pretty(&current).map_err(|e| e.to_string())?;
    fs::write(&config_path, content).map_err(|e| e.to_string())?;

    let mut state_current = state.current_wallpaper.lock().map_err(|e| e.to_string())?;
    *state_current = current;
    Ok(())
}

#[tauri::command]
async fn fetch_random_image(state: State<'_, AppState>) -> Result<UnsplashImage, String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?.clone();

    if settings.api_key.is_empty() {
        return Err("API key not configured".to_string());
    }

    let mut url = "https://api.unsplash.com/photos/random?orientation=landscape".to_string();
    if !settings.collection_id.is_empty() {
        url.push_str(&format!("&collections={}", settings.collection_id));
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("Authorization", format!("Client-ID {}", settings.api_key))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("API error: {} - {}", status, body));
    }

    let image: UnsplashImage = response.json().await.map_err(|e| e.to_string())?;
    Ok(image)
}

#[tauri::command]
async fn set_wallpaper(image_url: String, image_id: String) -> Result<String, String> {
    let wallpaper_dir = get_wallpaper_dir();
    let filename = format!("wallpaper_{}.jpg", image_id);
    let file_path = wallpaper_dir.join(&filename);

    // Download the image
    let client = reqwest::Client::new();
    let response = client
        .get(&image_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let mut file = fs::File::create(&file_path).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;

    let file_path_str = file_path.to_string_lossy().to_string();

    // Set the wallpaper based on platform
    set_wallpaper_platform(&file_path_str)?;

    // Clean up old wallpapers (keep last 10)
    cleanup_old_wallpapers(&wallpaper_dir)?;

    Ok(file_path_str)
}

fn set_wallpaper_platform(file_path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        set_wallpaper_macos(file_path)
    }

    #[cfg(target_os = "linux")]
    {
        set_wallpaper_linux(file_path)
    }

    #[cfg(target_os = "windows")]
    {
        set_wallpaper_windows(file_path)
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("Unsupported platform".to_string())
    }
}

#[cfg(target_os = "macos")]
fn set_wallpaper_macos(file_path: &str) -> Result<(), String> {
    eprintln!("[wally] Setting macOS wallpaper: {}", file_path);

    // Use NSWorkspace via AppleScript - this is the most reliable method
    let script = format!(
        r#"
        use framework "AppKit"
        use scripting additions

        set imageURL to current application's NSURL's fileURLWithPath:"{}"
        set sharedWorkspace to current application's NSWorkspace's sharedWorkspace()
        set allScreens to current application's NSScreen's screens()

        repeat with aScreen in allScreens
            set theOptions to current application's NSDictionary's dictionary()
            sharedWorkspace's setDesktopImageURL:imageURL forScreen:aScreen options:theOptions |error|:(missing value)
        end repeat
        "#,
        file_path
    );

    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("AppleScript failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("[wally] AppleScript error: {}", stderr);

        // Fallback to System Events
        let fallback_script = format!(
            r#"
            tell application "System Events"
                tell every desktop
                    set picture to "{}"
                end tell
            end tell
            "#,
            file_path
        );

        let fallback_output = Command::new("osascript")
            .arg("-e")
            .arg(&fallback_script)
            .output()
            .map_err(|e| format!("Fallback AppleScript failed: {}", e))?;

        if !fallback_output.status.success() {
            return Err(format!("All methods failed: {}", String::from_utf8_lossy(&fallback_output.stderr)));
        }
    }

    Ok(())
}

/// Get the current desktop picture path on macOS
#[cfg(target_os = "macos")]
fn get_current_desktop_picture() -> Option<String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(r#"tell application "System Events" to get picture of current desktop"#)
        .output()
        .ok()?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Some(path);
        }
    }
    None
}

/// Space watcher daemon - monitors current space wallpaper and re-applies if different
#[cfg(target_os = "macos")]
async fn space_watcher_daemon(running: Arc<AtomicBool>) {
    eprintln!("[wally space-watcher] Starting space watcher");

    while running.load(Ordering::SeqCst) {
        tokio::time::sleep(Duration::from_millis(500)).await;

        // Load our desired wallpaper
        let desired = load_current_wallpaper();
        if let Some(desired_path) = desired.local_path {
            if !std::path::Path::new(&desired_path).exists() {
                continue;
            }

            // Get current desktop picture for this space
            if let Some(current_picture) = get_current_desktop_picture() {
                // If current space has different wallpaper, apply ours
                if current_picture != desired_path {
                    eprintln!(
                        "[wally space-watcher] Wallpaper mismatch detected. Current: {}, Desired: {}",
                        current_picture, desired_path
                    );
                    if let Err(e) = set_wallpaper_macos(&desired_path) {
                        eprintln!("[wally space-watcher] Failed to set wallpaper: {}", e);
                    } else {
                        eprintln!("[wally space-watcher] Wallpaper re-applied successfully");
                    }
                }
            }
        }
    }

    eprintln!("[wally space-watcher] Space watcher stopped");
}

#[cfg(target_os = "windows")]
fn set_wallpaper_windows(file_path: &str) -> Result<(), String> {
    use std::path::Path;
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{DesktopWallpaper, IDesktopWallpaper, DWPOS_FILL};

    eprintln!("[wally] Setting Windows wallpaper: {}", file_path);

    // Verify file exists
    if !Path::new(file_path).exists() {
        return Err(format!("Wallpaper file does not exist: {}", file_path));
    }
    eprintln!("[wally] File exists, proceeding with IDesktopWallpaper");

    unsafe {
        // Initialize COM
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        // Create IDesktopWallpaper instance
        let wallpaper: IDesktopWallpaper = CoCreateInstance(&DesktopWallpaper, None, CLSCTX_ALL)
            .map_err(|e| format!("Failed to create IDesktopWallpaper: {}", e))?;

        // Convert path to HSTRING
        let path = HSTRING::from(file_path);

        // Set wallpaper position to Fill
        wallpaper.SetPosition(DWPOS_FILL)
            .map_err(|e| format!("Failed to set wallpaper position: {}", e))?;

        // Set the wallpaper (pass None for monitor ID to set on all monitors)
        wallpaper.SetWallpaper(PCWSTR::null(), &path)
            .map_err(|e| format!("Failed to set wallpaper: {}", e))?;

        eprintln!("[wally] Windows wallpaper set successfully via IDesktopWallpaper");
        Ok(())
    }
}

#[cfg(target_os = "linux")]
fn set_wallpaper_linux(file_path: &str) -> Result<(), String> {
    eprintln!("[wally] Setting wallpaper for Linux");
    eprintln!("[wally] File path: {}", file_path);

    // Log environment for debugging
    eprintln!("[wally] XDG_CURRENT_DESKTOP: {:?}", std::env::var("XDG_CURRENT_DESKTOP"));
    eprintln!("[wally] KDE_FULL_SESSION: {:?}", std::env::var("KDE_FULL_SESSION"));
    eprintln!("[wally] XDG_SESSION_TYPE: {:?}", std::env::var("XDG_SESSION_TYPE"));

    // Check if file exists
    if !std::path::Path::new(file_path).exists() {
        return Err(format!("Wallpaper file does not exist: {}", file_path));
    }
    eprintln!("[wally] File exists: true");

    // Try KDE Plasma first
    if is_kde() {
        eprintln!("[wally] Detected KDE Plasma");
        return set_wallpaper_kde(file_path);
    }

    // Try GNOME
    if is_gnome() {
        eprintln!("[wally] Detected GNOME");
        return set_wallpaper_gnome(file_path);
    }

    Err("Unsupported Linux desktop environment. Currently supports KDE Plasma and GNOME.".to_string())
}

#[cfg(target_os = "linux")]
fn is_kde() -> bool {
    std::env::var("KDE_FULL_SESSION").is_ok()
        || std::env::var("XDG_CURRENT_DESKTOP")
            .map(|d| d.to_lowercase().contains("kde"))
            .unwrap_or(false)
}

#[cfg(target_os = "linux")]
fn is_gnome() -> bool {
    std::env::var("GNOME_DESKTOP_SESSION_ID").is_ok()
        || std::env::var("XDG_CURRENT_DESKTOP")
            .map(|d| d.to_lowercase().contains("gnome"))
            .unwrap_or(false)
}

#[cfg(target_os = "linux")]
#[allow(unused_assignments)]
fn set_wallpaper_kde(file_path: &str) -> Result<(), String> {
    // Plasma 6 script for setting wallpaper
    let script = format!(
        r#"
        const allDesktops = desktops();
        for (const desktop of allDesktops) {{
            desktop.currentConfigGroup = ['Wallpaper', 'org.kde.image', 'General'];
            desktop.writeConfig('Image', 'file://{}');
        }}
        "#,
        file_path
    );

    eprintln!("[wally] KDE script:\n{}", script);

    // Try qdbus6 first (Plasma 6 / Qt6), then fall back to qdbus
    let qdbus_commands = ["qdbus6", "qdbus"];
    let mut last_error = String::from("No qdbus command succeeded");

    for qdbus_cmd in qdbus_commands {
        eprintln!("[wally] Trying {} command...", qdbus_cmd);

        let output = Command::new(qdbus_cmd)
            .args([
                "org.kde.plasmashell",
                "/PlasmaShell",
                "org.kde.PlasmaShell.evaluateScript",
                &script,
            ])
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                eprintln!("[wally] {} exit status: {}", qdbus_cmd, output.status);
                eprintln!("[wally] {} stdout: {}", qdbus_cmd, stdout);
                eprintln!("[wally] {} stderr: {}", qdbus_cmd, stderr);

                if output.status.success() {
                    eprintln!("[wally] Successfully set wallpaper via {}", qdbus_cmd);
                    return Ok(());
                }

                // Check if the error is about the script itself vs command not found
                last_error = format!("{} failed: {}", qdbus_cmd, stderr);
            }
            Err(e) => {
                eprintln!("[wally] {} not found or failed to execute: {}", qdbus_cmd, e);
                last_error = format!("{} error: {}", qdbus_cmd, e);
                // Continue to try the next command
            }
        }
    }

    // If qdbus methods fail, try plasma-apply-wallpaperimage (Plasma 6)
    eprintln!("[wally] Trying plasma-apply-wallpaperimage...");
    let output = Command::new("plasma-apply-wallpaperimage")
        .arg(file_path)
        .output();

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            eprintln!("[wally] plasma-apply-wallpaperimage exit status: {}", output.status);
            eprintln!("[wally] plasma-apply-wallpaperimage stdout: {}", stdout);
            eprintln!("[wally] plasma-apply-wallpaperimage stderr: {}", stderr);

            if output.status.success() {
                eprintln!("[wally] Successfully set wallpaper via plasma-apply-wallpaperimage");
                return Ok(());
            }
            last_error = format!("plasma-apply-wallpaperimage failed: {}", stderr);
        }
        Err(e) => {
            eprintln!("[wally] plasma-apply-wallpaperimage not found: {}", e);
            last_error = format!("plasma-apply-wallpaperimage error: {}", e);
        }
    }

    Err(format!("Failed to set KDE wallpaper. Last error: {}", last_error))
}

#[cfg(target_os = "linux")]
fn set_wallpaper_gnome(file_path: &str) -> Result<(), String> {
    let file_uri = format!("file://{}", file_path);

    let output = Command::new("gsettings")
        .args([
            "set",
            "org.gnome.desktop.background",
            "picture-uri",
            &file_uri,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to set GNOME wallpaper: {}", stderr));
    }

    // Also set for dark mode
    let _ = Command::new("gsettings")
        .args([
            "set",
            "org.gnome.desktop.background",
            "picture-uri-dark",
            &file_uri,
        ])
        .output();

    Ok(())
}

fn cleanup_old_wallpapers(wallpaper_dir: &PathBuf) -> Result<(), String> {
    let mut entries: Vec<_> = fs::read_dir(wallpaper_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("wallpaper_") && n.ends_with(".jpg"))
                .unwrap_or(false)
        })
        .collect();

    // Sort by modification time (newest first)
    entries.sort_by(|a, b| {
        let a_time = a.metadata().and_then(|m| m.modified()).ok();
        let b_time = b.metadata().and_then(|m| m.modified()).ok();
        b_time.cmp(&a_time)
    });

    // Remove all but the 10 most recent
    for entry in entries.into_iter().skip(10) {
        let _ = fs::remove_file(entry.path());
    }

    Ok(())
}

#[tauri::command]
async fn download_image(image_url: String, filename: String) -> Result<String, String> {
    let download_dir = dirs::download_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")));

    let file_path = download_dir.join(&filename);

    let client = reqwest::Client::new();
    let response = client
        .get(&image_url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let mut file = fs::File::create(&file_path).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn trigger_download(download_location: String, state: State<'_, AppState>) -> Result<(), String> {
    let settings = state.settings.lock().map_err(|e| e.to_string())?.clone();

    if settings.api_key.is_empty() {
        return Ok(());
    }

    // Trigger download endpoint to track downloads per Unsplash guidelines
    let client = reqwest::Client::new();
    let _ = client
        .get(&download_location)
        .header("Authorization", format!("Client-ID {}", settings.api_key))
        .send()
        .await;

    Ok(())
}

#[tauri::command]
fn get_platform() -> String {
    #[cfg(target_os = "macos")]
    {
        "macos".to_string()
    }

    #[cfg(target_os = "linux")]
    {
        if is_kde() {
            "linux-kde".to_string()
        } else if is_gnome() {
            "linux-gnome".to_string()
        } else {
            "linux".to_string()
        }
    }

    #[cfg(target_os = "windows")]
    {
        "windows".to_string()
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        "unknown".to_string()
    }
}

#[cfg(not(target_os = "linux"))]
#[allow(dead_code)]
fn is_kde() -> bool {
    false
}

#[cfg(not(target_os = "linux"))]
#[allow(dead_code)]
fn is_gnome() -> bool {
    false
}

/// Convert interval settings to Duration
fn get_interval_duration(value: u32, unit: &str) -> Duration {
    match unit {
        "minutes" => Duration::from_secs(value as u64 * 60),
        "hours" => Duration::from_secs(value as u64 * 3600),
        "days" => Duration::from_secs(value as u64 * 86400),
        "weeks" => Duration::from_secs(value as u64 * 604800),
        _ => Duration::from_secs(3600), // Default to 1 hour
    }
}

/// Fetch and set a new wallpaper (used by daemon)
async fn change_wallpaper_internal(settings: &WallpaperSettings) -> Result<(), String> {
    if settings.api_key.is_empty() {
        return Err("API key not configured".to_string());
    }

    eprintln!("[wally daemon] Fetching new wallpaper...");

    // Fetch random image from Unsplash
    let mut url = "https://api.unsplash.com/photos/random?orientation=landscape".to_string();
    if !settings.collection_id.is_empty() {
        url.push_str(&format!("&collections={}", settings.collection_id));
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("Authorization", format!("Client-ID {}", settings.api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch image: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("API error: {} - {}", status, body));
    }

    let image: UnsplashImage = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    eprintln!("[wally daemon] Got image: {}", image.id);

    // Download the image
    let wallpaper_dir = get_wallpaper_dir();
    let filename = format!("wallpaper_{}.jpg", image.id);
    let file_path = wallpaper_dir.join(&filename);

    let response = client
        .get(&image.urls.full)
        .send()
        .await
        .map_err(|e| format!("Failed to download image: {}", e))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read image bytes: {}", e))?;

    let mut file = fs::File::create(&file_path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(&bytes).map_err(|e| format!("Failed to write file: {}", e))?;

    let file_path_str = file_path.to_string_lossy().to_string();
    eprintln!("[wally daemon] Downloaded to: {}", file_path_str);

    // Set the wallpaper
    set_wallpaper_platform(&file_path_str)?;
    eprintln!("[wally daemon] Wallpaper set successfully");

    // Trigger download tracking (per Unsplash guidelines)
    let _ = client
        .get(&image.links.download_location)
        .header("Authorization", format!("Client-ID {}", settings.api_key))
        .send()
        .await;

    // Save current wallpaper info
    let current = CurrentWallpaper {
        image: Some(image),
        local_path: Some(file_path_str),
        set_at: Some(chrono::Utc::now().to_rfc3339()),
    };
    let config_path = get_config_dir().join("current_wallpaper.json");
    if let Ok(content) = serde_json::to_string_pretty(&current) {
        let _ = fs::write(&config_path, content);
    }

    // Clean up old wallpapers
    let _ = cleanup_old_wallpapers(&wallpaper_dir);

    Ok(())
}

/// Daemon loop that periodically changes wallpaper
async fn wallpaper_daemon(daemon_running: Arc<AtomicBool>) {
    eprintln!("[wally daemon] Starting wallpaper daemon");

    while daemon_running.load(Ordering::SeqCst) {
        // Load fresh settings each iteration
        let settings = load_settings();

        if !settings.auto_change {
            eprintln!("[wally daemon] Auto-change disabled, stopping daemon");
            break;
        }

        let interval_duration = get_interval_duration(settings.interval_value, &settings.interval_unit);
        eprintln!(
            "[wally daemon] Next wallpaper change in {} seconds",
            interval_duration.as_secs()
        );

        // Sleep for the interval (check periodically if we should stop)
        let check_interval = Duration::from_secs(10);
        let mut elapsed = Duration::ZERO;

        while elapsed < interval_duration && daemon_running.load(Ordering::SeqCst) {
            tokio::time::sleep(check_interval).await;
            elapsed += check_interval;
        }

        // Check if we should stop
        if !daemon_running.load(Ordering::SeqCst) {
            eprintln!("[wally daemon] Daemon stop requested");
            break;
        }

        // Change the wallpaper
        match change_wallpaper_internal(&settings).await {
            Ok(()) => eprintln!("[wally daemon] Wallpaper changed successfully"),
            Err(e) => eprintln!("[wally daemon] Failed to change wallpaper: {}", e),
        }
    }

    eprintln!("[wally daemon] Wallpaper daemon stopped");
}

#[tauri::command]
fn start_auto_change(state: State<AppState>) -> Result<(), String> {
    let daemon_running = state.daemon_running.clone();

    // Check if already running
    if daemon_running.load(Ordering::SeqCst) {
        eprintln!("[wally] Daemon already running");
        return Ok(());
    }

    // Mark as running
    daemon_running.store(true, Ordering::SeqCst);
    eprintln!("[wally] Starting auto-change daemon");

    // Spawn the daemon task
    let daemon_flag = daemon_running.clone();
    tauri::async_runtime::spawn(async move {
        wallpaper_daemon(daemon_flag).await;
    });

    Ok(())
}

#[tauri::command]
fn stop_auto_change(state: State<AppState>) -> Result<(), String> {
    eprintln!("[wally] Stopping auto-change daemon");
    state.daemon_running.store(false, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_daemon_status(state: State<AppState>) -> bool {
    state.daemon_running.load(Ordering::SeqCst)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let settings = load_settings();
    let current_wallpaper = load_current_wallpaper();
    let auto_change_enabled = settings.auto_change;
    let daemon_running = Arc::new(AtomicBool::new(false));
    let space_watcher_running = Arc::new(AtomicBool::new(false));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .manage(AppState {
            settings: Mutex::new(settings),
            current_wallpaper: Mutex::new(current_wallpaper),
            daemon_running: daemon_running.clone(),
            space_watcher_running: space_watcher_running.clone(),
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            get_current_wallpaper,
            save_current_wallpaper,
            fetch_random_image,
            set_wallpaper,
            download_image,
            trigger_download,
            get_platform,
            start_auto_change,
            stop_auto_change,
            get_daemon_status,
            open_url,
        ])
        .setup(move |app| {
            // Start space watcher on macOS to re-apply wallpaper when switching spaces
            #[cfg(target_os = "macos")]
            {
                let space_watcher_flag = space_watcher_running.clone();
                space_watcher_flag.store(true, Ordering::SeqCst);
                eprintln!("[wally] Starting space watcher for macOS");
                tauri::async_runtime::spawn(async move {
                    space_watcher_daemon(space_watcher_flag).await;
                });
            }
            #[cfg(not(target_os = "macos"))]
            let _ = space_watcher_running; // Suppress unused variable warning

            // Auto-start daemon if enabled in settings
            if auto_change_enabled {
                eprintln!("[wally] Auto-change enabled, starting daemon on startup");
                let daemon_flag = daemon_running.clone();
                daemon_flag.store(true, Ordering::SeqCst);
                tauri::async_runtime::spawn(async move {
                    wallpaper_daemon(daemon_flag).await;
                });
            }

            // Create tray menu
            let show_item = MenuItem::with_id(app, "show", "Show Wally", true, None::<&str>)?;
            let change_item = MenuItem::with_id(app, "change", "Change Wallpaper", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show_item, &change_item, &quit_item])?;

            // Build the tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Wally - Wallpaper Manager")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "change" => {
                        // Trigger wallpaper change via the daemon logic
                        let app_handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let settings = load_settings();
                            match change_wallpaper_internal(&settings).await {
                                Ok(()) => eprintln!("[wally tray] Wallpaper changed"),
                                Err(e) => eprintln!("[wally tray] Failed to change wallpaper: {}", e),
                            }
                            // Emit event to update UI
                            let _ = app_handle.emit("wallpaper-changed", ());
                        });
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimize to tray on close
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
