use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tauri::State;

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
        Err("Windows support not yet implemented".to_string())
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err("Unsupported platform".to_string())
    }
}

#[cfg(target_os = "macos")]
fn set_wallpaper_macos(file_path: &str) -> Result<(), String> {
    // Try multiple methods to ensure wallpaper is set everywhere

    // Method 1: Use System Events to set wallpaper on all desktops
    let script = format!(
        r#"
        use framework "AppKit"
        use scripting additions

        set theFile to POSIX file "{}"

        -- Get all screens
        set theScreens to current application's NSScreen's screens()
        set screenCount to theScreens's |count|()

        -- Set wallpaper for each screen
        repeat with i from 0 to (screenCount - 1)
            set theScreen to theScreens's objectAtIndex:i
            set theOptions to current application's NSDictionary's dictionary()
            current application's NSWorkspace's sharedWorkspace()'s setDesktopImageURL:(current application's NSURL's fileURLWithPath:"{}") forScreen:theScreen options:theOptions |error|:(missing value)
        end repeat

        -- Also use System Events for all desktops (spaces)
        tell application "System Events"
            tell every desktop
                set picture to "{}"
            end tell
        end tell
        "#,
        file_path, file_path, file_path
    );

    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| e.to_string())?;

    // If the AppleScript method fails, try the sqlite method as fallback
    if !output.status.success() {
        return set_wallpaper_macos_sqlite(file_path);
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn set_wallpaper_macos_sqlite(file_path: &str) -> Result<(), String> {
    // Fallback: Directly update the desktop picture database
    // This works on macOS Ventura and later

    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let db_path = home
        .join("Library/Application Support/Dock/desktoppicture.db");

    if !db_path.exists() {
        // If db doesn't exist, fall back to simple AppleScript
        let script = format!(
            r#"
            tell application "System Events"
                tell every desktop
                    set picture to "{}"
                end tell
            end tell
            "#,
            file_path
        );

        let output = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to set wallpaper: {}", stderr));
        }
        return Ok(());
    }

    // Update the database
    let db_path_str = db_path.to_string_lossy();

    // Delete existing entries and insert new one
    let sql_commands = format!(
        r#"
        DELETE FROM data;
        DELETE FROM displays;
        DELETE FROM pictures;
        DELETE FROM preferences;
        DELETE FROM prefs;
        DELETE FROM spaces;
        INSERT INTO data VALUES('{}');
        "#,
        file_path
    );

    let output = Command::new("sqlite3")
        .arg(&*db_path_str)
        .arg(&sql_commands)
        .output();

    // Restart Dock to apply changes
    let _ = Command::new("killall")
        .arg("Dock")
        .output();

    match output {
        Ok(o) if o.status.success() => Ok(()),
        _ => {
            // Final fallback: simple AppleScript
            let script = format!(
                r#"
                tell application "System Events"
                    tell every desktop
                        set picture to "{}"
                    end tell
                end tell
                "#,
                file_path
            );

            Command::new("osascript")
                .arg("-e")
                .arg(&script)
                .output()
                .map_err(|e| e.to_string())?;

            Ok(())
        }
    }
}

#[cfg(target_os = "linux")]
fn set_wallpaper_linux(file_path: &str) -> Result<(), String> {
    // Try KDE Plasma first
    if is_kde() {
        return set_wallpaper_kde(file_path);
    }

    // Try GNOME
    if is_gnome() {
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
fn set_wallpaper_kde(file_path: &str) -> Result<(), String> {
    let script = format!(
        r#"
        desktops().forEach(d => {{
            d.currentConfigGroup = ['Wallpaper','org.kde.image','General'];
            d.writeConfig('Image','file://{}');
            d.reloadConfig();
        }})
        "#,
        file_path
    );

    let output = Command::new("qdbus")
        .args([
            "org.kde.plasmashell",
            "/PlasmaShell",
            "org.kde.PlasmaShell.evaluateScript",
            &script,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to set KDE wallpaper: {}", stderr));
    }

    Ok(())
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
fn is_kde() -> bool {
    false
}

#[cfg(not(target_os = "linux"))]
fn is_gnome() -> bool {
    false
}

#[tauri::command]
fn start_auto_change() -> Result<(), String> {
    // Auto-change is handled by the frontend timer for now
    // A more robust solution would use a system service
    Ok(())
}

#[tauri::command]
fn stop_auto_change() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let settings = load_settings();
    let current_wallpaper = load_current_wallpaper();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            settings: Mutex::new(settings),
            current_wallpaper: Mutex::new(current_wallpaper),
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
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
