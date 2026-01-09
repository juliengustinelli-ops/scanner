#!/usr/bin/env python3
"""
Build script to create a standalone executable from the automation scripts.
Uses PyInstaller to bundle Python and all dependencies into a single executable.
"""

import os
import sys
import subprocess
import platform
import shutil

# Handle Windows console encoding issues
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

def get_platform_suffix():
    """Get the platform-specific suffix for the executable."""
    system = platform.system().lower()
    machine = platform.machine().lower()
    
    if system == "darwin":
        if machine == "arm64":
            return "aarch64-apple-darwin"
        else:
            return "x86_64-apple-darwin"
    elif system == "windows":
        return "x86_64-pc-windows-msvc"
    elif system == "linux":
        return "x86_64-unknown-linux-gnu"
    else:
        return f"{machine}-{system}"

def install_dependencies():
    """Install PyInstaller and other build dependencies."""
    print("📦 Installing build dependencies...")
    subprocess.run([
        sys.executable, "-m", "pip", "install", "--upgrade",
        "pyinstaller", "playwright"
    ], check=True)

def install_playwright_browsers():
    """Install Playwright browsers."""
    print("🌐 Installing Playwright browsers...")
    subprocess.run([
        sys.executable, "-m", "playwright", "install", "chromium"
    ], check=True)

def build_executable():
    """Build the standalone executable using PyInstaller."""
    print("🔨 Building standalone executable...")
    
    # Get the automation directory
    automation_dir = os.path.dirname(os.path.abspath(__file__))
    main_script = os.path.join(automation_dir, "main.py")
    
    # Output name based on platform
    platform_suffix = get_platform_suffix()
    exe_name = f"inboxhunter-automation-{platform_suffix}"
    
    # PyInstaller command
    pyinstaller_args = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",  # Single executable
        "--name", exe_name,
        "--distpath", os.path.join(automation_dir, "dist"),
        "--workpath", os.path.join(automation_dir, "build"),
        "--specpath", os.path.join(automation_dir, "build"),
        "--clean",
        # Hidden imports that PyInstaller might miss
        "--hidden-import", "playwright",
        "--hidden-import", "playwright.sync_api",
        "--hidden-import", "openai",
        "--hidden-import", "httpx",
        "--hidden-import", "pydantic",
        "--hidden-import", "sqlite3",
        "--hidden-import", "json",
        "--hidden-import", "asyncio",
        "--hidden-import", "loguru",
        "--hidden-import", "colorama",
        "--hidden-import", "sqlalchemy",
        "--hidden-import", "sqlalchemy.ext.declarative",
        "--hidden-import", "beautifulsoup4",
        "--hidden-import", "bs4",
        "--hidden-import", "lxml",
        "--hidden-import", "requests",
        "--hidden-import", "aiohttp",
        "--hidden-import", "aiofiles",
        "--hidden-import", "faker",
        "--hidden-import", "phonenumbers",
        "--hidden-import", "certifi",
        "--hidden-import", "pydantic_settings",
        "--hidden-import", "dotenv",
        # Collect all playwright data
        "--collect-all", "playwright",
        # The main script
        main_script
    ]
    
    subprocess.run(pyinstaller_args, check=True, cwd=automation_dir)
    
    # Get output path
    system = platform.system().lower()
    if system == "windows":
        exe_path = os.path.join(automation_dir, "dist", f"{exe_name}.exe")
    else:
        exe_path = os.path.join(automation_dir, "dist", exe_name)
    
    print(f"✅ Executable built: {exe_path}")
    return exe_path

def copy_to_sidecar_location(exe_path):
    """Copy the executable to the Tauri sidecar location."""
    automation_dir = os.path.dirname(os.path.abspath(__file__))
    tauri_src = os.path.join(automation_dir, "..", "src-tauri")
    binaries_dir = os.path.join(tauri_src, "binaries")
    
    os.makedirs(binaries_dir, exist_ok=True)
    
    dest_path = os.path.join(binaries_dir, os.path.basename(exe_path))
    shutil.copy2(exe_path, dest_path)
    
    # Make executable on Unix
    if platform.system() != "Windows":
        os.chmod(dest_path, 0o755)
    
    print(f"✅ Copied to sidecar location: {dest_path}")
    return dest_path

def main():
    print("🚀 Building InboxHunter Automation Executable")
    print("=" * 50)
    
    try:
        # Step 1: Install dependencies
        install_dependencies()
        
        # Step 2: Build executable
        exe_path = build_executable()
        
        # Step 3: Copy to sidecar location
        sidecar_path = copy_to_sidecar_location(exe_path)
        
        print("\n" + "=" * 50)
        print("✅ Build complete!")
        print(f"   Executable: {exe_path}")
        print(f"   Sidecar: {sidecar_path}")
        print("\nNext steps:")
        print("1. Run 'npm run tauri build' to build the app")
        print("2. The automation will be bundled automatically")
        
    except subprocess.CalledProcessError as e:
        print(f"❌ Build failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

