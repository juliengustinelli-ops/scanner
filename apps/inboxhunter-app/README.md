# InboxHunter

AI-powered lead generation and automation platform. A modern cross-platform desktop application that automatically signs up for email lists on landing pages.

## ✨ Features

- **Vision-Enhanced AI Agent**: GPT-4o Vision analyzes screenshots for intelligent navigation and form filling
- **Continuous Reasoning Loop**: Observe → Reason → Act → Validate cycle
- **Multi-Source Scraping**: Meta Ads Library, CSV files
- **Intelligent Field Detection**: Automatically identifies email, name, phone fields
- **Bot Detection Bypass**: Advanced stealth techniques
- **CAPTCHA Solving**: Integrated with 2Captcha service
- **Duplicate Prevention**: SQLite database tracks all sign-ups
- **Modern GUI**: Beautiful React-based desktop application
- **Cross-Platform**: Windows, macOS, and Linux support

## 🏗️ Architecture

```
inboxhunter-app/
├── src/                    # React frontend
│   ├── App.tsx             # Main application
│   ├── pages/              # Dashboard, Settings, Logs
│   ├── hooks/              # State management (Zustand)
│   └── components/         # UI components
├── src-tauri/              # Rust backend (Tauri)
│   ├── src/
│   │   ├── main.rs         # Entry point
│   │   ├── commands.rs     # IPC commands
│   │   └── db.rs           # SQLite operations
│   └── tauri.conf.json     # Tauri configuration
├── automation/             # Python automation engine
│   ├── venv/               # Python virtual environment (created during setup)
│   ├── main.py             # Entry point
│   ├── orchestrator.py     # Bot orchestrator
│   ├── agent_orchestrator.py # AI reasoning loop
│   ├── browser.py          # Playwright automation
│   ├── llm_analyzer.py     # GPT-4o integration
│   ├── scrapers/           # URL scrapers
│   └── database/           # SQLite operations
└── package.json
```

---

## 📋 Prerequisites

Before you can build or run the app, you need to install the following:

### 1. 🦀 Rust (REQUIRED)

Tauri is built with Rust, so you **must install Rust** before running or building the app.

#### Windows

1. Download the installer from **https://rustup.rs**
2. Run `rustup-init.exe`
3. Press **Enter** to accept the default installation
4. **Restart your terminal** (close and reopen)
5. Verify installation:
   ```powershell
   rustc --version
   cargo --version
   ```

**Alternative (using winget):**
```powershell
winget install Rustlang.Rustup
# Restart terminal after installation
```

#### macOS

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Restart terminal or run:
source ~/.cargo/env

# Verify
rustc --version
cargo --version
```

#### Linux (Ubuntu/Debian)

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Restart terminal or run:
source ~/.cargo/env

# Verify
rustc --version
cargo --version
```

---

### 2. 📦 Node.js 18+

Download from **https://nodejs.org** or use a version manager:

```bash
# Check version (must be 18 or higher)
node --version
npm --version
```

---

### 3. 🐍 Python 3.9 (Recommended)

Python 3.9 is recommended for best compatibility with all dependencies. Python 3.10-3.12 also work.

Download from **https://python.org/downloads/release/python-3913/** or use your system package manager:

```bash
# Check version (should be 3.9.x for best compatibility)
python3 --version

# Or check if Python 3.9 is available
python3.9 --version
```

**macOS (Homebrew):**
```bash
brew install python@3.9
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt install python3.9 python3.9-venv
```

---

### 4. 🔧 Platform-Specific Dependencies

#### Windows

**Microsoft Visual Studio C++ Build Tools** are **required** to compile Rust code. Without them, you'll get `linker link.exe not found` errors.

**Option 1: Install via winget (Recommended)**
```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

**Option 2: Manual Installation**
1. Download **Build Tools for Visual Studio 2022** from [visualstudio.microsoft.com/downloads](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
2. Run the installer
3. Select **"Desktop development with C++"** workload
4. Click Install and wait for completion
5. **Restart your terminal**

**WebView2** is included in Windows 10/11. If you're on an older version, download it from [developer.microsoft.com/microsoft-edge/webview2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

#### macOS
```bash
xcode-select --install
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget \
    libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

---

## 🚀 Quick Start (Development)

### 1. Clone and Install Node Dependencies

```bash
cd inboxhunter-app
npm install
```

### 2. Set Up Python Virtual Environment

The app uses a local Python virtual environment inside the `automation` folder. This ensures all dependencies are isolated and the app works consistently.

> **Important:** Python 3.9 is recommended for best compatibility. Python 3.10-3.12 also work.

#### macOS / Linux

```bash
cd automation

# Create virtual environment with Python 3.9 (recommended)
# If you have multiple Python versions, specify the path:
python3.9 -m venv venv
# OR if python3.9 is your default:
python3 -m venv venv

# Activate it
source venv/bin/activate

# Upgrade pip first
pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt

# Install Playwright browser
playwright install chromium

# Deactivate (optional - the app will use the venv automatically)
deactivate

cd ..
```

#### Windows

```powershell
cd automation

# Create virtual environment with Python 3.9 (recommended)
# Use py launcher to specify version:
py -3.9 -m venv venv
# OR if python 3.9 is your default:
python -m venv venv

# Activate it
.\venv\Scripts\activate

# Upgrade pip first
pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt

# Install Playwright browser
playwright install chromium

# Deactivate (optional)
deactivate

cd ..
```

#### Installing Python 3.9 (if not installed)

**macOS (using Homebrew):**
```bash
brew install python@3.9
# Then use: /opt/homebrew/bin/python3.9 -m venv venv
```

**Windows:**
Download from https://www.python.org/downloads/release/python-3913/

**Linux (Ubuntu/Debian):**
```bash
sudo apt install python3.9 python3.9-venv
# Then use: python3.9 -m venv venv
```

### 3. Run the App

```bash
# Full app (requires Rust + Python venv setup)
npm run tauri:dev

# OR just the frontend (no Rust needed, for UI preview only)
npm run dev
# Then open http://localhost:1420
```

> **Note:** The app automatically detects the Python virtual environment in `automation/venv/`. You don't need to activate it manually when running the app.

---

## 📦 Building Installers

### 🪟 Windows (.exe / .msi)

```powershell
# Ensure Rust is installed first!
rustc --version

# Install Node dependencies
npm install

# Set up Python environment
cd automation
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
deactivate
cd ..

# Build installer
npm run tauri:build
```

**Output:** `src-tauri/target/release/bundle/msi/InboxHunter_*.msi`

---

### 🍎 macOS (.dmg / .app)

```bash
# Install Xcode tools
xcode-select --install

# Ensure Rust is installed
rustc --version

# Install Node dependencies
npm install

# Set up Python environment
cd automation
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium
deactivate
cd ..

# Build installer
npm run tauri:build
```

**Output:** `src-tauri/target/release/bundle/dmg/InboxHunter_*.dmg`

**Apple Silicon (M1/M2/M3):**
```bash
npm run tauri:build -- --target aarch64-apple-darwin
```

---

### 🐧 Linux (.deb / .AppImage)

```bash
# Install system dependencies (Ubuntu/Debian)
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget \
    libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Ensure Rust is installed
rustc --version

# Install Node dependencies
npm install

# Set up Python environment
cd automation
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium
deactivate
cd ..

# Build installer
npm run tauri:build
```

**Output:**
- `src-tauri/target/release/bundle/deb/inboxhunter_*.deb`
- `src-tauri/target/release/bundle/appimage/inboxhunter_*.AppImage`

---

## 📲 Post-Installation Steps (Important!)

After downloading and installing InboxHunter, follow these platform-specific steps:

### 🍎 macOS (Required)

macOS blocks apps that aren't from the App Store or notarized by Apple. **Run this command in Terminal after installing:**

```bash
xattr -cr /Applications/InboxHunter.app
```

This removes the quarantine flag that macOS adds to downloaded apps. The app is safe - this is just Apple's security measure for non-App Store apps.

**Alternative method:**
1. Right-click (or Control-click) on InboxHunter.app
2. Select "Open" from the context menu
3. Click "Open" in the dialog

**Apple Silicon (M1/M2/M3):** If you encounter issues, install Rosetta:
```bash
softwareupdate --install-rosetta
```

---

### 🪟 Windows

**Windows SmartScreen Warning:**
When you run the installer, Windows may show a SmartScreen warning because the app isn't signed with an expensive code signing certificate.

1. Click **"More info"**
2. Click **"Run anyway"**

The app is completely safe - this warning appears for any app not purchased from Microsoft.

---

### 🐧 Linux

**For AppImage:**
```bash
# Make it executable
chmod +x InboxHunter.AppImage

# Run it
./InboxHunter.AppImage
```

**For .deb package:**
```bash
sudo dpkg -i InboxHunter_*.deb
```

**Missing dependencies (Ubuntu/Debian):**
```bash
sudo apt install libwebkit2gtk-4.0-dev libayatana-appindicator3-dev librsvg2-dev
```

---

## ⚙️ Configuration

### Required Settings

1. **Credentials**: Your signup information (name, email, phone)
2. **OpenAI API Key**: For AI-powered form filling (get from [platform.openai.com](https://platform.openai.com/api-keys))

### Optional Settings

- **2Captcha API Key**: For automatic CAPTCHA solving
- **Data Source**: Meta Ads Library or CSV file
- **Rate Limiting**: Delay between signups

---

## 🎯 How It Works

1. **Scrape URLs**: Get landing page URLs from Meta Ads Library or CSV
2. **Navigate**: Open landing page in stealth browser
3. **Analyze**: AI analyzes the page with GPT-4o Vision
4. **Fill Forms**: Automatically fill email, name, phone fields
5. **Submit**: Click submit and verify success
6. **Track**: Record results in local database

---

## 🔧 Development

### Frontend Only (No Rust Required)

If you just want to work on the UI without Rust:

```bash
npm run dev
# Opens at http://localhost:1420
```

### Full App (Requires Rust + Python)

```bash
npm run tauri:dev
```

### Backend (Rust/Tauri)

```bash
cd src-tauri
cargo build          # Build Rust backend
cargo test           # Run tests
```

### Automation (Python Standalone)

```bash
cd automation
source venv/bin/activate  # or .\venv\Scripts\activate on Windows
python main.py --config /path/to/config.json --debug
```

---

## 🐛 Troubleshooting

### "failed to get cargo metadata: program not found"

**Rust is not installed.** Follow the Rust installation instructions above, then **restart your terminal**.

```bash
# Verify Rust is installed
rustc --version
cargo --version
```

### "ModuleNotFoundError: No module named 'loguru'" (or any Python module)

The Python virtual environment is not set up. Run the setup commands:

```bash
cd automation
python3 -m venv venv
source venv/bin/activate  # or .\venv\Scripts\activate on Windows
pip install -r requirements.txt
playwright install chromium
```

### "Python not found" error in the app

Make sure you've created the virtual environment in the correct location:
- The venv must be at `automation/venv/` (not somewhere else)
- Run `ls automation/venv/bin/python` (macOS/Linux) or `dir automation\venv\Scripts\python.exe` (Windows) to verify

### "Browser not found"

```bash
cd automation
source venv/bin/activate
playwright install chromium
```

### App won't open (macOS/Windows/Linux)

See the **[Post-Installation Steps](#-post-installation-steps-important)** section above for OS-specific instructions to enable the app.

### "Cannot find module '@tauri-apps/cli-win32-x64-msvc'" (Windows)

This happens when `node_modules` was installed on a different platform (e.g., macOS). The Tauri CLI includes platform-specific binaries.

**Fix:** Clean install the dependencies:
```powershell
# Delete node_modules and package-lock.json
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json

# Reinstall
npm install
```

### "linker `link.exe` not found" (Windows)

This means **Visual Studio C++ Build Tools** are not installed.

**Fix:** Install the build tools:
```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Then **restart your terminal** and try again.

### Switching between macOS and Windows development

When switching between operating systems, you must reinstall dependencies because some packages (like `@tauri-apps/cli`) include platform-specific binaries:

```bash
# Delete and reinstall node_modules
rm -rf node_modules package-lock.json  # macOS/Linux
# OR
Remove-Item -Recurse -Force node_modules; Remove-Item -Force package-lock.json  # Windows

npm install
```

---

## 📊 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, TypeScript, Tailwind CSS |
| Desktop | Tauri (Rust) |
| Automation | Python, Playwright |
| AI | GPT-4o Vision via OpenAI API |
| Database | SQLite |
| Build | Vite, Cargo |

---

## 📄 License

Proprietary - All Rights Reserved

## 🤝 Support

For issues or questions, contact the development team.
