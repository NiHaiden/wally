import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  RefreshCw,
  Download,
  Settings,
  Monitor,
  User,
  ExternalLink,
  Loader2,
  ImageIcon,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  fetchRandomImage,
  setWallpaper,
  downloadImage,
  getCurrentWallpaper,
  saveCurrentWallpaper,
  triggerDownload,
  getSettings,
  openUrl,
  type UnsplashImage,
  type WallpaperSettings,
} from "@/lib/wallpaper";
import { useAutoWallpaper } from "@/hooks/useAutoWallpaper";

export function HomePage() {
  const navigate = useNavigate();
  useAutoWallpaper(() => {
    loadInitialData();
  });
  const [currentImage, setCurrentImage] = useState<UnsplashImage | null>(null);
  const [previewImage, setPreviewImage] = useState<UnsplashImage | null>(null);
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingWallpaper, setIsSettingWallpaper] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [settings, setSettings] = useState<WallpaperSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const displayImage = previewImage || currentImage;

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      const [wallpaper, settingsData] = await Promise.all([
        getCurrentWallpaper(),
        getSettings(),
      ]);
      if (wallpaper.image) {
        setCurrentImage(wallpaper.image);
        setLocalPath(wallpaper.local_path);
      }
      setSettings(settingsData);
    } catch (err) {
      console.error("Failed to load initial data:", err);
    }
  }

  const handleDragStart = useCallback(async (e: React.MouseEvent) => {
    if (e.button === 0) {
      await getCurrentWindow().startDragging();
    }
  }, []);

  const handleFetchNew = useCallback(async () => {
    if (!settings?.api_key) {
      setError("Please configure your Unsplash API key in settings");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const image = await fetchRandomImage();
      setPreviewImage(image);
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
      setLocalPath(path);
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
      await downloadImage(displayImage.urls.full, `unsplash-${displayImage.id}.jpg`);
      await triggerDownload(displayImage.links.download_location);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download image");
    } finally {
      setIsDownloading(false);
    }
  }, [displayImage]);

  const handleOpenPhotographer = useCallback(async () => {
    if (!displayImage) return;
    const url = `https://unsplash.com/@${displayImage.user.username}?utm_source=unsplash_wally&utm_medium=referral`;
    await openUrl(url);
  }, [displayImage]);

  const handleOpenUnsplash = useCallback(async () => {
    if (!displayImage) return;
    const url = `${displayImage.links.html}?utm_source=unsplash_wally&utm_medium=referral`;
    await openUrl(url);
  }, [displayImage]);

  const formatInterval = (value: number, unit: string) => {
    return `${value} ${unit}${value !== 1 ? "" : ""}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Draggable title bar area */}
      <div
        onMouseDown={handleDragStart}
        className="fixed inset-x-0 top-0 z-50 h-12 bg-background/80 backdrop-blur-xl border-b border-border/50 cursor-default"
      />

      <div className="mx-auto max-w-4xl space-y-6 p-6 pt-16">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Wally</h1>
            <p className="text-sm text-muted-foreground">
              Beautiful wallpapers from Unsplash
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/settings" })}
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>

        {/* Error Message */}
        {error && (
          <Card className="border-destructive/50 bg-destructive/10 p-4 !py-4 !gap-0">
            <p className="text-sm text-destructive">{error}</p>
          </Card>
        )}

        {/* Main Preview Card */}
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="relative aspect-video w-full bg-muted">
            {displayImage ? (
              <>
                <img
                  src={displayImage.urls.regular}
                  alt={displayImage.alt_description || "Wallpaper preview"}
                  className="h-full w-full object-cover"
                />
                {previewImage && (
                  <Badge
                    variant="secondary"
                    className="absolute left-4 top-4 bg-background/80 backdrop-blur-sm"
                  >
                    Preview
                  </Badge>
                )}
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
                <ImageIcon className="h-16 w-16 opacity-50" />
                <p>No wallpaper loaded</p>
                <Button onClick={handleFetchNew} disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Fetch Wallpaper
                </Button>
              </div>
            )}
          </div>

          {displayImage && (
            <div className="space-y-4 p-4">
              {/* Image Info */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">
                    {displayImage.description ||
                      displayImage.alt_description ||
                      "Untitled"}
                  </p>
                  <button
                    onClick={handleOpenPhotographer}
                    className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
                  >
                    <User className="h-3 w-3" />
                    <span>Photo by {displayImage.user.name}</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
                <button
                  onClick={handleOpenUnsplash}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                >
                  <span>View on Unsplash</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleFetchNew}
                  disabled={isLoading}
                  variant="outline"
                  className="flex-1"
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
                  disabled={isSettingWallpaper || !displayImage}
                  className="flex-1"
                >
                  {isSettingWallpaper ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Monitor className="mr-2 h-4 w-4" />
                  )}
                  Set as Wallpaper
                </Button>
                <Button
                  onClick={handleDownload}
                  disabled={isDownloading || !displayImage}
                  variant="outline"
                  size="icon"
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Status Card */}
        {settings && (
          <Card className="p-4 !py-4 !gap-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`h-2 w-2 rounded-full ${
                    settings.auto_change ? "bg-green-500" : "bg-muted-foreground"
                  }`}
                />
                <div>
                  <p className="text-sm font-medium">
                    {settings.auto_change ? "Auto-change enabled" : "Auto-change disabled"}
                  </p>
                  {settings.auto_change && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Changes every{" "}
                      {formatInterval(settings.interval_value, settings.interval_unit)}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: "/settings" })}
              >
                Configure
              </Button>
            </div>
          </Card>
        )}

        {/* Current Wallpaper Info */}
        {localPath && currentImage && !previewImage && (
          <Card className="p-4 !py-4 !gap-0">
            <p className="text-xs text-muted-foreground">
              Current wallpaper saved at:{" "}
              <span className="font-mono">{localPath}</span>
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
