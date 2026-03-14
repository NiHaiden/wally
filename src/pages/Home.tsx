import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import { TitleBar } from "@/components/TitleBar";
import { Logo } from "@/components/Logo";
import { extractAndApplyColors } from "@/lib/colors";
import {
  RefreshCw,
  Download,
  Settings,
  Monitor,
  User,
  Loader2,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchRandomImage,
  setWallpaper,
  downloadImage,
  getCurrentWallpaper,
  saveCurrentWallpaper,
  triggerDownload,
  getSettings,
  getDaemonStatus,
  openUrl,
  applyGlassOpacity,
  type UnsplashImage,
  type WallpaperSettings,
} from "@/lib/wallpaper";

export function HomePage() {
  const navigate = useNavigate();
  const [currentImage, setCurrentImage] = useState<UnsplashImage | null>(null);
  const [previewImage, setPreviewImage] = useState<UnsplashImage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingWallpaper, setIsSettingWallpaper] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [settings, setSettings] = useState<WallpaperSettings | null>(null);
  const [daemonRunning, setDaemonRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayImage = previewImage || currentImage;

  useEffect(() => {
    loadInitialData();
    const unlisten = listen("wallpaper-changed", () => loadInitialData());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  async function loadInitialData() {
    try {
      const [wallpaper, settingsData, daemonStatus] = await Promise.all([
        getCurrentWallpaper(),
        getSettings(),
        getDaemonStatus(),
      ]);
      if (wallpaper.image) {
        setCurrentImage(wallpaper.image);
        extractAndApplyColors(wallpaper.image.urls.thumb);
      }
      setSettings(settingsData);
      setDaemonRunning(daemonStatus);
      applyGlassOpacity(Math.max(65, settingsData.blur_opacity ?? 90));
    } catch (err) {
      console.error("Failed to load initial data:", err);
    }
  }

  const handleFetchNew = useCallback(async () => {
    if (!settings?.api_key) {
      setError("Please configure your Unsplash API key in Settings");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const image = await fetchRandomImage();
      setPreviewImage(image);
      extractAndApplyColors(image.urls.thumb);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch image");
    } finally {
      setIsLoading(false);
    }
  }, [settings?.api_key]);

  const handleSetWallpaper = useCallback(async () => {
    if (!displayImage) return;
    setIsSettingWallpaper(true);
    setError(null);
    try {
      const path = await setWallpaper(displayImage.urls.full, displayImage.id);
      await saveCurrentWallpaper(displayImage, path);
      await triggerDownload(displayImage.links.download_location);
      setCurrentImage(displayImage);
      setPreviewImage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set wallpaper");
    } finally {
      setIsSettingWallpaper(false);
    }
  }, [displayImage]);

  const handleDownload = useCallback(async () => {
    if (!displayImage) return;
    setIsDownloading(true);
    setError(null);
    try {
      await downloadImage(
        displayImage.urls.full,
        `unsplash-${displayImage.id}.jpg`
      );
      await triggerDownload(displayImage.links.download_location);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download");
    } finally {
      setIsDownloading(false);
    }
  }, [displayImage]);

  const handleOpenPhotographer = useCallback(async () => {
    if (!displayImage) return;
    await openUrl(
      `https://unsplash.com/@${displayImage.user.username}?utm_source=unsplash_wally&utm_medium=referral`
    );
  }, [displayImage]);

  const handleOpenUnsplash = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!displayImage) return;
      await openUrl(
        `${displayImage.links.html}?utm_source=unsplash_wally&utm_medium=referral`
      );
    },
    [displayImage]
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden glass">
      <TitleBar />

      <div className="flex-1 flex flex-col gap-3.5 p-4 pt-14 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Logo size={28} />
            <h1 className="text-2xl font-bold tracking-tight">Wally</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/settings" })}
            className="text-muted-foreground hover:text-foreground"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="shrink-0 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Image Preview */}
        <div className="relative flex-1 min-h-0 overflow-hidden rounded-2xl border border-border shadow-lg shadow-black/10 dark:shadow-black/50">
          {displayImage ? (
            <>
              <img
                src={displayImage.urls.regular}
                alt={displayImage.alt_description || "Wallpaper preview"}
                className="h-full w-full object-cover"
              />
              {/* Gradient overlay */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-5 pb-4 pt-24">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {(displayImage.description ||
                      displayImage.alt_description) && (
                      <p className="text-sm text-white/90 line-clamp-1 mb-1.5 font-medium">
                        {displayImage.description ||
                          displayImage.alt_description}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-white/50">
                      <button
                        onClick={handleOpenPhotographer}
                        className="flex items-center gap-1.5 hover:text-white/80 transition-colors"
                      >
                        <User className="h-3.5 w-3.5" />
                        <span>{displayImage.user.name}</span>
                      </button>
                      <span className="text-white/30">/</span>
                      <button
                        onClick={handleOpenUnsplash}
                        className="hover:text-white/80 transition-colors"
                      >
                        Unsplash
                      </button>
                    </div>
                  </div>
                  {previewImage && (
                    <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium tracking-wide uppercase text-white/70 backdrop-blur-md border border-white/10">
                      Preview
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <ImageIcon
                className="h-16 w-16 text-muted-foreground/30"
                strokeWidth={1}
              />
              <div className="text-center">
                <p className="text-base font-medium text-muted-foreground">
                  No wallpaper loaded
                </p>
                <p className="mt-1 text-sm text-muted-foreground/70">
                  Fetch a photo to get started
                </p>
              </div>
              <Button
                onClick={handleFetchNew}
                disabled={isLoading}
                className="mt-2"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Fetch Photo
              </Button>
            </div>
          )}
        </div>

        {/* Actions */}
        {displayImage && (
          <div className="flex gap-2 shrink-0">
            <Button
              onClick={handleFetchNew}
              disabled={isLoading}
              variant="outline"
              size="lg"
              className="flex-1 shadow-sm"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              New Photo
            </Button>
            <Button
              onClick={handleSetWallpaper}
              disabled={isSettingWallpaper}
              size="lg"
              className="flex-1"
              style={{ boxShadow: "0 4px 14px -3px var(--primary)" }}
            >
              {isSettingWallpaper ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Monitor className="mr-2 h-4 w-4" />
              )}
              Set Wallpaper
            </Button>
            <Button
              onClick={handleDownload}
              disabled={isDownloading}
              variant="outline"
              size="icon-lg"
              className="shadow-sm"
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}

        {/* Status */}
        {settings && (
          <div className="flex items-center justify-between px-1 shrink-0 pb-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span
                  className={`absolute h-2 w-2 rounded-full ${
                    daemonRunning
                      ? "bg-emerald-400"
                      : settings.auto_change
                      ? "bg-amber-400"
                      : "bg-muted-foreground/30"
                  }`}
                />
                {daemonRunning && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {daemonRunning
                  ? `Auto-change every ${settings.interval_value} ${settings.interval_unit}`
                  : settings.auto_change
                  ? "Starting auto-change..."
                  : "Auto-change off"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => navigate({ to: "/settings" })}
              className="text-muted-foreground hover:text-foreground"
            >
              Configure
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
