import { useEffect, useRef, useCallback } from "react";
import {
  fetchRandomImage,
  setWallpaper,
  saveCurrentWallpaper,
  triggerDownload,
  getSettings,
  type IntervalUnit,
} from "@/lib/wallpaper";

function getIntervalMs(value: number, unit: IntervalUnit): number {
  const multipliers: Record<IntervalUnit, number> = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000,
  };
  return value * multipliers[unit];
}

export function useAutoWallpaper(onWallpaperChanged?: () => void) {
  const intervalRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);

  const changeWallpaper = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    try {
      const settings = await getSettings();
      if (!settings.api_key || !settings.auto_change) {
        return;
      }

      const image = await fetchRandomImage();
      const path = await setWallpaper(image.urls.full, image.id);
      await saveCurrentWallpaper(image, path);
      await triggerDownload(image.links.download_location);
      onWallpaperChanged?.();
    } catch (err) {
      console.error("Auto wallpaper change failed:", err);
    } finally {
      isRunningRef.current = false;
    }
  }, [onWallpaperChanged]);

  const startAutoChange = useCallback(async () => {
    const settings = await getSettings();
    if (!settings.auto_change || !settings.api_key) {
      return;
    }

    const intervalMs = getIntervalMs(
      settings.interval_value,
      settings.interval_unit as IntervalUnit
    );

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up the interval
    intervalRef.current = window.setInterval(changeWallpaper, intervalMs);
  }, [changeWallpaper]);

  const stopAutoChange = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Check settings on mount and start if auto-change is enabled
    getSettings().then((settings) => {
      if (settings.auto_change && settings.api_key) {
        startAutoChange();
      }
    });

    return () => {
      stopAutoChange();
    };
  }, [startAutoChange, stopAutoChange]);

  return { startAutoChange, stopAutoChange, changeWallpaper };
}
