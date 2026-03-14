import { useState, useEffect, useCallback } from "react";
import { reapplyImageTheme } from "@/lib/colors";

export type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  reapplyGlassOpacity(resolved === "dark");
  reapplyImageTheme();
}

function reapplyGlassOpacity(isDark: boolean) {
  const baseStr = document.documentElement.dataset.glassBase;
  if (!baseStr) return; // no custom value set, CSS defaults apply
  const base = parseFloat(baseStr);
  if (isNaN(base)) return;
  const opacity = isDark ? Math.max(0, base - 0.1) : base;
  if (isDark) {
    document.documentElement.style.setProperty("--glass-bg", `rgba(9, 9, 11, ${opacity})`);
  } else {
    document.documentElement.style.setProperty("--glass-bg", `rgba(246, 246, 246, ${opacity})`);
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem("wally-theme") as Theme) || "system";
  });

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("wally-theme", newTheme);
    applyTheme(newTheme);
  }, []);

  useEffect(() => {
    applyTheme(theme);

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  return { theme, setTheme };
}

// Initialize theme immediately (before React renders) to prevent flash
export function initTheme() {
  const stored = localStorage.getItem("wally-theme") as Theme | null;
  const theme = stored || "system";
  applyTheme(theme);
}
