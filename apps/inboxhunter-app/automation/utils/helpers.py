"""
Helper utilities for InboxHunter.
"""

import os
import random
import platform
from pathlib import Path
from typing import Tuple


def get_app_data_directory() -> Path:
    """
    Get a writable directory for app data based on platform.
    This is used for databases, screenshots, and other persistent data.
    
    IMPORTANT: Must match Tauri's app_data_dir which uses the bundle identifier.
    Tauri uses these paths:
    - macOS: ~/Library/Application Support/com.inboxhunter.app
    - Windows: %APPDATA%/com.inboxhunter.app (APPDATA = Roaming, NOT Local)
    - Linux: ~/.local/share/com.inboxhunter.app
    """
    system = platform.system()
    
    # Use the same bundle identifier as Tauri (from tauri.conf.json)
    app_id = "com.inboxhunter.app"
    
    if system == "Darwin":  # macOS
        data_dir = Path.home() / "Library" / "Application Support" / app_id
    elif system == "Windows":
        # IMPORTANT: Tauri uses APPDATA (Roaming), not LOCALAPPDATA (Local)
        # APPDATA = C:\Users\<user>\AppData\Roaming
        # LOCALAPPDATA = C:\Users\<user>\AppData\Local
        app_data = os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")
        data_dir = Path(app_data) / app_id
    else:  # Linux and others
        xdg_data = os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")
        data_dir = Path(xdg_data) / app_id
    
    # Ensure directory exists
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def random_delay(min_seconds: float, max_seconds: float) -> float:
    """
    Generate a random delay between min and max seconds.
    
    Args:
        min_seconds: Minimum delay
        max_seconds: Maximum delay
        
    Returns:
        Random delay value
    """
    return random.uniform(min_seconds, max_seconds)


def get_adjacent_key(char: str) -> str:
    """Get an adjacent key for typo simulation."""
    keyboard = {
        'q': 'wa', 'w': 'qeas', 'e': 'wrsd', 'r': 'etdf', 't': 'ryfg',
        'y': 'tugh', 'u': 'yijh', 'i': 'uokj', 'o': 'iplk', 'p': 'ol',
        'a': 'qwsz', 's': 'awedxz', 'd': 'serfcx', 'f': 'drtgvc',
        'g': 'ftyhbv', 'h': 'gyujnb', 'j': 'huikmn', 'k': 'jiolm',
        'l': 'kop', 'z': 'asx', 'x': 'zsdc', 'c': 'xdfv', 'v': 'cfgb',
        'b': 'vghn', 'n': 'bhjm', 'm': 'njk'
    }
    
    adjacent = keyboard.get(char.lower(), char)
    if adjacent and len(adjacent) > 0:
        return random.choice(adjacent)
    return char

