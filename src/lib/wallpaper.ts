import { invoke } from "@tauri-apps/api/core";

export type IntervalUnit = "minutes" | "hours" | "days" | "weeks";

export interface WallpaperSettings {
  api_key: string;
  collection_id: string;
  interval_value: number;
  interval_unit: IntervalUnit;
  auto_change: boolean;
}

export interface UnsplashImage {
  id: string;
  description: string | null;
  alt_description: string | null;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  user: {
    name: string;
    username: string;
  };
  links: {
    html: string;
    download: string;
    download_location: string;
  };
}

export interface CurrentWallpaper {
  image: UnsplashImage | null;
  local_path: string | null;
  set_at: string | null;
}

export async function fetchRandomImage(): Promise<UnsplashImage> {
  return invoke("fetch_random_image");
}

export async function setWallpaper(imageUrl: string, imageId: string): Promise<string> {
  return invoke("set_wallpaper", { imageUrl, imageId });
}

export async function downloadImage(imageUrl: string, filename: string): Promise<string> {
  return invoke("download_image", { imageUrl, filename });
}

export async function getSettings(): Promise<WallpaperSettings> {
  return invoke("get_settings");
}

export async function saveSettings(settings: WallpaperSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

export async function getCurrentWallpaper(): Promise<CurrentWallpaper> {
  return invoke("get_current_wallpaper");
}

export async function saveCurrentWallpaper(image: UnsplashImage, localPath: string): Promise<void> {
  return invoke("save_current_wallpaper", { image, localPath });
}

export async function triggerDownload(downloadLocation: string): Promise<void> {
  return invoke("trigger_download", { downloadLocation });
}

export async function getPlatform(): Promise<string> {
  return invoke("get_platform");
}

export async function startAutoChange(): Promise<void> {
  return invoke("start_auto_change");
}

export async function stopAutoChange(): Promise<void> {
  return invoke("stop_auto_change");
}

export async function openUrl(url: string): Promise<void> {
  return invoke("open_url", { url });
}
