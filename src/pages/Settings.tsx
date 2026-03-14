import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Check, Loader2, Sun, Moon, Monitor } from "lucide-react";
import { TitleBar } from "@/components/TitleBar";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  getSettings,
  saveSettings,
  getPlatform,
  startAutoChange,
  stopAutoChange,
  openUrl,
  applyGlassOpacity,
  type WallpaperSettings,
  type IntervalUnit,
} from "@/lib/wallpaper";
import { useTheme, type Theme } from "@/hooks/useTheme";

const INTERVAL_OPTIONS: { value: number; unit: IntervalUnit; label: string }[] =
  [
    { value: 15, unit: "minutes", label: "Every 15 minutes" },
    { value: 30, unit: "minutes", label: "Every 30 minutes" },
    { value: 1, unit: "hours", label: "Every hour" },
    { value: 3, unit: "hours", label: "Every 3 hours" },
    { value: 6, unit: "hours", label: "Every 6 hours" },
    { value: 12, unit: "hours", label: "Every 12 hours" },
    { value: 1, unit: "days", label: "Daily" },
    { value: 1, unit: "weeks", label: "Weekly" },
  ];

const COLLECTION_PRESETS = [
  { id: "", name: "All Photos", description: "Everything on Unsplash" },
  { id: "880012", name: "Wallpapers", description: "Curated wallpapers" },
  { id: "1065976", name: "Landscapes", description: "Natural landscapes" },
  { id: "827743", name: "Nature", description: "Nature & wildlife" },
  { id: "3330448", name: "Abstract", description: "Art & patterns" },
  { id: "1163637", name: "Architecture", description: "Buildings" },
  { id: "4332580", name: "Space", description: "Cosmos" },
  { id: "894", name: "Earth", description: "Our planet" },
  { id: "3348849", name: "Minimal", description: "Clean aesthetics" },
  { id: "1538150", name: "Dark", description: "Dark & moody" },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [platform, setPlatform] = useState<string>("");
  const [apiKey, setApiKey] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [customCollectionId, setCustomCollectionId] = useState("");
  const [useCustomCollection, setUseCustomCollection] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState("1-hours");
  const [autoChange, setAutoChange] = useState(false);
  const [blurOpacity, setBlurOpacity] = useState(80);

  // Auto-save
  const isDirtyRef = useRef(false);
  const saveTimeoutRef = useRef<number>(undefined);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle"
  );

  useEffect(() => {
    loadSettings();
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Auto-save effect: watches all settings values, only saves when dirty
  useEffect(() => {
    if (!isDirtyRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = window.setTimeout(async () => {
      const effectiveCollectionId = useCustomCollection
        ? customCollectionId
        : collectionId;
      const [valueStr, unit] = selectedInterval.split("-");

      const newSettings: WallpaperSettings = {
        api_key: apiKey,
        collection_id: effectiveCollectionId,
        interval_value: parseInt(valueStr, 10),
        interval_unit: unit as IntervalUnit,
        auto_change: autoChange,
        blur_opacity: blurOpacity,
      };

      setSaveStatus("saving");
      try {
        await saveSettings(newSettings);
        if (autoChange) await startAutoChange();
        else await stopAutoChange();
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch (err) {
        console.error("Failed to save:", err);
        setSaveStatus("idle");
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    apiKey,
    collectionId,
    customCollectionId,
    useCustomCollection,
    selectedInterval,
    autoChange,
    blurOpacity,
  ]);

  async function loadSettings() {
    try {
      const [settingsData, platformData] = await Promise.all([
        getSettings(),
        getPlatform(),
      ]);
      setPlatform(platformData);
      setApiKey(settingsData.api_key);

      const isPreset = COLLECTION_PRESETS.some(
        (p) => p.id === settingsData.collection_id
      );
      if (isPreset) {
        setCollectionId(settingsData.collection_id);
        setUseCustomCollection(false);
      } else if (settingsData.collection_id) {
        setCustomCollectionId(settingsData.collection_id);
        setUseCustomCollection(true);
      }

      setSelectedInterval(
        `${settingsData.interval_value}-${settingsData.interval_unit}`
      );
      setAutoChange(settingsData.auto_change);
      const opacity = Math.max(65, settingsData.blur_opacity ?? 90);
      setBlurOpacity(opacity);
      applyGlassOpacity(opacity);
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  }

  const markDirty = () => {
    isDirtyRef.current = true;
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
    markDirty();
  };

  const handleCollectionSelect = (id: string) => {
    setCollectionId(id);
    setUseCustomCollection(false);
    markDirty();
  };

  const handleCustomCollectionChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setCustomCollectionId(e.target.value);
    setUseCustomCollection(true);
    markDirty();
  };

  const handleIntervalChange = (value: string) => {
    setSelectedInterval(value);
    markDirty();
  };

  const handleAutoChangeToggle = (checked: boolean) => {
    setAutoChange(checked);
    markDirty();
  };

  const handleBlurOpacityChange = (values: number[]) => {
    const val = values[0];
    setBlurOpacity(val);
    applyGlassOpacity(val);
    markDirty();
  };

  const isCollectionSelected = (id: string) => {
    if (useCustomCollection) return false;
    return collectionId === id;
  };

  const getPlatformDisplay = () => {
    switch (platform) {
      case "macos":
        return "macOS";
      case "linux-kde":
        return "Linux (KDE Plasma)";
      case "linux-gnome":
        return "Linux (GNOME)";
      case "linux":
        return "Linux";
      case "windows":
        return "Windows";
      default:
        return platform || "Unknown";
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden glass">
      <TitleBar />

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 p-5 pt-14 pb-8">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate({ to: "/" })}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="flex-1 text-xl font-bold tracking-tight">
              Settings
            </h1>
            <span
              className={`text-xs transition-opacity duration-300 ${
                saveStatus === "idle"
                  ? "opacity-0"
                  : "opacity-100 text-muted-foreground"
              }`}
            >
              {saveStatus === "saving" ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-400">
                  <Check className="h-3 w-3" />
                  Saved
                </span>
              )}
            </span>
          </div>

          {/* API Key */}
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">
                Unsplash API
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Connect to Unsplash for beautiful wallpapers
              </p>
            </div>
            <div className="space-y-2">
              <input
                type="password"
                value={apiKey}
                onChange={handleApiKeyChange}
                placeholder="Paste your API access key"
                className="flex h-9 w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring transition-colors"
              />
              <p className="text-xs text-muted-foreground">
                Get a free key at{" "}
                <button
                  onClick={() => openUrl("https://unsplash.com/developers")}
                  className="inline-flex items-center gap-0.5 text-primary hover:text-primary/80 transition-colors"
                >
                  unsplash.com/developers
                  <ExternalLink className="h-2.5 w-2.5" />
                </button>
              </p>
            </div>
          </section>

          <div className="h-px bg-border" />

          {/* Collections */}
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">
                Collection
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose which photos appear as wallpapers
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {COLLECTION_PRESETS.map((preset) => (
                <button
                  key={preset.id || "all"}
                  onClick={() => handleCollectionSelect(preset.id)}
                  className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all ${
                    isCollectionSelected(preset.id)
                      ? "bg-primary/15 border border-primary/40 text-primary"
                      : "bg-muted border border-border hover:bg-accent"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium block">
                      {preset.name}
                    </span>
                    <span className="text-xs text-muted-foreground block">
                      {preset.description}
                    </span>
                  </div>
                  {isCollectionSelected(preset.id) && (
                    <Check className="h-3 w-3 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 pt-1">
              <Label
                htmlFor="custom-collection"
                className="text-xs text-muted-foreground"
              >
                Or use a custom collection ID
              </Label>
              <div className="flex gap-2">
                <input
                  id="custom-collection"
                  type="text"
                  value={customCollectionId}
                  onChange={handleCustomCollectionChange}
                  placeholder="e.g. 1234567"
                  className="flex h-9 flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring transition-colors"
                />
                {customCollectionId && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      openUrl(
                        `https://unsplash.com/collections/${customCollectionId}`
                      )
                    }
                    className="shrink-0 border-border"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {useCustomCollection && customCollectionId && (
                <p className="text-xs text-primary">
                  Using custom collection: {customCollectionId}
                </p>
              )}
            </div>
          </section>

          <div className="h-px bg-border" />

          {/* Auto Change */}
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold">
                Auto-change
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically refresh your wallpaper on a schedule
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label
                htmlFor="auto-change"
                className="text-[12px] cursor-pointer"
              >
                Enable automatic changes
              </Label>
              <Switch
                id="auto-change"
                checked={autoChange}
                onCheckedChange={handleAutoChangeToggle}
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="interval"
                className="text-xs text-muted-foreground"
              >
                Change interval
              </Label>
              <Select
                value={selectedInterval}
                onValueChange={handleIntervalChange}
                disabled={!autoChange}
              >
                <SelectTrigger
                  id="interval"
                  className="w-full"
                >
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map((option) => (
                    <SelectItem
                      key={`${option.value}-${option.unit}`}
                      value={`${option.value}-${option.unit}`}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <div className="h-px bg-border" />

          {/* Appearance */}
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Appearance</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose your preferred color scheme
              </p>
            </div>
            <div className="flex gap-1.5">
              {(
                [
                  { value: "light", icon: Sun, label: "Light" },
                  { value: "dark", icon: Moon, label: "Dark" },
                  { value: "system", icon: Monitor, label: "System" },
                ] as const
              ).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value as Theme)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                    theme === value
                      ? "bg-primary/15 border border-primary/40 text-primary"
                      : "bg-muted border border-border hover:bg-accent"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Window transparency
                </Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {blurOpacity}%
                </span>
              </div>
              <Slider
                value={[blurOpacity]}
                onValueChange={handleBlurOpacityChange}
                min={65}
                max={100}
                step={5}
              />
              <p className="text-xs text-muted-foreground/70">
                Lower values show more of your desktop through the window
              </p>
            </div>
          </section>

          <div className="h-px bg-border" />

          {/* About */}
          <section className="flex items-center gap-3 pb-2">
            <Logo size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                Wally{" "}
                <span className="font-normal text-muted-foreground">
                  v0.1.0
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Photos by{" "}
                <button
                  onClick={() =>
                    openUrl(
                      "https://unsplash.com/?utm_source=unsplash_wally&utm_medium=referral"
                    )
                  }
                  className="text-foreground/70 hover:text-primary transition-colors"
                >
                  Unsplash
                </button>
                {platform && <span> · {getPlatformDisplay()}</span>}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
