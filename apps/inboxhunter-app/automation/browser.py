"""
Browser automation with stealth features.
"""

import asyncio
import os
import random
import subprocess
import sys
from pathlib import Path
from typing import Optional, Dict, Any

from playwright.async_api import async_playwright, Browser, BrowserContext, Page, Playwright
from loguru import logger

from utils.helpers import get_app_data_directory
from utils.simple_logger import slog


def get_browser_cache_path() -> Path:
    """Get the path where browsers should be cached."""
    return get_app_data_directory() / "playwright-browsers"


def is_browser_installed(browser_path: Path) -> bool:
    """Check if Chromium browser is installed in the given path."""
    import glob
    chromium_pattern = str(browser_path / "chromium-*")
    chromium_dirs = glob.glob(chromium_pattern)
    return len(chromium_dirs) > 0


def download_browser_with_progress(browser_path: Path, cmd: list, env: dict) -> bool:
    """Run browser download with real-time progress output."""
    import threading
    import time
    
    # Progress indicator
    stop_progress = threading.Event()
    download_complete = threading.Event()
    
    def progress_indicator():
        """Show a simple progress indicator while downloading."""
        symbols = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
        idx = 0
        start_time = time.time()
        while not stop_progress.is_set():
            elapsed = int(time.time() - start_time)
            mins, secs = divmod(elapsed, 60)
            logger.info(f"   {symbols[idx % len(symbols)]} Downloading browser... ({mins}m {secs}s elapsed)")
            idx += 1
            time.sleep(2)  # Update every 2 seconds
    
    # Start progress indicator in background
    progress_thread = threading.Thread(target=progress_indicator, daemon=True)
    progress_thread.start()
    
    try:
        # Run with real-time output
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
            bufsize=1,
            universal_newlines=True
        )
        
        # Stream output
        output_lines = []
        for line in process.stdout:
            line = line.strip()
            if line:
                output_lines.append(line)
                # Log meaningful progress lines
                if any(x in line.lower() for x in ['downloading', 'progress', '%', 'mb', 'extracting', 'chromium']):
                    logger.info(f"   📦 {line}")
        
        process.wait(timeout=600)
        return process.returncode == 0
        
    except subprocess.TimeoutExpired:
        process.kill()
        raise
    finally:
        stop_progress.set()


def download_browser(browser_path: Path) -> bool:
    """
    Download Playwright Chromium browser.
    Uses Playwright's internal driver which is bundled with PyInstaller.
    Returns True if successful.
    """
    logger.info("=" * 50)
    logger.info("📥 DOWNLOADING BROWSER (first run only)")
    logger.info("=" * 50)
    logger.info("   This downloads ~150MB and may take a few minutes...")
    logger.info("   The browser will be cached for future use.")
    logger.info("")
    
    browser_path.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PLAYWRIGHT_BROWSERS_PATH"] = str(browser_path)
    
    try:
        # Method 1: Use Playwright's bundled driver executable
        logger.info("⏳ Locating Playwright driver...")
        from playwright._impl._driver import compute_driver_executable
        driver_info = compute_driver_executable()
        
        # compute_driver_executable returns a tuple: (node_executable, cli_js_path)
        if isinstance(driver_info, tuple):
            node_exe, cli_js = driver_info
            cmd = [str(node_exe), str(cli_js), "install", "chromium"]
            logger.info(f"✅ Found Playwright driver")
        else:
            # Older versions might return just a path
            cmd = [str(driver_info), "install", "chromium"]
            logger.info(f"✅ Found Playwright driver")
        
        logger.info("⏳ Starting download...")
        
        # Try with progress
        try:
            success = download_browser_with_progress(browser_path, cmd, env)
            if success or is_browser_installed(browser_path):
                logger.info("")
                logger.success("✅ Browser downloaded successfully!")
                logger.info("=" * 50)
                return True
        except Exception as e:
            logger.debug(f"Progress download failed: {e}")
        
        # Fallback to simple run
        logger.info("   Trying alternative method...")
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=env,
            timeout=600  # 10 minute timeout
        )
        
        if result.returncode == 0:
            logger.info("")
            logger.success("✅ Browser downloaded successfully!")
            logger.info("=" * 50)
            return True
        
        # Check if it was actually installed despite non-zero return
        if is_browser_installed(browser_path):
            logger.info("")
            logger.success("✅ Browser installed!")
            logger.info("=" * 50)
            return True
            
        logger.warning(f"   Download output: {result.stdout}")
        if result.stderr:
            logger.warning(f"   Download stderr: {result.stderr}")
            
    except subprocess.TimeoutExpired:
        logger.error("❌ Browser download timed out. Please check your internet connection.")
    except ImportError as e:
        logger.warning(f"   Could not import Playwright driver: {e}")
    except Exception as e:
        logger.warning(f"   Download method 1 failed: {e}")
    
    # Method 2: Try using playwright CLI directly (for non-frozen environments)
    if not getattr(sys, 'frozen', False):
        try:
            logger.info("   Trying alternative download method...")
            result = subprocess.run(
                [sys.executable, "-m", "playwright", "install", "chromium"],
                capture_output=True,
                text=True,
                env=env,
                timeout=600
            )
            
            if result.returncode == 0 or is_browser_installed(browser_path):
                logger.success("✅ Browser downloaded successfully!")
                return True
                
        except Exception as e:
            logger.warning(f"   Alternative method failed: {e}")
    
    return is_browser_installed(browser_path)


def ensure_browser_ready() -> Optional[Path]:
    """
    Ensure Playwright browser is ready to use.
    Downloads on first run if needed.
    Returns the browser path or None if unavailable.
    """
    slog.detail("⏳ Checking browser installation...")
    
    browser_path = get_browser_cache_path()
    
    # Set environment variable so Playwright uses our cache location
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(browser_path)
    
    # Check if browser is already installed
    if is_browser_installed(browser_path):
        slog.detail("✅ Browser already installed and ready")
        return browser_path
    
    # Browser not found - download it (show this even in simple mode)
    logger.info("🔍 Browser not found - downloading...")
    slog.detail("   Cache location: " + str(browser_path))
    
    if download_browser(browser_path):
        return browser_path
    
    # Download failed - will fall back to system Chrome
    logger.warning("⚠️ Could not download browser, will try system Chrome as fallback")
    return None


class BrowserAutomation:
    """
    Browser automation with stealth features.
    Designed to bypass bot detection.
    """
    
    def __init__(self, headless: bool = False):
        """
        Initialize browser automation.
        
        Args:
            headless: Run browser in headless mode
        """
        self.headless = headless
        self.playwright: Optional[Playwright] = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
    
    async def initialize(self):
        """Initialize Playwright and browser with stealth."""
        slog.detail("🚀 Initializing browser automation...")
        slog.detail(f"   Headless mode: {self.headless}")
        
        # Ensure browser is downloaded and ready
        browser_path = ensure_browser_ready()
        
        slog.detail("⏳ Starting Playwright engine...")
        self.playwright = await async_playwright().start()
        slog.detail("✅ Playwright engine started")
        
        # Browser launch options with stealth
        launch_options = {
            "headless": self.headless,
            "args": [
                "--disable-blink-features=AutomationControlled",
                "--disable-features=IsolateOrigins,site-per-process",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--disable-gpu",
                "--window-size=1920,1080",
            ]
        }
        
        browser_launched = False
        
        # Try Playwright's cached Chromium first
        if browser_path:
            try:
                slog.detail("⏳ Launching browser...")
                self.browser = await self.playwright.chromium.launch(**launch_options)
                slog.detail_success("✅ Browser launched (Playwright Chromium)")
                browser_launched = True
            except Exception as e:
                slog.detail_warning(f"⚠️ Could not launch cached browser: {e}")
        
        # Fallback to system Chrome if cached browser didn't work
        if not browser_launched:
            slog.detail("🔄 Trying system Chrome as fallback...")
            launch_options["channel"] = "chrome"
            try:
                self.browser = await self.playwright.chromium.launch(**launch_options)
                slog.detail_success("✅ Browser launched (system Chrome)")
                browser_launched = True
            except Exception as e2:
                raise Exception(
                    f"No browser available.\n\n"
                    f"The app tried to download a browser automatically but failed.\n"
                    f"Please check your internet connection and try again, "
                    f"or install Google Chrome manually.\n\n"
                    f"Error: {e2}"
                )
        
        # Create context with stealth settings
        # Use platform-appropriate user agent to avoid detection
        import platform
        system = platform.system()
        if system == "Darwin":
            user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        elif system == "Linux":
            user_agent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        else:  # Windows
            user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

        context_options = {
            "viewport": {"width": 1920, "height": 1080},
            "user_agent": user_agent,
            "locale": "en-US",
            "timezone_id": "America/New_York",
            "ignore_https_errors": True,  # Ignore SSL certificate errors
        }
        
        self.context = await self.browser.new_context(**context_options)
        
        # Apply stealth scripts
        await self._apply_stealth_scripts()
        
        # Create page
        self.page = await self.context.new_page()
        
        # Setup event handlers - only log in detailed mode
        self.page.on("console", lambda msg: slog.detail_debug(f"Browser: {msg.text}"))
        self.page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
        
        slog.detail_success("✅ Browser initialized with stealth features")
    
    async def _apply_stealth_scripts(self):
        """Apply stealth JavaScript patches."""
        stealth_script = """
        // Override navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });
        
        // Override navigator.plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });
        
        // Override navigator.languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en'],
        });
        
        // Fix chrome.runtime
        window.chrome = {
            runtime: {},
        };
        
        // Fix permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
        """
        
        await self.context.add_init_script(stealth_script)
    
    async def navigate(self, url: str, wait_until: str = "domcontentloaded") -> bool:
        """
        Navigate to a URL.

        Args:
            url: URL to navigate to
            wait_until: Wait condition

        Returns:
            True if successful
        """
        self.last_error = None  # Reset error
        try:
            slog.detail(f"Navigating to: {url}")

            await asyncio.sleep(random.uniform(0.5, 1.5))

            response = await self.page.goto(
                url,
                wait_until=wait_until,
                timeout=45000
            )

            await asyncio.sleep(2)

            if response and response.ok:
                slog.detail_success(f"✅ Page loaded: {url}")
                return True
            else:
                slog.detail_warning(f"Page status: {response.status if response else 'No response'}")
                return True  # Continue anyway

        except Exception as e:
            error_str = str(e)
            # Parse specific error types for better messages
            if "ERR_CERT" in error_str:
                self.last_error = "SSL certificate error"
            elif "ERR_NAME_NOT_RESOLVED" in error_str:
                self.last_error = "Domain not found"
            elif "ERR_CONNECTION_REFUSED" in error_str:
                self.last_error = "Connection refused"
            elif "ERR_CONNECTION_TIMED_OUT" in error_str or "Timeout" in error_str:
                self.last_error = "Connection timed out"
            elif "ERR_ABORTED" in error_str:
                self.last_error = "Page load aborted"
            elif "Target page, context or browser has been closed" in error_str:
                self.last_error = "Browser was closed"
            elif "ERR_TOO_MANY_REDIRECTS" in error_str:
                self.last_error = "Too many redirects"
            elif "ERR_EMPTY_RESPONSE" in error_str:
                self.last_error = "Empty response from server"
            else:
                self.last_error = f"Navigation failed: {error_str[:100]}"

            slog.detail_warning(f"Navigation error: {self.last_error}")
            return False
    
    async def take_screenshot(self, name: str = "screenshot") -> Optional[str]:
        """Take a screenshot."""
        try:
            from utils.helpers import get_app_data_directory
            screenshots_dir = get_app_data_directory() / "screenshots"
            screenshots_dir.mkdir(parents=True, exist_ok=True)
            
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filepath = screenshots_dir / f"{name}_{timestamp}.png"
            
            await self.page.screenshot(path=str(filepath), full_page=True)
            slog.detail(f"Screenshot saved: {filepath}")
            return str(filepath)
            
        except Exception as e:
            slog.detail_warning(f"Screenshot error: {e}")
            return None
    
    async def close(self):
        """Close browser and cleanup gracefully."""
        try:
            # Close in order: page -> context -> browser -> playwright
            if self.page:
                try:
                    await self.page.close()
                except Exception:
                    pass  # Page might already be closed
                self.page = None
                
            if self.context:
                try:
                    await self.context.close()
                except Exception:
                    pass  # Context might already be closed
                self.context = None
                
            if self.browser:
                try:
                    await self.browser.close()
                except Exception:
                    pass  # Browser might already be closed
                self.browser = None
            
            # Small delay to allow pending operations to complete
            await asyncio.sleep(0.1)
            
            if self.playwright:
                try:
                    await self.playwright.stop()
                except Exception:
                    pass  # Playwright might already be stopped
                self.playwright = None
            
            slog.detail("Browser closed")
            
        except Exception as e:
            slog.detail_debug(f"Browser cleanup note: {e}")

