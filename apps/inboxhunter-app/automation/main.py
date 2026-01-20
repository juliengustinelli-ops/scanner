#!/usr/bin/env python3
"""
InboxHunter Automation Engine
Main entry point for the AI-powered automation bot.

Usage:
    python main.py --config config.json
    python main.py --credentials '{"email": "test@example.com", ...}'
"""

import asyncio
import json
import os
import signal
import ssl
import sys
import argparse
from pathlib import Path
from typing import Optional, Dict, Any

from loguru import logger

# Global reference to bot for signal handling
_bot_instance = None
_shutdown_event = None

# Add bundle directory to path for imports (handles both normal and PyInstaller runs)
if getattr(sys, 'frozen', False):
    # Running as PyInstaller bundle - use _MEIPASS where files are extracted
    bundle_dir = sys._MEIPASS
else:
    # Running as normal Python script
    bundle_dir = str(Path(__file__).parent)
sys.path.insert(0, bundle_dir)


def setup_ssl_certificates():
    """
    Set up SSL certificates for bundled PyInstaller apps.
    This fixes the 'CERTIFICATE_VERIFY_FAILED' error on macOS.
    """
    try:
        import certifi
        
        # Set environment variables for SSL
        os.environ['SSL_CERT_FILE'] = certifi.where()
        os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
        
        # Also set for httpx/aiohttp
        os.environ['CURL_CA_BUNDLE'] = certifi.where()
        
    except ImportError:
        # certifi not available, try system certificates
        pass
    except Exception as e:
        print(f"Warning: Could not set up SSL certificates: {e}")


# Set up SSL certificates before any imports that might use HTTPS
setup_ssl_certificates()

from orchestrator import InboxHunterBot
from config import BotConfig
from utils.simple_logger import slog


def setup_logging(debug: bool = False):
    """Configure logging with loguru."""
    from utils.helpers import get_app_data_directory
    log_dir = get_app_data_directory() / "logs"
    
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        # Fallback to temp directory if we can't create the log directory
        import tempfile
        log_dir = Path(tempfile.gettempdir()) / "inboxhunter" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        print(f"Warning: Could not create log directory, using {log_dir}: {e}")
    
    # Remove default handler
    logger.remove()
    
    # Console handler - use stdout so Tauri can capture it
    log_level = "DEBUG" if debug else "INFO"
    
    # On Windows, reconfigure stdout to use UTF-8 encoding to support emojis
    if sys.platform == 'win32':
        try:
            # Try to reconfigure stdout for UTF-8
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        except (AttributeError, OSError):
            # Fallback for older Python or if reconfigure fails
            pass
    
    # Create a custom sink that flushes immediately and handles encoding errors
    def stdout_sink(message):
        try:
            sys.stdout.write(message)
            sys.stdout.flush()
        except UnicodeEncodeError:
            # Fallback: encode with replacement for unsupported characters
            safe_message = message.encode(sys.stdout.encoding or 'utf-8', errors='replace').decode(sys.stdout.encoding or 'utf-8', errors='replace')
            sys.stdout.write(safe_message)
            sys.stdout.flush()
    
    logger.add(
        stdout_sink,
        format="{time:HH:mm:ss} | {level: <8} | {message}",
        level=log_level,
        colorize=False  # Disable colors for cleaner output to Tauri
    )
    
    # File handler
    logger.add(
        log_dir / "bot_{time:YYYY-MM-DD}.log",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
        level="DEBUG",
        rotation="1 day",
        retention="7 days",
        compression="gz"
    )
    
    # Startup message - always show (version from Tauri env var or fallback)
    version = os.environ.get("INBOXHUNTER_VERSION", "dev")
    logger.info(f"🚀 InboxHunter v{version}")


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="InboxHunter Automation Engine - AI-powered lead generation"
    )
    parser.add_argument(
        "--config",
        type=str,
        help="Path to JSON config file"
    )
    parser.add_argument(
        "--credentials",
        type=str,
        help="JSON string with credentials"
    )
    parser.add_argument(
        "--source",
        type=str,
        choices=["csv", "meta"],
        default="meta",
        help="Data source (csv or meta)"
    )
    parser.add_argument(
        "--max-signups",
        type=int,
        default=50,
        help="Maximum number of signups"
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging"
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run browser in headless mode"
    )
    
    return parser.parse_args()


def load_config(args) -> Optional[BotConfig]:
    """Load configuration from file or arguments."""
    config_data = {}
    from_file = False
    
    # Load from config file
    if args.config:
        config_path = Path(args.config)
        if config_path.exists():
            with open(config_path) as f:
                config_data = json.load(f)
            slog.detail(f"Loaded config from: {config_path}")
            from_file = True
        else:
            logger.error(f"Config file not found: {config_path}")
            return None
    
    # Override with command line credentials
    if args.credentials:
        try:
            creds = json.loads(args.credentials)
            config_data["credentials"] = creds
        except json.JSONDecodeError as e:
            logger.error(f"Invalid credentials JSON: {e}")
            return None
    
    # Only set from args if NOT loading from a complete config file
    # Config file from Tauri already has all settings
    if not from_file:
        config_data.setdefault("settings", {})
        config_data["settings"]["data_source"] = args.source
        config_data["settings"]["max_signups"] = args.max_signups
        config_data["settings"]["headless"] = args.headless
        config_data["settings"]["debug"] = args.debug
    else:
        # Allow command line flags to override config file
        if args.debug:
            config_data.setdefault("settings", {})
            config_data["settings"]["debug"] = True
        if args.headless:
            config_data.setdefault("settings", {})
            config_data["settings"]["headless"] = True
    
    try:
        return BotConfig(**config_data)
    except Exception as e:
        logger.error(f"Invalid configuration: {e}")
        return None


def handle_shutdown_signal(signum, frame):
    """Handle shutdown signals gracefully."""
    global _bot_instance, _shutdown_event
    
    sig_name = signal.Signals(signum).name if hasattr(signal, 'Signals') else str(signum)
    slog.detail_warning(f"⏹ Received {sig_name}, initiating graceful shutdown...")
    
    # Set the shutdown event if it exists
    if _shutdown_event:
        _shutdown_event.set()
    
    # Tell the bot to stop
    if _bot_instance:
        _bot_instance.stop()


async def main():
    """Main entry point."""
    global _bot_instance, _shutdown_event
    
    args = parse_args()
    setup_logging(debug=args.debug)
    
    # Set up shutdown event
    _shutdown_event = asyncio.Event()
    
    # Set up signal handlers for graceful shutdown
    # Note: On Windows, only SIGTERM and SIGINT are available
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            signal.signal(sig, handle_shutdown_signal)
        except (ValueError, OSError):
            # Signal not available on this platform
            pass
    
    slog.detail("⏳ Loading configuration...")
    
    # Load configuration
    config = load_config(args)
    if not config:
        logger.error("Failed to load configuration. Exiting.")
        sys.exit(1)
    
    # Configure simple logger based on settings
    # Check both 'detailed_logs' and legacy 'debug' for backwards compatibility
    detailed_logs = getattr(config.settings, 'detailed_logs', False)
    legacy_debug = getattr(config.settings, 'debug', False)
    use_detailed = detailed_logs or legacy_debug
    slog.set_detailed(use_detailed)
    
    if use_detailed:
        logger.info("📝 Detailed logging enabled")
    
    slog.detail("✅ Configuration loaded")
    
    # Validate required fields
    slog.detail("⏳ Validating credentials...")
    
    if not config.credentials.email:
        logger.error("Email is required in credentials")
        sys.exit(1)
    
    if not config.api_keys.openai:
        logger.error("OpenAI API key is required")
        sys.exit(1)
    
    slog.detail("✅ Credentials validated")
    
    slog.detail(f"📧 Email: {config.credentials.email}")
    slog.detail(f"📂 Data source: {config.settings.data_source}")
    slog.detail(f"🎯 Max signups: {config.settings.max_signups}")
    slog.detail(f"👁️ Headless mode: {config.settings.headless}")
    
    slog.detail("⏳ Initializing bot...")
    
    # Create and run bot
    bot = InboxHunterBot(config)
    _bot_instance = bot  # Store reference for signal handler
    
    slog.detail("✅ Bot initialized, starting automation...")
    
    try:
        await bot.run()
    except KeyboardInterrupt:
        slog.detail_warning("⏹ Bot stopped by user (Ctrl+C)")
    except asyncio.CancelledError:
        slog.detail_warning("⏹ Bot task was cancelled")
    except Exception as e:
        logger.error(f"Bot error: {e}")
        sys.exit(1)
    finally:
        slog.detail("🧹 Cleaning up resources...")
        try:
            await bot.cleanup()
        except Exception as e:
            # Suppress errors during cleanup (like EPIPE)
            slog.detail_debug(f"Cleanup warning (ignored): {e}")
        slog.detail("✅ Cleanup complete")
    
    logger.success("✅ Done!")


if __name__ == "__main__":
    asyncio.run(main())
