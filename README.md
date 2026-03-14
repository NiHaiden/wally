# Wally

A beautiful, cross-platform wallpaper manager powered by [Unsplash](https://unsplash.com). Browse stunning photos, set them as your desktop wallpaper, and let Wally automatically refresh your background on a schedule.

Built with Tauri, React, and Rust.

## Features

- **Unsplash Integration** — Browse from curated collections (Wallpapers, Landscapes, Nature, Space, Minimal, and more) or use any custom collection ID
- **Auto-Change** — Set a schedule (15 min to weekly) and Wally swaps your wallpaper automatically in the background
- **Adaptive Color Theming** — The UI extracts dominant colors from the current wallpaper and uses them as accent colors throughout the app
- **Glass Transparency** — Native macOS vibrancy with configurable window opacity
- **Light & Dark Mode** — Follows your system preference or set it manually
- **System Tray** — Runs in the background with quick access to change wallpaper or show the window
- **macOS Space Support** — Automatically re-applies your wallpaper when switching between desktop spaces
- **Photographer Attribution** — Credits and links to the photographer and Unsplash, per [Unsplash guidelines](https://unsplash.com/documentation#guidelines--crediting)

## Supported Platforms

| Platform | Wallpaper Engine | Installers |
|----------|-----------------|------------|
| **macOS** | NSWorkspace via AppleScript | `.dmg` |
| **Windows** | IDesktopWallpaper COM API | `.msi`, `.exe` (NSIS) |
| **Linux (KDE)** | qdbus / plasma-apply-wallpaperimage | `.deb`, `.rpm`, `.AppImage` |
| **Linux (GNOME)** | gsettings | `.deb`, `.rpm`, `.AppImage` |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Rust](https://rustup.rs/) (stable)
- Tauri system dependencies — see the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/)

### Unsplash API Key

Wally requires a free Unsplash API key. Get one at [unsplash.com/developers](https://unsplash.com/developers), then paste it into Settings inside the app.

### Development

```bash
pnpm install
pnpm tauri dev
```

### Build

```bash
pnpm tauri build
```

This produces platform-specific installers in `src-tauri/target/release/bundle/`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri 2](https://v2.tauri.app/) |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS 4, Radix UI |
| Backend | Rust, Tokio, Reqwest |
| Routing | TanStack Router |

## How It Works

- **Wallpaper daemon** — A Rust background task polls at the configured interval, fetches a random photo from Unsplash, downloads it, and calls the platform-specific wallpaper API.
- **Color extraction** — When an image loads, a canvas-based median-cut algorithm extracts dominant colors and applies them as CSS custom properties, theming the entire UI.
- **Settings persistence** — All settings auto-save (debounced) to `~/.config/unsplash-wally/settings.json`. Downloaded wallpapers are stored in `~/Pictures/unsplash_wallpapers/` with automatic cleanup (keeps the last 10).

## License

MIT
