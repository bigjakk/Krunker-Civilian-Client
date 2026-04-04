# Krunker Civilian Client

> a high-performance krunker client with unlimited FPS, built on a custom-patched Electron

**Download:**
[Windows (x64)](https://github.com/bigjakk/Krunker-Civilian-Client/releases/latest) -
[Linux (AppImage)](https://github.com/bigjakk/Krunker-Civilian-Client/releases/latest)

## Features

- unlimited FPS with no aim freeze (custom Electron build, see [below](#custom-electron-build))
- unobtrusive — all features can be disabled, no watermarks
- hides ads by default
- resource swapper (textures, sounds, models)
- CSS theme system (drop `.css` files in `swap/themes/`)
- custom loading screen backgrounds (`swap/backgrounds/`)
- customisable matchmaker with lobby scan animation
  - filter by region, gamemode, map, player count, remaining time
  - auto-join with server capacity verification
- tabbed hub/social pages with drag-and-drop reorder
- better chat — merged team/all chat with `[T]`/`[M]` prefixes
- chat history preservation (Krunker prunes old messages, this prevents it)
- real-time chat translator (Google Translate, 15+ languages)
- userscript support (Tampermonkey-style metadata, per-script settings)
- alt account manager with encrypted credential storage
- Discord RPC (gamemode, map, class, spectator status)
- raw input / unadjusted movement (Windows)
- show numeric ping in player list
- double ping display (Krunker shows half the real value)
- hardpoint enemy counter HUD
- cleaner menu mode (hides clutter)
- changelog popup on update
- configurable keybinds with visual rebinding dialog
- configurable ANGLE backend (D3D11, OpenGL, Vulkan, D3D9, D3D11on12)
- advanced Chromium flag settings (GPU rasterization, low latency, QUIC, and more)
- CPU throttling (game vs menu) and process priority control
- auto-updater
- maintained & open source

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

- Built on ideas from [Crankshaft](https://github.com/KraXen72/crankshaft) by KraXen72
- Inspired by [Glorp](https://github.com/slavcp/glorp) by slav
