#!/bin/bash
# Build script for InboxHunter standalone app (local builds)
# This builds the PyInstaller sidecar and bundles it with the Tauri app
# Usage: ./scripts/build-with-browser.sh

set -e

echo "🚀 InboxHunter Local Build Script"
echo "=================================="

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo ""
echo "📁 Project directory: $PROJECT_DIR"

# Detect architecture for sidecar naming
ARCH=$(uname -m)
OS=$(uname -s)

if [ "$OS" = "Darwin" ]; then
    if [ "$ARCH" = "arm64" ]; then
        SIDECAR_NAME="inboxhunter-automation-aarch64-apple-darwin"
    else
        SIDECAR_NAME="inboxhunter-automation-x86_64-apple-darwin"
    fi
elif [ "$OS" = "Linux" ]; then
    SIDECAR_NAME="inboxhunter-automation-x86_64-unknown-linux-gnu"
else
    SIDECAR_NAME="inboxhunter-automation-x86_64-pc-windows-msvc.exe"
fi

echo "   Architecture: $ARCH"
echo "   OS: $OS"
echo "   Sidecar name: $SIDECAR_NAME"

# Step 1: Setup Python environment
echo ""
echo "🐍 Setting up Python environment..."

cd automation

if [ ! -d "venv" ]; then
    echo "   Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q
pip install pyinstaller -q

# Install Playwright browsers (needed for PyInstaller to bundle correctly)
echo ""
echo "🌐 Installing Playwright for bundling..."
playwright install chromium

# Step 2: Build PyInstaller sidecar
echo ""
echo "📦 Building PyInstaller sidecar..."
echo "   This packages all Python dependencies into a single executable..."

# Clean previous builds
rm -rf dist build *.spec 2>/dev/null || true

pyinstaller \
    --onefile \
    --name "$SIDECAR_NAME" \
    --distpath ./dist \
    --workpath ./build \
    --clean \
    --hidden-import orchestrator \
    --hidden-import agent_orchestrator \
    --hidden-import browser \
    --hidden-import config \
    --hidden-import llm_analyzer \
    --hidden-import database \
    --hidden-import database.operations \
    --hidden-import scrapers \
    --hidden-import scrapers.csv_parser \
    --hidden-import scrapers.meta_ads \
    --hidden-import utils \
    --hidden-import utils.helpers \
    --hidden-import playwright \
    --hidden-import playwright.sync_api \
    --hidden-import playwright.async_api \
    --hidden-import playwright._impl \
    --hidden-import playwright._impl._driver \
    --hidden-import playwright_stealth \
    --hidden-import openai \
    --hidden-import httpx \
    --hidden-import pydantic \
    --hidden-import pydantic_settings \
    --hidden-import sqlite3 \
    --hidden-import loguru \
    --hidden-import colorama \
    --hidden-import faker \
    --hidden-import phonenumbers \
    --hidden-import pandas \
    --hidden-import numpy \
    --hidden-import bs4 \
    --hidden-import lxml \
    --hidden-import sqlalchemy \
    --hidden-import aiohttp \
    --hidden-import aiofiles \
    --hidden-import certifi \
    --collect-all playwright \
    --collect-all certifi \
    --collect-all playwright_stealth \
    --add-data "orchestrator.py:." \
    --add-data "agent_orchestrator.py:." \
    --add-data "browser.py:." \
    --add-data "config.py:." \
    --add-data "llm_analyzer.py:." \
    --add-data "database:database" \
    --add-data "scrapers:scrapers" \
    --add-data "utils:utils" \
    main.py

# Move sidecar to automation folder root (where Tauri will bundle it)
echo ""
echo "   Moving sidecar to automation folder..."
mv "dist/$SIDECAR_NAME" "./$SIDECAR_NAME"
chmod +x "./$SIDECAR_NAME"

echo "   Sidecar built: $(du -h "./$SIDECAR_NAME" | cut -f1)"

# Clean up PyInstaller artifacts
rm -rf dist build *.spec 2>/dev/null || true

cd "$PROJECT_DIR"

# Step 3: Temporarily move venv out of the way (to reduce bundle size)
echo ""
echo "📦 Preparing for Tauri build..."

VENV_BACKUP="/tmp/inboxhunter-venv-backup-$$"
if [ -d "automation/venv" ]; then
    echo "   Moving venv out of bundle path..."
    mv automation/venv "$VENV_BACKUP"
fi

# Function to restore venv and cleanup on exit
cleanup() {
    echo ""
    echo "🔄 Cleaning up..."
    
    # Restore venv
    if [ -d "$VENV_BACKUP" ]; then
        mv "$VENV_BACKUP" automation/venv
        echo "   Restored venv"
    fi
    
    # Remove sidecar from automation folder (it's in the bundle now)
    rm -f "automation/$SIDECAR_NAME" 2>/dev/null || true
}
trap cleanup EXIT

# Step 4: Build the Tauri app
echo ""
echo "🔨 Building Tauri app..."
npm run tauri build

echo ""
echo "✅ Build complete!"
echo ""
echo "📍 App location:"
find src-tauri/target/release/bundle -name "*.app" -o -name "*.dmg" -o -name "*.exe" -o -name "*.AppImage" 2>/dev/null | head -5

echo ""
echo "📝 Note: The app will download the Chromium browser (~150MB)"
echo "   on first run. This only happens once."
echo ""
echo "🎉 Done!"

