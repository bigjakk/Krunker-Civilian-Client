# Building Patched Electron 42 (Input Priority Fix)

This builds a custom Electron with a one-line Chromium patch that fixes input starvation ("aim freeze") when `--disable-frame-rate-limit` is active. Without this patch, uncapped frame rates cause 50-300ms input delays in GPU-intensive applications like browser FPS games.

## The Problem

Chromium's main thread scheduler gives input tasks `kHighestPriority`. At uncapped frame rates, the compositor floods the task queue and input events get starved — your mouse movements are delayed by up to 300ms, then snap to catch up. Chromium 87-93 had `ImplLatencyRecovery`/`MainLatencyRecovery` features that mitigated this, but they were removed in Chromium 94.

## The Fix

One line in `main_thread_scheduler_impl.cc` — demote input tasks from `kHighestPriority` to `kNormalPriority`, allowing the scheduler's anti-starvation logic to fairly interleave input and compositor work.

## Prerequisites

- **OS**: Windows 10/11 x64 (builds on Linux too, adjust paths accordingly)
- **Disk**: ~100 GB free (Chromium source + build artifacts)
- **RAM**: 16 GB minimum, 32 GB recommended
- **Visual Studio 2022** with "Desktop development with C++" workload and Windows 11 SDK
- **Git** and **Python 3.8+** on PATH

## Step 1: Install depot_tools

```powershell
cd C:\
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
# Add C:\depot_tools to the FRONT of your system PATH
# Then open a NEW terminal
```

Verify: `gclient --version` should print a version.

## Step 2: Check out Electron source

```powershell
mkdir C:\electron && cd C:\electron

# Create gclient config for Electron
gclient config --name "src/electron" --unmanaged https://github.com/nicedayzhu/electron.git@v42.0.0-nightly.20260227
```

> **Note**: Replace the repo URL with your fork if you've pushed the patch there. The `@v42.0.0-nightly.20260227` pins the exact nightly tag.

```powershell
# Sync all dependencies (~40-60 GB download, takes a while)
gclient sync --with_branch_heads --with_tags
```

## Step 3: Apply the patch

```powershell
cd C:\electron\src

# Apply the patch file
git apply --directory=. path\to\input-priority-fix.patch
```

Or make the edit manually — in `third_party/blink/renderer/platform/scheduler/main_thread/main_thread_scheduler_impl.cc`, find:

```cpp
case MainThreadTaskQueue::QueueTraits::PrioritisationType::kInput:
    return TaskPriority::kHighestPriority;
```

Change `kHighestPriority` to `kNormalPriority`.

## Step 4: Configure the build

### Release build (optimized, for distribution):

```powershell
cd C:\electron\src

# Create build directory
gn gen out/Release

# Copy the release args
copy path\to\args.release.gn out\Release\args.gn

# Regenerate build files with the new args
gn gen out/Release
```

Contents of `args.release.gn`:
```gn
import("//electron/build/args/release.gn")
is_official_build = true
use_remoteexec = false
use_reclient = false
```

### Testing build (faster compile, for development):

```powershell
gn gen out/Testing
```

Write to `out/Testing/args.gn`:
```gn
import("//electron/build/args/testing.gn")
use_remoteexec = false
use_reclient = false
```

Then: `gn gen out/Testing`

## Step 5: Build

```powershell
cd C:\electron\src

# Release build (~2-4 hours depending on CPU)
ninja -C out/Release electron

# OR Testing build (~1-2 hours, less optimization)
ninja -C out/Testing electron
```

> **Tip**: Use `ninja -C out/Release electron -j N` to limit parallelism if you're running out of RAM (where N = number of parallel jobs, try RAM_GB / 2).

## Step 6: Create distributable zip

```powershell
cd C:\electron\src

# Generate the electron dist zip
python3 electron/script/zip_manifests/create-dist-zip.py out/Release

# Or use electron's strip-binaries + create-dist tooling:
ninja -C out/Release electron:dist_zip
```

The output zip will be at `out/Release/dist.zip` (or similar). This contains `electron.exe` and all required DLLs/resources.

## Step 7: Verify

Extract the zip and test with a minimal app:

```powershell
# Create a test directory
mkdir test-app
```

Create `test-app/package.json`:
```json
{ "name": "test", "version": "1.0.0", "main": "main.js" }
```

Create `test-app/main.js`:
```js
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.whenReady().then(() => {
    const win = new BrowserWindow({ width: 1280, height: 720 });
    win.loadURL('https://krunker.io');
    win.webContents.on('did-finish-load', () => {
        console.log('Electron:', process.versions.electron);
        console.log('Chrome:', process.versions.chrome);
    });
});
```

Run it:
```powershell
path\to\electron.exe test-app
```

If Krunker loads at uncapped FPS with no aim freeze, the build is good.

## Using the patched Electron in a project

To use this as the Electron binary in an npm project:

```powershell
# Set environment variable to point to your custom build
set ELECTRON_OVERRIDE_DIST_PATH=C:\path\to\extracted\electron-dist

# Then run your Electron app normally
npm start
```

Or replace the contents of `node_modules/electron/dist/` with the extracted zip contents.

## Build time estimates

| Build type | CPU | Approx. time |
|---|---|---|
| Testing | 8-core | ~1-2 hours |
| Testing | 16-core | ~30-60 min |
| Release | 8-core | ~3-5 hours |
| Release | 16-core | ~1.5-3 hours |

Release builds are significantly slower due to LTO (Link-Time Optimization) which does a whole-program optimization pass.
