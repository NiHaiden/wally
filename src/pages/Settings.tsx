import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Save, Loader2, ExternalLink, Check } from "lucide-react";
import { TitleBar } from "@/components/TitleBar";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  getSettings,
  saveSettings,
  getPlatform,
  startAutoChange,
  stopAutoChange,
  openUrl,
  type WallpaperSettings,
  type IntervalUnit,
} from "@/lib/wallpaper";

const INTERVAL_OPTIONS: { value: number; unit: IntervalUnit; label: string }[] = [
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
  { id: "", name: "All Photos", description: "Random photos from all of Unsplash" },
  { id: "880012", name: "Wallpapers", description: "Curated desktop wallpapers" },
  { id: "1065976", name: "Landscapes", description: "Beautiful natural landscapes" },
  { id: "827743", name: "Nature", description: "Nature and wildlife" },
  { id: "3330448", name: "Abstract", description: "Abstract art and patterns" },
  { id: "1163637", name: "Architecture", description: "Buildings and structures" },
  { id: "4332580", name: "Space", description: "Cosmos and astronomy" },
  { id: "894", name: "Earth", description: "Our beautiful planet" },
  { id: "3348849", name: "Minimal", description: "Clean minimal aesthetics" },
  { id: "1538150", name: "Dark", description: "Dark and moody" },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const [, setSettings] = useState<WallpaperSettings | null>(null);
  const [platform, setPlatform] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [customCollectionId, setCustomCollectionId] = useState("");
  const [useCustomCollection, setUseCustomCollection] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState("1-hours");
  const [autoChange, setAutoChange] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const [settingsData, platformData] = await Promise.all([
        getSettings(),
        getPlatform(),
      ]);
      setSettings(settingsData);
      setPlatform(platformData);
      setApiKey(settingsData.api_key);

      // Check if the collection ID matches a preset
      const isPreset = COLLECTION_PRESETS.some(p => p.id === settingsData.collection_id);
      if (isPreset) {
        setCollectionId(settingsData.collection_id);
        setUseCustomCollection(false);
      } else if (settingsData.collection_id) {
        setCustomCollectionId(settingsData.collection_id);
        setUseCustomCollection(true);
      }

      setSelectedInterval(`${settingsData.interval_value}-${settingsData.interval_unit}`);
      setAutoChange(settingsData.auto_change);
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  }

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
    setHasChanges(true);
  };

  const handleCollectionSelect = (id: string) => {
    setCollectionId(id);
    setUseCustomCollection(false);
    setHasChanges(true);
  };

  const handleCustomCollectionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomCollectionId(e.target.value);
    setUseCustomCollection(true);
    setHasChanges(true);
  };

  const handleIntervalChange = (value: string) => {
    setSelectedInterval(value);
    setHasChanges(true);
  };

  const handleAutoChangeToggle = (checked: boolean) => {
    setAutoChange(checked);
    setHasChanges(true);
  };

  const getEffectiveCollectionId = () => {
    return useCustomCollection ? customCollectionId : collectionId;
  };

  const handleSave = async () => {
    const [valueStr, unit] = selectedInterval.split("-");
    const intervalValue = parseInt(valueStr, 10);
    const intervalUnit = unit as IntervalUnit;

    const newSettings: WallpaperSettings = {
      api_key: apiKey,
      collection_id: getEffectiveCollectionId(),
      interval_value: intervalValue,
      interval_unit: intervalUnit,
      auto_change: autoChange,
    };

    setIsSaving(true);
    try {
      await saveSettings(newSettings);

      if (autoChange) {
        await startAutoChange();
      } else {
        await stopAutoChange();
      }

      setSettings(newSettings);
      setHasChanges(false);
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenUnsplashDeveloper = async () => {
    await openUrl("https://unsplash.com/developers");
  };

  const handleOpenCollection = async (id: string) => {
    if (id) {
      await openUrl(`https://unsplash.com/collections/${id}`);
    }
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

  const isCollectionSelected = (id: string) => {
    if (useCustomCollection) return false;
    return collectionId === id;
  };

  return (
    <div className="min-h-screen bg-background">
      <TitleBar />

      <div className="mx-auto max-w-2xl space-y-6 p-6 pt-16">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/" })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure your wallpaper preferences
            </p>
          </div>
          <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </div>

        {/* API Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Unsplash API</CardTitle>
            <CardDescription>
              Connect to Unsplash to fetch beautiful wallpapers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Access Key</Label>
              <input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={handleApiKeyChange}
                placeholder="Enter your Unsplash API key"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                Get your API key from{" "}
                <button
                  onClick={handleOpenUnsplashDeveloper}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Unsplash Developers
                  <ExternalLink className="h-3 w-3" />
                </button>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Collection Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Photo Collection</CardTitle>
            <CardDescription>
              Choose which photos to use for your wallpapers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preset Collections Grid */}
            <div className="grid grid-cols-2 gap-2">
              {COLLECTION_PRESETS.map((preset) => (
                <button
                  key={preset.id || "all"}
                  onClick={() => handleCollectionSelect(preset.id)}
                  className={`relative flex flex-col items-start rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                    isCollectionSelected(preset.id)
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  {isCollectionSelected(preset.id) && (
                    <div className="absolute right-2 top-2">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <span className="font-medium text-sm">{preset.name}</span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {preset.description}
                  </span>
                </button>
              ))}
            </div>

            <Separator />

            {/* Custom Collection Input */}
            <div className="space-y-2">
              <Label htmlFor="custom-collection">Custom Collection ID</Label>
              <div className="flex gap-2">
                <input
                  id="custom-collection"
                  type="text"
                  value={customCollectionId}
                  onChange={handleCustomCollectionChange}
                  placeholder="Enter collection ID..."
                  className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
                {customCollectionId && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleOpenCollection(customCollectionId)}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Find the collection ID in the URL: unsplash.com/collections/<span className="font-mono text-primary">ID</span>
              </p>
              {useCustomCollection && customCollectionId && (
                <Badge variant="secondary" className="mt-2">
                  Using custom collection: {customCollectionId}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Auto Change Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Automatic Wallpaper Change</CardTitle>
            <CardDescription>
              Automatically change your wallpaper on a schedule
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-change">Enable auto-change</Label>
                <p className="text-xs text-muted-foreground">
                  Wallpaper will change automatically in the background
                </p>
              </div>
              <Switch
                id="auto-change"
                checked={autoChange}
                onCheckedChange={handleAutoChangeToggle}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="interval">Change interval</Label>
              <Select
                value={selectedInterval}
                onValueChange={handleIntervalChange}
                disabled={!autoChange}
              >
                <SelectTrigger id="interval">
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
          </CardContent>
        </Card>

        {/* System Info */}
        <Card>
          <CardHeader>
            <CardTitle>System Information</CardTitle>
            <CardDescription>
              Details about your system configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Platform</span>
              <span className="text-sm font-medium">{getPlatformDisplay()}</span>
            </div>
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Logo size={56} />
              <div>
                <CardTitle>Wally</CardTitle>
                <CardDescription>Version 0.1.0</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Wally is a desktop wallpaper manager that brings beautiful photos from
              Unsplash to your desktop.
            </p>
            <p>
              Photos provided by{" "}
              <button
                onClick={() => openUrl("https://unsplash.com/?utm_source=unsplash_wally&utm_medium=referral")}
                className="text-primary hover:underline"
              >
                Unsplash
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
