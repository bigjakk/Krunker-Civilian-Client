# Krunker Civilian Client

[![GitHub Downloads](https://img.shields.io/github/downloads/bigjakk/Krunker-Civilian-Client/total?style=flat&logo=github&label=Downloads)](https://github.com/bigjakk/Krunker-Civilian-Client/releases)
[![GitHub Stars](https://img.shields.io/github/stars/bigjakk/Krunker-Civilian-Client?style=flat&logo=github&label=Stars)](https://github.com/bigjakk/Krunker-Civilian-Client/stargazers)
[![Latest Release](https://img.shields.io/github/v/release/bigjakk/Krunker-Civilian-Client?style=flat&label=Latest)](https://github.com/bigjakk/Krunker-Civilian-Client/releases/latest)
[![License](https://img.shields.io/github/license/bigjakk/Krunker-Civilian-Client?style=flat&label=License)](https://github.com/bigjakk/Krunker-Civilian-Client/blob/main/LICENSE)

Was AI used in the creation of this client? Yes, if you came across this client and don't want to use it due to that, I highly recommend looking at [Glorp](https://github.com/slavcp/glorp) by slav or [Crankshaft](https://github.com/KraXen72/crankshaft) by KraXen72



**Download:**
[Windows (x64)](https://github.com/bigjakk/Krunker-Civilian-Client/releases/latest) -
[Linux (AppImage)](https://github.com/bigjakk/Krunker-Civilian-Client/releases/latest)

## Features

- unlimited FPS with no aim freeze (custom Electron build, see [below](#custom-electron-build))
- unobtrusive — nearly all features can be disabled
- hides ads by default
- resource swapper (textures, sounds, models)
- CSS theme system with `@import` support (drop `.css` files in `swap/themes/`)
- custom loading screen backgrounds (`swap/backgrounds/`)
- customizable matchmaker with lobby scan animation
  - filter by region, gamemode, map, player count, remaining time
  - auto-join with server capacity verification
- external ranked queue (works even when the game is closed)
- rank progress tracker with ELO bar and rank distribution popup
- tabbed hub/social pages with drag-and-drop reorder
- better chat — merged team/all chat with `[T]`/`[M]` prefixes
- chat history preservation (Krunker prunes old messages, this prevents it)
- real-time chat translator (Google Translate, 15+ languages)
- userscript support (Tampermonkey-style metadata, per-script settings)
- battle pass claim all button
- alt account manager with encrypted credential storage
- Discord RPC (gamemode, map, class, spectator status)
- raw input / unadjusted movement (Windows)
- show numeric ping in player list
- double ping display (Krunker shows half the real value)
- hardpoint enemy counter HUD
- changelog popup on update
- configurable keybinds with visual rebinding dialog
- configurable ANGLE backend (D3D11, OpenGL, D3D11on12)
- advanced Chromium flag settings (GPU rasterization, low latency, QUIC, and more)
- CPU throttling (game vs menu) and process priority control
- auto-updater
- maintained & open source (GPL-3.0)

## Hotkeys

All hotkeys are rebindable in settings.

| Key | Action |
|-----|--------|
| `F4` | New match (triggers matchmaker if enabled) |
| `F5` | Reload page |
| `F6` | Open matchmaker |
| `F10` | Pause chat (freeze auto-scroll) |
| `F11` | Toggle fullscreen |
| `F12` | DevTools |
| `Ctrl+L` | Copy game link |
| `Ctrl+J` | Join game from clipboard |
| `Ctrl+T` | New tab (hub) |
| `Ctrl+W` | Close tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `Ctrl+Shift+T` | Reopen closed tab |
| `Ctrl+1-9` | Jump to tab |

## Userscripts

Any `.js` file in the scripts folder will be loaded as a userscript if enabled in settings. Scripts support Tampermonkey-style metadata blocks (`@name`, `@author`, `@version`, `@desc`) and can define custom settings (boolean, number, select, color, keybind).

> **Use userscripts at your own risk.** Do not write or use any userscripts which would give you a competitive advantage.

## Custom Electron Build

This client uses a custom-patched Electron 42 build to overcome the aim freezing issue present in modern Electron versions. The patched binary is downloaded automatically during `npm install`.

For details on the patch and build instructions, see [Electron-Websocket-Fix](https://github.com/bigjakk/Electron-Websocket-Fix).

## Linux Performance at High Resolutions

On Linux + NVIDIA at 4K (3840×2160) with FPS Uncap enabled, you may see the FPS counter read 1000+ while the visible output stutters. This is a Linux compositor/present-pipeline limitation, not a GPU bottleneck.

The cause: at 4K each frame is ~33MB of pixel data. At 1000fps the renderer pumps ~33GB/s of pixel data through Chromium → XWayland → Mutter. Windows handles this gracefully via DXGI flip-discard (only the latest committed frame gets presented at vsync, the rest are dropped cheaply); on Linux + multi-monitor + XWayland the equivalent buffer-queue handling is far less efficient and the resulting frame-pacing variance reads as visual stutter even though the renderer is fast.

Mitigations the client already applies (Linux):

- Forces XWayland via `--ozone-platform=x11` (native Wayland's pointer-constraints implementation has multi-monitor bugs the X11 path doesn't)
- Always-on `BlinkCompositorUseDisplayThreadPriority` + `GpuUseDisplayThreadPriority` so the compositor thread isn't starved by the renderer at high frame rates
- `__GL_SYNC_TO_VBLANK=0` and `__GL_THREADED_OPTIMIZATIONS=1` injected for the NVIDIA proprietary driver
- `disable-accelerated-video-decode/encode/mjpeg-decode` to stop the GPU process from probing libva (not implemented by NVIDIA proprietary)

If you still see visual stutter at 4K with FPS Uncap on, the practical workarounds are:

- Drop the monitor mode to 1080p while playing
- Run the app windowed at 1080p on the 4K display (Mutter only re-composites the damaged window region)
- Disable FPS Uncap and rely on the patched Electron's input-priority fix for input fluidity at the display refresh

This is a Linux-ecosystem limitation rather than something the client can fully paper over.

## Building From Source

1. Install [git](https://git-scm.com/downloads), [Node.js](https://nodejs.org/), and npm
2. Clone and install:
   ```bash
   git clone https://github.com/bigjakk/Krunker-Civilian-Client.git
   cd Krunker-Civilian-Client
   npm install
   ```
3. Run: `npm start` or `npm run dev` (dev mode with sourcemaps)
4. Package: `npm run dist:win` or `npm run dist:linux`

## Credits

- [Crankshaft](https://github.com/KraXen72/crankshaft) by KraXen72 - Original inspiration. Settings Layout, Matchmaker
- [Glorp](https://github.com/slavcp/glorp) by slav - Numerous features for the newer chromium verisions. External Ranked Queue
