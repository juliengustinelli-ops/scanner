"""
Simple Logger for InboxHunter.
Provides clean, user-friendly logs by default with optional detailed mode.
"""

from loguru import logger


class SimpleLogger:
    """
    Conditional logger that shows simple one-liner logs by default,
    or detailed logs when detailed_logs=True.
    
    Simple mode: Only major events (URL processing, success/fail, skip reasons)
    Detailed mode: Full technical details (all current logs)
    """
    
    def __init__(self, detailed: bool = False):
        self.detailed = detailed
        self._current_url = ""
        self._current_step = 0
    
    def set_detailed(self, detailed: bool):
        """Update detailed logging mode."""
        self.detailed = detailed
    
    def set_url(self, url: str):
        """Set current URL being processed."""
        self._current_url = url
    
    def set_step(self, step: int):
        """Set current step number."""
        self._current_step = step
    
    # === ALWAYS SHOWN (both simple and detailed) ===
    
    def url_start(self, index: int, total: int, url: str):
        """Log start of URL processing - always shown."""
        self._current_url = url
        # Truncate URL for display
        display_url = url[:60] + "..." if len(url) > 60 else url
        logger.info(f"📍 [{index}/{total}] {display_url}")
    
    def url_success(self, signup_type: str = ""):
        """Log successful signup - always shown."""
        type_info = f" ({signup_type})" if signup_type else ""
        logger.success(f"✅ Signup successful{type_info}")
    
    def url_failed(self, reason: str):
        """Log failed signup - always shown."""
        logger.error(f"❌ Failed: {reason[:80]}")
    
    def url_skipped(self, reason: str):
        """Log skipped URL - always shown."""
        logger.warning(f"⏭️ Skipped: {reason[:60]}")
    
    def step_simple(self, step: int, action: str, target: str = ""):
        """Log step in simple mode - concise one-liner."""
        self._current_step = step
        target_info = f" → {target[:30]}" if target else ""
        logger.info(f"   Step {step}: {action}{target_info}")
    
    def summary(self, successful: int, failed: int, skipped: int, time_sec: float):
        """Log final summary - always shown."""
        logger.info(f"📊 Done: {successful} success, {failed} failed, {skipped} skipped ({time_sec:.0f}s)")
    
    # === DETAILED MODE ===
    # These always log to file (DEBUG level captures all).
    # Console display depends on the --debug flag.

    def detail(self, message: str):
        """Log detailed message - always to file, console if debug mode."""
        logger.debug(message)

    def detail_success(self, message: str):
        """Log detailed success - always to file, console if debug mode."""
        logger.debug(f"✓ {message}")

    def detail_warning(self, message: str):
        """Log detailed warning - always to file, console if debug mode."""
        logger.debug(f"⚠ {message}")

    def detail_debug(self, message: str):
        """Log debug info - always to file, console if debug mode."""
        logger.debug(message)


# Global simple logger instance - will be configured by bot
slog = SimpleLogger(detailed=False)

