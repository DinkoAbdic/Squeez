<div align="center">
  <img src="public/app-icon.svg" alt="Squeez Logo" width="100" align="middle" />
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="design/SVG/squeez-logo.svg" alt="Squeez Text Logo" width="250" align="middle" />
</div>

<h1 align="center">Squeez</h1>

<div align="center">
  <strong>Fast, offline, privacy-first bulk image optimizer built with Tauri & React.</strong>
</div>
<br />

<div align="center">
  <a href="https://github.com/DinkoAbdic/Squeez/releases">
    <img src="https://img.shields.io/github/v/release/DinkoAbdic/Squeez?style=for-the-badge&color=f15d22" alt="Release" />
  </a>
  <a href="https://github.com/DinkoAbdic/Squeez/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/DinkoAbdic/Squeez?style=for-the-badge&color=f15d22" alt="License" />
  </a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-f15d22?style=for-the-badge" alt="Platforms" />
</div>

<br />

Squeez is a blazing-fast desktop application designed to compress, resize, and convert images locally on your machine. All processing happens entirely offline, ensuring maximum privacy and security.

## ✨ Features

- **🚀 Lightning Fast:** Powered by Rust underneath for native processing speeds.
- **🔒 Privacy First:** 100% offline. No images are ever uploaded to any servers.
- **📦 Bulk Processing:** Drag and drop hundreds of images and process them in seconds.
- **🎨 Format Conversion:** Supports modern formats including WebP, AVIF, JPEG, and PNG.
- **⚙️ Advanced Cropping & Resizing:** Perfect for generating standardized social media assets.
- **💻 Cross-Platform:** Available for Windows, macOS, and Linux natively.

## 📥 Download

| Platform | Download | Notes |
|----------|----------|-------|
| **Windows** (x64) | [Squeez_0.1.1_x64-setup.exe](https://github.com/DinkoAbdic/Squeez/releases/download/v0.1.1/Squeez_0.1.1_x64-setup.exe) | NSIS installer |
| **macOS** (Universal) | [Squeez_0.1.1_universal.dmg](https://github.com/DinkoAbdic/Squeez/releases/download/v0.1.1/Squeez_0.1.1_universal.dmg) | Intel & Apple Silicon |
| **Linux** (Debian/Ubuntu) | [Squeez_0.1.1_amd64.deb](https://github.com/DinkoAbdic/Squeez/releases/download/v0.1.1/Squeez_0.1.1_amd64.deb) | `sudo dpkg -i` |
| **Linux** (Universal) | [Squeez_0.1.1_amd64.AppImage](https://github.com/DinkoAbdic/Squeez/releases/download/v0.1.1/Squeez_0.1.1_amd64.AppImage) | Portable, no install |

Or browse all assets on the [Releases page](https://github.com/DinkoAbdic/Squeez/releases).

Squeez includes built-in auto-updates — once installed, you'll be notified when a new version is available.

## 🛠️ Technology Stack

Squeez is built using modern desktop and web technologies:
- **[Tauri v2](https://tauri.app/):** The framework for building tiny, blazing fast binaries.
- **[Rust](https://www.rust-lang.org/):** Handles the intensive image processing logic safely and concurrently.
- **[React 19](https://react.dev/):** Powers the user interface.
- **[Vite](https://vitejs.dev/):** Blazing fast frontend build tool.

## 🚀 Development Setup

Want to contribute or build Squeez from source? Follow these instructions:

### Prerequisites
1. Ensure you have [Node.js](https://nodejs.org/) installed.
2. Ensure you have [Rust](https://www.rust-lang.org/tools/install) installed along with the required C++ build tools for your platform.
   - *Windows:* Visual Studio C++ Build Tools
   - *macOS:* Command Line Tools (`xcode-select --install`)
3. Install Tauri dependencies as detailed in the [Tauri Prerequisites Guide](https://tauri.app/v1/guides/getting-started/prerequisites).

### Running Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/DinkoAbdic/Squeez.git
   cd Squeez
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Run the development server (This will open the Squeez app window):
   ```bash
   npm run tauri dev
   ```

### Building for Production

To compile Squeez into an executable installer for your current platform:

```bash
npm run tauri build
```
The final installer will be located in `src-tauri/target/release/bundle/`.

## 📄 License

Squeez is open-source software licensed under the [MIT License](LICENSE).
