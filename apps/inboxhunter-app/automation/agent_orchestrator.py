"""
AI Agent Orchestrator with continuous reasoning loop.
Based on working implementation from Reverse-Outreach-AutomationBot.
"""

import asyncio
import json
import re
import base64
import random
import aiohttp
from typing import Dict, List, Any, Optional
from datetime import datetime

from playwright.async_api import Page
from loguru import logger

from llm_analyzer import LLMPageAnalyzer
from utils.simple_logger import slog


class AgentAction:
    """Represents an action to be taken by the agent."""
    
    def __init__(self, action_type: str, selector: Optional[str] = None, 
                 value: Optional[str] = None, reasoning: str = "", field_type: str = None):
        self.action_type = action_type
        self.selector = selector
        self.value = value
        self.reasoning = reasoning
        self.field_type = field_type  # Track what type of field this is (email, name, phone, etc.)
        self.timestamp = datetime.utcnow()
        self.success = None
        self.error_message = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "action_type": self.action_type,
            "selector": self.selector,
            "value": self.value,
            "reasoning": self.reasoning,
            "field_type": self.field_type,
            "success": self.success,
            "error_message": self.error_message
        }


class AgentState:
    """Tracks the state of the agent during execution."""
    
    def __init__(self):
        self.actions_taken: List[AgentAction] = []
        self.fields_filled: Dict[str, str] = {}  # selector -> value
        self.field_types_filled: Dict[str, str] = {}  # field_type -> selector (e.g., "email" -> "#email")
        self.current_step = 1
        self.max_steps = 30
        self.complete = False
        self.success = False
        self.conversation_history: List[Dict[str, str]] = []
        self.checkboxes_checked: List[str] = []  # Track checked checkboxes
        self.country_code_attempts: int = 0  # Track country code change attempts
        self.phone_fallback_used: bool = False  # Track if fallback was used
        self.detected_country_code: str = "1"  # Detected country code from page
        self.fields_with_errors: Dict[str, int] = {}  # Track validation errors per field
        self.submit_attempts: int = 0  # Track submit button clicks
        self.click_attempts_after_fill: int = 0  # Track any click after filling fields (potential submit)
        self.hallucination_count: int = 0  # Track LLM trying non-existent elements
        self.form_submitted: bool = False  # Track if form was actually submitted
        self.captcha_attempted: bool = False  # Track if we've tried to solve captcha
        self.captcha_solved: bool = False  # Track if captcha was successfully solved
        self.url_before_submit: str = ""  # URL before submission
        self.form_count_before_submit: int = 0  # Number of forms before submission
        # NEW: Track which form we're working with
        self.active_form_id: str = ""  # ID of the form we're filling
        self.active_form_selector: str = ""  # Selector for the active form
        self.active_form_submit_selector: str = ""  # Submit button for the active form
        # NEW: Track repeated errors to detect stuck loops
        self.error_messages_seen: Dict[str, int] = {}  # Track how many times each error appears
        self.recent_actions: List[str] = []  # Track recent action patterns
        self.stuck_loop_detected: bool = False  # Flag when stuck in a loop
    
    def add_action(self, action: AgentAction, field_type: str = None):
        self.actions_taken.append(action)
        if action.action_type == "fill_field" and action.success:
            self.fields_filled[action.selector] = action.value
            # Track field type if provided
            if field_type:
                self.field_types_filled[field_type] = action.selector
    
    def is_field_type_filled(self, field_type: str) -> bool:
        """Check if a field type (email, name, phone, etc.) has already been filled."""
        return field_type in self.field_types_filled
    
    def get_filled_field_types(self) -> List[str]:
        """Get list of field types that have been filled."""
        return list(self.field_types_filled.keys())
    
    def to_summary(self) -> Dict[str, Any]:
        return {
            "total_actions": len(self.actions_taken),
            "fields_filled": self.fields_filled,
            "steps_taken": self.current_step,
            "complete": self.complete,
            "success": self.success,
            "actions": [action.to_dict() for action in self.actions_taken]
        }


class AIAgentOrchestrator:
    """
    AI-powered agent that uses continuous reasoning loop to fill forms.
    Based on MVP implementation with checkbox and phone handling.
    """
    
    def __init__(self, page: Page, credentials: Dict[str, str], 
                 llm_provider: str = "openai", llm_config: Dict[str, Any] = None,
                 stop_check: callable = None, page_analysis: Dict[str, Any] = None,
                 captcha_api_key: str = None):
        self.page = page
        self.credentials = credentials
        self.llm_provider = llm_provider
        self.llm_config = llm_config or {}
        self.state = AgentState()
        self._stop_check = stop_check or (lambda: False)
        
        # Store local page analysis - this is the ground truth from thorough analysis
        self.page_analysis = page_analysis or {}
        
        # Captcha solving configuration
        self.captcha_api_key = captcha_api_key or ""
        self.captcha_solve_attempts = 0
        self.max_captcha_attempts = 2  # Max 2captcha attempts before giving up
        
        self.last_action_type = None
        self.consecutive_rate_limits = 0
        
        # Initialize LLM analyzer
        self.llm_analyzer = LLMPageAnalyzer(
            page=page,
            credentials=credentials,
            llm_provider=llm_provider,
            llm_config=llm_config
        )
        
        slog.detail("🤖 AI Agent initialized")
    
    def _humanize_error(self, error: str, action: AgentAction) -> str:
        """Convert technical errors into clear, user-friendly messages that specify which field failed."""
        if not error:
            return "Unknown error"
        
        error_lower = error.lower()
        
        # Determine the field name for user-friendly display
        field_name = self._get_friendly_field_name(action)
        
        # Element not found / timeout errors
        if "timeout" in error_lower or "not found" in error_lower or "waiting for selector" in error_lower:
            if action.action_type == "fill_field":
                return f"Failed to fill {field_name}: Field not found on page"
            elif action.action_type == "click":
                btn_name = self._get_button_name(action)
                return f"Failed to click {btn_name}: Button not found on page"
            return f"Element not found: {action.selector[:50] if action.selector else 'unknown'}"
        
        # Hidden element errors
        if "hidden" in error_lower or "not visible" in error_lower:
            if action.action_type == "fill_field":
                return f"Failed to fill {field_name}: Field is hidden or covered by another element"
            elif action.action_type == "click":
                btn_name = self._get_button_name(action)
                return f"Failed to click {btn_name}: Button is hidden or covered"
            return f"Element is hidden: {action.selector[:50] if action.selector else 'unknown'}"
        
        # Invalid selector errors
        if "not a valid selector" in error_lower or "invalid selector" in error_lower:
            if action.action_type == "fill_field":
                return f"Failed to fill {field_name}: Could not locate field (invalid selector)"
            return f"Invalid selector for {field_name}"
        
        # Value verification failed (field didn't accept our input)
        if "verification failed" in error_lower or "value mismatch" in error_lower:
            return f"Failed to fill {field_name}: Field rejected the input value"
        
        # Form validation errors
        if "invalid" in error_lower or "required" in error_lower or "please enter" in error_lower:
            return f"Form rejected {field_name}: {error[:60]}"
        
        # Network/connection errors
        if "network" in error_lower or "connection" in error_lower or "fetch" in error_lower:
            return f"Network error while filling {field_name}"
        
        # Rate limiting
        if "rate" in error_lower and "limit" in error_lower:
            return "LLM API rate limit - retrying automatically"
        
        # CAPTCHA errors
        if "captcha" in error_lower or "recaptcha" in error_lower:
            return "CAPTCHA is blocking form submission"
        
        # Click interception
        if "intercept" in error_lower or "another element" in error_lower:
            if action.action_type == "click":
                btn_name = self._get_button_name(action)
                return f"Failed to click {btn_name}: Blocked by popup or overlay"
            return f"Click blocked by overlay while interacting with {field_name}"
        
        # Default: include field name for context
        clean_error = error.replace("\n", " ").strip()
        if action.action_type == "fill_field":
            return f"Failed to fill {field_name}: {clean_error[:80]}"
        elif action.action_type == "click":
            btn_name = self._get_button_name(action)
            return f"Failed to click {btn_name}: {clean_error[:80]}"
        return clean_error[:100] if len(clean_error) > 100 else clean_error
    
    def _get_friendly_field_name(self, action: AgentAction) -> str:
        """Get a user-friendly name for the field being acted upon."""
        # First check if we have an explicit field_type
        if action.field_type:
            field_type_map = {
                "email": "Email",
                "first_name": "First Name",
                "firstname": "First Name",
                "last_name": "Last Name",
                "lastname": "Last Name",
                "full_name": "Full Name",
                "fullname": "Full Name",
                "name": "Name",
                "phone": "Phone Number",
                "telephone": "Phone Number",
                "mobile": "Phone Number",
                "checkbox": "Checkbox",
                "terms": "Terms Checkbox",
                "country": "Country",
                "country_code": "Country Code",
            }
            return field_type_map.get(action.field_type.lower(), action.field_type.title())
        
        # Try to infer from selector
        if action.selector:
            selector_lower = action.selector.lower()
            
            # Check for common field patterns in selector
            field_patterns = [
                (["email", "e-mail"], "Email"),
                (["first_name", "firstname", "first-name", "fname"], "First Name"),
                (["last_name", "lastname", "last-name", "lname"], "Last Name"),
                (["full_name", "fullname", "full-name"], "Full Name"),
                (["name"], "Name"),  # Generic name - check after first/last
                (["phone", "mobile", "tel", "telephone"], "Phone Number"),
                (["country"], "Country"),
                (["checkbox", "terms", "agree", "consent", "privacy"], "Checkbox"),
                (["password"], "Password"),
                (["company", "organization", "org"], "Company"),
                (["address", "street"], "Address"),
                (["city"], "City"),
                (["state", "province"], "State"),
                (["zip", "postal"], "Zip Code"),
            ]
            
            for patterns, friendly_name in field_patterns:
                if any(p in selector_lower for p in patterns):
                    return friendly_name
        
        # Try to infer from the value being filled
        if action.value:
            value_str = str(action.value).lower()
            if "@" in value_str and "." in value_str:
                return "Email"
        
        # Fallback
        return "form field"
    
    def _get_button_name(self, action: AgentAction) -> str:
        """Get a user-friendly name for a button being clicked."""
        if action.selector:
            selector_lower = action.selector.lower()
            
            # Check for common button patterns
            button_patterns = [
                (["submit"], "Submit button"),
                (["sign-up", "signup", "sign_up"], "Sign Up button"),
                (["subscribe"], "Subscribe button"),
                (["register"], "Register button"),
                (["continue"], "Continue button"),
                (["next"], "Next button"),
                (["send"], "Send button"),
                (["join"], "Join button"),
                (["get-started", "get_started", "getstarted"], "Get Started button"),
                (["country", "flag", "dial"], "Country selector"),
            ]
            
            for patterns, friendly_name in button_patterns:
                if any(p in selector_lower for p in patterns):
                    return friendly_name
        
        # Check reasoning for hints
        if action.reasoning:
            reasoning_lower = action.reasoning.lower()
            if "submit" in reasoning_lower:
                return "Submit button"
            if "country" in reasoning_lower or "code" in reasoning_lower:
                return "Country selector"
        
        return "button"
    
    def _build_failure_summary(self) -> Dict[str, Any]:
        """Build a detailed, user-friendly failure summary with categorized errors."""
        
        # Check for LLM failure first
        llm_failure = getattr(self.state, 'llm_failure_reason', None)
        
        # Track which specific fields failed
        failed_fields = []  # List of (field_name, error_reason) tuples
        
        # Categorize all errors from actions
        error_categories = {
            "validation": [],       # Form rejected our input
            "not_found": [],        # Couldn't find expected elements
            "hidden": [],           # Hidden elements, wrong page type
            "network": [],          # Timeouts, connection problems
            "captcha": [],          # CAPTCHA blocking
            "selector": [],         # Invalid selectors (LLM hallucination)
            "llm": [],              # LLM/API errors
            "other": []
        }
        
        for action in self.state.actions_taken:
            if not action.success and action.error_message:
                err = action.error_message.lower()
                
                # Track specific field failures for clear user messaging
                if action.action_type == "fill_field":
                    field_name = self._get_friendly_field_name(action)
                    failed_fields.append((field_name, action.error_message))
                
                # Categorize the error
                if any(kw in err for kw in ["validation", "invalid", "required", "please enter", "must be", "rejected"]):
                    error_categories["validation"].append(action.error_message)
                elif any(kw in err for kw in ["not found", "field not found", "button not found"]):
                    error_categories["not_found"].append(action.error_message)
                elif any(kw in err for kw in ["hidden", "not visible", "covered", "blocked by"]):
                    error_categories["hidden"].append(action.error_message)
                elif any(kw in err for kw in ["captcha", "recaptcha", "hcaptcha"]):
                    error_categories["captcha"].append(action.error_message)
                elif any(kw in err for kw in ["invalid selector", "could not locate"]):
                    error_categories["selector"].append(action.error_message)
                elif any(kw in err for kw in ["network", "connection", "fetch"]):
                    error_categories["network"].append(action.error_message)
                else:
                    error_categories["other"].append(action.error_message)
        
        # Determine primary error - prioritize specific field failures
        primary_category = "unknown"
        primary_error = "Form submission failed"
        
        # Priority order for determining primary cause
        # Check LLM failure first - this is a critical error
        if llm_failure:
            primary_category = "llm_error"
            # Make LLM errors more user-friendly
            if "rate_limit" in llm_failure.lower():
                primary_error = "OpenAI rate limit reached - please wait a moment and try again"
            elif "api key" in llm_failure.lower():
                primary_error = "OpenAI API key error - please check your API key in Settings"
            elif "timeout" in llm_failure.lower():
                primary_error = "OpenAI request timed out - the AI service may be slow"
            elif "network" in llm_failure.lower():
                primary_error = "Network error connecting to OpenAI"
            else:
                primary_error = f"AI analysis failed: {llm_failure[:100]}"
            error_categories["llm"].append(primary_error)
        elif self.state.stuck_loop_detected and self.state.error_messages_seen:
            most_common = max(self.state.error_messages_seen.items(), key=lambda x: x[1])
            primary_category = "validation_loop"
            primary_error = f"Form keeps rejecting input: '{most_common[0][:60]}'"
        elif error_categories["captcha"]:
            primary_category = "captcha"
            primary_error = "CAPTCHA is blocking form submission"
        elif failed_fields:
            # Use the first field failure as the primary error - most user-friendly
            first_failed_field, first_error = failed_fields[0]
            if len(failed_fields) == 1:
                primary_error = first_error
            else:
                # Multiple fields failed
                field_names = [f[0] for f in failed_fields[:3]]
                primary_error = f"{first_error} (also failed: {', '.join(field_names[1:])})"
            
            # Set category based on error type
            if any(kw in first_error.lower() for kw in ["not found", "field not found"]):
                primary_category = "not_found"
            elif any(kw in first_error.lower() for kw in ["hidden", "covered"]):
                primary_category = "hidden"
            elif any(kw in first_error.lower() for kw in ["rejected", "validation", "invalid"]):
                primary_category = "validation"
            else:
                primary_category = "field_error"
        elif self.state.submit_attempts == 0 and len(self.state.fields_filled) > 0:
            primary_category = "no_submit"
            filled_types = self.state.get_filled_field_types()
            if filled_types:
                primary_error = f"Filled {', '.join(filled_types)} but could not find Submit button"
            else:
                primary_error = f"Filled {len(self.state.fields_filled)} field(s) but could not find Submit button"
        elif error_categories["not_found"]:
            primary_category = "not_found"
            primary_error = error_categories["not_found"][0]
        elif error_categories["hidden"]:
            primary_category = "hidden"
            primary_error = error_categories["hidden"][0]
        elif error_categories["validation"]:
            primary_category = "validation"
            primary_error = error_categories["validation"][0]
        elif error_categories["selector"]:
            primary_category = "selector"
            primary_error = "Could not locate form fields on this page"
        elif error_categories["network"]:
            primary_category = "network"
            primary_error = "Network error while interacting with form"
        elif self.state.form_submitted and not self.state.success:
            primary_category = "no_confirmation"
            primary_error = "Form was submitted but no success message was detected"
        elif len(self.state.fields_filled) == 0:
            primary_category = "no_fields"
            # Try to identify which field we couldn't fill
            if failed_fields:
                first_failed = failed_fields[0][0]
                primary_error = f"Could not fill any fields - first failure was {first_failed}"
            else:
                primary_error = "Could not find or fill any form fields"
        
        # Build list of all errors (deduplicated)
        all_errors = []
        seen_errors = set()
        for category_errors in error_categories.values():
            for err in category_errors:
                err_key = err[:50].lower()  # Dedupe by first 50 chars
                if err_key not in seen_errors:
                    seen_errors.add(err_key)
                    all_errors.append(err)
        
        return {
            "primary_error": primary_error,
            "primary_category": primary_category,
            "failed_fields": failed_fields,  # List of (field_name, error) tuples
            "error_categories": {k: v for k, v in error_categories.items() if v},
            "all_errors": all_errors[:10],  # Limit to 10 errors
            "fields_filled": list(self.state.fields_filled.keys()),
            "field_types_filled": self.state.get_filled_field_types(),
            "submit_attempts": self.state.submit_attempts,
            "form_submitted": self.state.form_submitted,
            "stuck_loop": self.state.stuck_loop_detected,
            "captcha_attempted": self.state.captcha_attempted,
            "captcha_solved": self.state.captcha_solved
        }
    
    async def execute_signup(self) -> Dict[str, Any]:
        """Execute the sign-up process using continuous reasoning loop."""
        slog.detail("🚀 Starting AI Agent reasoning loop...")
        
        try:
            if self._stop_check():
                return {"success": False, "fields_filled": [], "actions": [], "errors": ["Stop requested"], "interrupted_by_stop": True}
            
            await asyncio.sleep(2)
            

            
            # Runtime Cart/Product Page Detection (Initial Check)
            unwanted_check = await self._check_unwanted_page_state()
            if unwanted_check["is_unwanted"]:
                reason = unwanted_check["reason"]
                slog.detail_warning(f"⚠️ UNWANTED PAGE DETECTED: {reason}")
                slog.detail("⏭️ Skipping - we do not process cart, checkout, or product pages")
                return {
                    "success": False,
                    "fields_filled": [],
                    "actions": [],
                    "errors": [f"Unwanted page detected ({reason}) - skipping"],
                    "skipped_reason": "unwanted_page"
                }
            
            # RUNTIME PAYMENT DETECTION
            # Check if the form actually requires credit card input
            # This is the Phase 2 validation that prevents false positives
            if self.page_analysis.get("has_credit_card_fields", False):
                # Verify with a fresh check - the form might have CC fields visible
                payment_check = await self._check_form_requires_payment()
                if payment_check.get("requires_payment", False):
                    reason = payment_check.get("reason", "Credit card fields detected in form")
                    slog.detail_warning(f"💳 PAYMENT REQUIRED: {reason}")
                    slog.detail("⏭️ Skipping - form requires payment, we only process free signups")
                    
                    return {
                        "success": False,
                        "fields_filled": [],
                        "actions": [],
                        "errors": [f"Payment required ({reason}) - skipping"],
                        "skipped_reason": "payment_required"
                    }
            
            last_action_success = True
            
            while not self.state.complete and self.state.current_step <= self.state.max_steps:
                if self._stop_check():
                    slog.detail("⏹ Stop requested - leaving URL in pending state")
                    return {
                        "success": False,
                        "fields_filled": list(self.state.fields_filled.keys()),
                        "actions": [a.to_dict() for a in self.state.actions_taken],
                        "errors": ["Stop requested"],
                        "interrupted_by_stop": True
                    }
                
                rate_limit_status = f" | Rate Limits: {self.consecutive_rate_limits}/3" if self.consecutive_rate_limits > 0 else ""
                
                # Detailed logging: show full step header
                slog.detail(f"\n{'='*50}")
                slog.detail(f"🔄 Step {self.state.current_step}/{self.state.max_steps}{rate_limit_status}")
                slog.detail(f"{'='*50}")
                
                # Check if we've navigated to an unwanted page (Cart, Checkout, Login/Registration, etc.)
                unwanted_check = await self._check_unwanted_page_state()
                if unwanted_check["is_unwanted"]:
                    reason = unwanted_check["reason"]
                    slog.detail_warning(f"⚠️ UNWANTED PAGE STATE: {reason}")
                    
                    # Provide specific message based on reason type
                    if "password" in reason.lower() or "registration" in reason.lower() or "login" in reason.lower():
                        slog.detail("🛑 Aborting: This page requires account registration (not a simple newsletter)")
                    elif "cart" in reason.lower() or "checkout" in reason.lower() or "product" in reason.lower():
                        slog.detail("🛑 Aborting execution on this page (moved to cart/checkout)")
                    elif "app store" in reason.lower():
                        slog.detail("🛑 Aborting: Redirected to app store")
                    else:
                        slog.detail("🛑 Aborting execution on this page")
                    
                    return {
                        "success": False,
                        "fields_filled": list(self.state.fields_filled.keys()),
                        "actions": [a.to_dict() for a in self.state.actions_taken],
                        "errors": [f"Navigated to unwanted page: {reason}"],
                        "skipped_mid_execution": True,
                        "skipped_reason": "unwanted_page"
                    }
                
                # Observe page
                use_vision = self._should_use_vision(self.state.current_step, last_action_success)
                page_state = await self._observe_page(use_vision=use_vision)
                
                # Check if no form found after many steps
                if self.state.current_step >= 15 and len(self.state.fields_filled) == 0:
                    has_form_inputs = any(inp.get("type") in ["email", "text", "tel"] 
                                         for inp in page_state.get("inputs", []))
                    nav_buttons = [btn for btn in page_state.get("buttons", [])
                                  if any(kw in btn.get("text", "").lower() 
                                        for kw in ["sign up", "register", "join", "get started"])]
                    if not has_form_inputs and not nav_buttons:
                        logger.warning("⚠️ No form found after 15 steps")
                        self.state.complete = True
                        self.state.success = False
                        break
                
                # Check for blocking overlay after form submission (could indicate success, CAPTCHA, or error)
                if self.state.form_submitted and self.state.submit_attempts > 0:
                    overlay_result = await self._check_and_handle_overlay()
                    if overlay_result.get("is_success"):
                        slog.detail_success(f"🎉 Success detected via overlay: {overlay_result.get('reason', 'Popup appeared')}")
                        self.state.complete = True
                        self.state.success = True
                        break
                    elif overlay_result.get("needs_action"):
                        action_type = overlay_result.get("type", "verification_required")
                        reason = overlay_result.get("reason", "Verification required")
                        
                        # If CAPTCHA detected, try to solve it
                        if action_type == "captcha" and not self.state.captcha_attempted:
                            slog.detail("   🤖 CAPTCHA detected - attempting to solve...")
                            self.state.captcha_attempted = True
                            captcha_result = await self._handle_captcha()
                            
                            if captcha_result.get("solved"):
                                slog.detail_success("   ✅ CAPTCHA solved! Retrying form submission...")
                                # Re-observe and continue the loop to retry submission
                                page_state = await self._observe_page(use_vision=True)
                                continue
                            else:
                                slog.detail_warning("   ⚠️ Could not solve CAPTCHA - skipping page")
                        else:
                            slog.detail_warning(f"⚠️ {reason} - cannot proceed automatically")
                        
                        return {
                            "success": False,
                            "fields_filled": list(self.state.fields_filled.keys()),
                            "actions": [a.to_dict() for a in self.state.actions_taken],
                            "errors": [reason],
                            "skipped_mid_execution": True,
                            "skipped_reason": action_type
                        }
                    elif overlay_result.get("has_error"):
                        slog.detail_warning(f"⚠️ Error in overlay: {overlay_result.get('reason')}")
                        # Don't immediately fail - let the bot try to handle it
                    elif overlay_result.get("closed"):
                        slog.detail(f"   🔲 Closed blocking overlay, continuing...")
                        # Re-observe page after closing overlay
                        page_state = await self._observe_page(use_vision=True)
                
                # Proactive CAPTCHA handling - ONLY if captcha is actually visible
                # Don't try to solve hidden/script-only captchas that aren't active yet
                captcha_info = page_state.get("captcha_detected", {})
                if (captcha_info.get("found") and 
                    captcha_info.get("isVisible") and  # MUST be visible, not just in HTML
                    not self.state.captcha_solved and 
                    not self.state.captcha_attempted):
                    captcha_type = captcha_info.get("type", "unknown")
                    slog.detail(f"   🔒 VISIBLE CAPTCHA detected ({captcha_type}) - attempting to solve...")
                    
                    captcha_result = await self._handle_captcha()
                    if captcha_result.get("solved"):
                        slog.detail_success("   ✅ CAPTCHA solved!")
                        # Re-observe page after solving
                        page_state = await self._observe_page(use_vision=True)
                    elif captcha_result.get("skipped"):
                        # Captcha couldn't be solved - mark it so we don't keep trying
                        slog.detail_warning("   ⚠️ CAPTCHA could not be solved - bot will attempt to proceed anyway")
                        # Don't immediately fail - let the LLM try, it might work for some forms
                
                # Get next action from LLM with rate limit handling
                next_action = await self._reason_next_action(page_state)
                
                if not next_action:
                    llm_error = getattr(self, 'last_llm_error', 'Unknown reason')
                    logger.error(f"❌ LLM failed to provide action: {llm_error}")
                    slog.simple(f"❌ LLM error: {llm_error}")
                    # Store error for result reporting
                    self.state.llm_failure_reason = llm_error
                    break
                
                # Execute action
                action_result = await self._execute_action(next_action)
                
                # Check if action revealed success via overlay
                if action_result.get("overlay_success"):
                    slog.detail_success(f"🎉 Success confirmed via overlay: {action_result.get('reason', 'Popup detected')}")
                    self.state.complete = True
                    self.state.success = True
                    break
                
                if action_result["success"]:
                    next_action.success = True
                    slog.detail_success(f"✅ Action succeeded: {next_action.action_type}")
                else:
                    next_action.success = False
                    raw_error = action_result.get("error", "Unknown error")
                    # Store humanized error message for better user feedback
                    next_action.error_message = self._humanize_error(raw_error, next_action)
                    slog.detail_warning(f"⚠️ Action failed: {next_action.error_message}")
                    
                    # Provide hints for common errors (detailed only)
                    if "hidden" in raw_error.lower():
                        slog.detail("   💡 Hint: Element is hidden. For checkboxes, try fill_field with field_type='checkbox'")
                    elif "timeout" in raw_error.lower() or "not found" in raw_error.lower():
                        slog.detail("   💡 Hint: Selector not found. Try different selector")
                
                # Track field type for fill_field actions to prevent refilling
                field_type = getattr(next_action, 'field_type', None)
                self.state.add_action(next_action, field_type=field_type)
                last_action_success = next_action.success
                self.last_action_type = next_action.action_type
                
                # ===== STUCK LOOP DETECTION =====
                # Track error messages from the page to detect repeated validation errors
                error_messages = page_state.get("error_messages", [])
                for err in error_messages:
                    err_text = err.get("text", "").lower().strip()
                    if err_text and len(err_text) > 3:  # Ignore very short messages
                        self.state.error_messages_seen[err_text] = self.state.error_messages_seen.get(err_text, 0) + 1
                
                # Track recent action patterns (action_type + selector + reasoning snippet)
                action_pattern = f"{next_action.action_type}:{next_action.selector or ''}:{(next_action.reasoning or '')[:30]}"
                self.state.recent_actions.append(action_pattern)
                if len(self.state.recent_actions) > 10:
                    self.state.recent_actions.pop(0)  # Keep only last 10
                
                # Check for stuck loop conditions
                stuck_reason = None
                
                # Condition 1: Same error message appearing 3+ times
                for err_text, count in self.state.error_messages_seen.items():
                    if count >= 3:
                        stuck_reason = f"Same error repeated {count}x: '{err_text[:50]}'"
                        break
                
                # Condition 2: Same action pattern repeating (fill same field → submit → fill same field)
                if not stuck_reason and len(self.state.recent_actions) >= 4:
                    # Check if we're in a 2-action loop (fill → submit → fill → submit)
                    recent = self.state.recent_actions[-4:]
                    if recent[0] == recent[2] and recent[1] == recent[3]:
                        stuck_reason = "Action loop detected (same fill → submit pattern repeating)"
                
                # Condition 3: Too many submit attempts without progress
                if not stuck_reason and self.state.submit_attempts >= 4:
                    # Check if URL changed or form disappeared
                    current_url = self.page.url
                    if self.state.url_before_submit and current_url == self.state.url_before_submit:
                        stuck_reason = f"Form stuck after {self.state.submit_attempts} submit attempts (same URL, same errors)"
                
                if stuck_reason:
                    slog.detail_warning(f"🔁 STUCK LOOP DETECTED: {stuck_reason}")
                    
                    # BEFORE giving up, check if we're actually on a success page!
                    # The form might have submitted successfully even with captcha errors
                    current_url = self.page.url.lower()
                    visible_text = await self.page.evaluate("() => document.body.innerText.substring(0, 3000).toLowerCase()")
                    
                    # Check for success indicators in the current page
                    success_indicators = [
                        "thank you", "thanks for", "you're in", "you are in",
                        "successfully registered", "registration complete", "welcome",
                        "check your email", "check your inbox", "confirmation sent",
                        "thanks for registering", "successfully subscribed"
                    ]
                    
                    is_success_page = any(ind in visible_text for ind in success_indicators)
                    
                    # Also check if URL changed to a success/thank-you page
                    success_url_patterns = ["thank", "success", "confirm", "welcome", "registered"]
                    is_success_url = any(pattern in current_url for pattern in success_url_patterns)
                    
                    if is_success_page or is_success_url:
                        slog.detail_success(f"🎉 BUT wait - we're on a success page! Marking as success.")
                        self.state.complete = True
                        self.state.success = True
                        break
                    
                    # Check if the stuck reason is captcha-related
                    is_captcha_stuck = "captcha" in stuck_reason.lower() or "recaptcha" in stuck_reason.lower()
                    
                    if is_captcha_stuck and not self.state.captcha_attempted:
                        slog.detail("   🤖 Captcha issue detected - will try to handle...")
                        # Mark that we've attempted captcha handling (to avoid infinite loops)
                        self.state.captcha_attempted = True
                        # Try to solve captcha using 2captcha or skip
                        captcha_result = await self._handle_captcha()
                        if captcha_result.get("solved"):
                            slog.detail_success("   ✅ Captcha solved! Continuing...")
                            continue  # Continue the loop, don't give up
                        elif captcha_result.get("skipped"):
                            slog.detail_warning("   ⏭️ Captcha could not be solved, skipping...")
                        # If captcha not solved, fall through to give up
                    
                    slog.detail("   ⏭️ Giving up on this page to save LLM tokens")
                    self.state.stuck_loop_detected = True
                    self.state.complete = True
                    self.state.success = False
                    break
                # ===== END STUCK LOOP DETECTION =====
                
                if next_action.action_type == "complete":
                    self.state.complete = True
                    self.state.success = True
                    slog.detail_success("🎉 Agent completed!")
                    break
                
                # Handle failed actions with retry logic
                if not next_action.success:
                    # Count consecutive failures for this specific selector
                    if next_action.selector:
                        failed_count = sum(1 for a in self.state.actions_taken[-5:]  # Only check recent actions
                                          if a.selector == next_action.selector and not a.success)
                        if failed_count >= 3:
                            logger.warning(f"⚠️ Selector {next_action.selector[:40]} failed 3 times, trying alternative approach")
                            # Don't give up - let the LLM try something else
                    
                    # Count total consecutive failures (any action)
                    recent_actions = self.state.actions_taken[-3:] if len(self.state.actions_taken) >= 3 else self.state.actions_taken
                    consecutive_failures = sum(1 for a in recent_actions if not a.success)
                    
                    if consecutive_failures >= 3:
                        # RIGOROUS success check - only accept if we have strong evidence
                        has_success = page_state.get("has_success_indicator", False)
                        success_reason = page_state.get("success_reason", "")
                        
                        # Additional requirements for success after failures:
                        # 1. Form must have been submitted
                        # 2. At least some fields must have been filled
                        # 3. Success detection must have a valid reason
                        if has_success and self.state.form_submitted and len(self.state.fields_filled) >= 1:
                            slog.detail(f"✅ Success detected after failures: {success_reason}")
                            self.state.complete = True
                            self.state.success = True
                            break
                        elif has_success:
                            # Success indicator found but requirements not met
                            if not self.state.form_submitted:
                                slog.detail_warning(f"⚠️ Success indicator found but form was NOT submitted - ignoring")
                            elif len(self.state.fields_filled) < 1:
                                slog.detail_warning(f"⚠️ Success indicator found but no fields were filled - ignoring")
                        
                        # Check total failures - give up after 5 to save tokens (increased from 3)
                        total_failures = sum(1 for a in self.state.actions_taken if not a.success)
                        if total_failures >= 5:
                            slog.detail_warning(f"⚠️ Too many failures ({total_failures}), giving up")
                            slog.detail(f"   📋 Fields filled: {list(self.state.fields_filled.keys())}")
                            slog.detail(f"   📤 Form submitted: {self.state.form_submitted}")
                            self.state.complete = True
                            self.state.success = False
                            break
                        else:
                            slog.detail(f"   🔄 Retrying... ({total_failures}/5 failures)")
                
                await asyncio.sleep(1.5)
                self.state.current_step += 1
            
            # Final summary with detailed logging
            summary = self.state.to_summary()
            slog.detail(f"\n📊 Summary: {summary['total_actions']} actions, {len(summary['fields_filled'])} fields")
            slog.detail(f"   📤 Form submitted: {self.state.form_submitted}")
            slog.detail(f"   🎯 Submit attempts: {self.state.submit_attempts}")
            slog.detail(f"   🖱️ Click attempts after filling: {self.state.click_attempts_after_fill}")
            
            # Final success validation - be smart about what counts as "submitted"
            # If the LLM detected a success page AND we filled fields AND we clicked something,
            # that counts as success even if we didn't technically mark "form_submitted"
            final_success = self.state.success
            
            # Check if we have any evidence of attempting to submit
            has_submit_evidence = (
                self.state.form_submitted or 
                self.state.submit_attempts > 0 or
                self.state.click_attempts_after_fill > 0
            )
            
            if final_success and not has_submit_evidence:
                slog.detail_warning("⚠️ Overriding success to False - no submit/click attempts detected")
                final_success = False
            
            if final_success and len(self.state.fields_filled) == 0:
                slog.detail_warning("⚠️ Overriding success to False - no fields were filled")
                final_success = False
            
            if final_success:
                slog.detail_success(f"✅ Signup completed successfully!")
            elif self.state.stuck_loop_detected:
                slog.detail_warning(f"❌ Signup failed - stuck in error loop")
            else:
                slog.detail_warning(f"❌ Signup not completed - form submitted: {self.state.form_submitted}, fields: {len(self.state.fields_filled)}")
            
            # Build detailed failure summary with categorized errors
            failure_summary = self._build_failure_summary()
            
            # Build error list with primary error first
            errors = []
            if not final_success:
                errors.append(failure_summary["primary_error"])
                # Add other unique errors (excluding the primary)
                for err in failure_summary["all_errors"]:
                    if err != failure_summary["primary_error"] and err not in errors:
                        errors.append(err)
            
            return {
                "success": final_success,
                "fields_filled": list(self.state.fields_filled.keys()),
                "field_types_filled": self.state.get_filled_field_types(),
                "actions": summary["actions"],
                "errors": errors,
                "error_category": failure_summary["primary_category"] if not final_success else None,
                "error_details": failure_summary if not final_success else None,
                "form_submitted": self.state.form_submitted,
                "submit_attempts": self.state.submit_attempts,
                "stuck_loop_detected": self.state.stuck_loop_detected,
                "captcha_attempted": self.state.captcha_attempted,
                "captcha_solved": self.state.captcha_solved
            }
            
        except Exception as e:
            logger.error(f"❌ Agent error: {e}", exc_info=True)
            return {
                "success": False, 
                "fields_filled": [], 
                "actions": [], 
                "errors": [f"Agent exception: {str(e)[:100]}"],
                "error_category": "exception",
                "error_details": {"primary_error": str(e), "primary_category": "exception"}
            }
    
    def _should_use_vision(self, step: int, last_action_success: bool) -> bool:
        """Decide if vision should be used (expensive in tokens)."""
        if step == 1:
            return True
        if self.last_action_type in ["click", "submit", "wait"]:
            return True
        if not last_action_success:
            return True
        if step % 5 == 0:
            return True
        return False
    
    async def _check_form_requires_payment(self) -> Dict[str, Any]:
        """
        Check if the current form actually requires payment.
        This is a runtime check that looks for:
        - Credit card input fields within visible forms
        - Stripe/PayPal/Braintree iframes
        - Billing address fields that are mandatory
        
        Returns:
            Dict with 'requires_payment' bool and 'reason' string
        """
        try:
            result = await self.page.evaluate("""
                () => {
                    const result = {
                        requiresPayment: false,
                        reason: '',
                        details: []
                    };
                    
                    // Check for credit card input fields within forms
                    const ccFieldSelectors = [
                        'input[name*="card"]', 'input[name*="credit"]',
                        'input[name*="cvv"]', 'input[name*="cvc"]',
                        'input[autocomplete="cc-number"]', 'input[autocomplete="cc-exp"]',
                        '[class*="card-number"]', '[class*="credit-card"]'
                    ];
                    
                    const visibleCCFields = [];
                    ccFieldSelectors.forEach(selector => {
                        try {
                            document.querySelectorAll(selector).forEach(el => {
                                // Only count if visible
                                if (el.offsetParent !== null && !el.disabled) {
                                    visibleCCFields.push(selector);
                                }
                            });
                        } catch(e) {}
                    });
                    
                    if (visibleCCFields.length > 0) {
                        result.requiresPayment = true;
                        result.reason = `Credit card fields visible (${visibleCCFields.length} fields)`;
                        result.details.push('cc_fields');
                    }
                    
                    // Check for payment iframes (Stripe, PayPal, etc.)
                    const paymentIframes = document.querySelectorAll(
                        'iframe[src*="stripe"], iframe[src*="paypal"], iframe[src*="braintree"], ' +
                        'iframe[name*="stripe"], iframe[name*="paypal"], iframe[name*="braintree"]'
                    );
                    
                    if (paymentIframes.length > 0) {
                        result.requiresPayment = true;
                        result.reason = result.reason ? result.reason + ', payment iframe detected' : 'Payment iframe detected';
                        result.details.push('payment_iframe');
                    }
                    
                    // Check for active payment step in a multi-step form
                    const activePaymentStep = document.querySelector(
                        '.step.active.payment, .step.payment.current, [data-step="payment"].active, ' +
                        '.checkout-step.active, .billing-step.active'
                    );
                    
                    if (activePaymentStep) {
                        result.requiresPayment = true;
                        result.reason = result.reason ? result.reason + ', payment step active' : 'Payment step is active';
                        result.details.push('payment_step');
                    }
                    
                    // Check if there's a prominent "free" indicator that overrides
                    // (e.g., "Free Newsletter", "No credit card required")
                    const pageText = document.body.innerText.toLowerCase();
                    const freeIndicators = [
                        'no credit card required',
                        'no card required',
                        'no payment required',
                        'free newsletter',
                        'completely free',
                        '100% free',
                        'free signup',
                        'free to join'
                    ];
                    
                    const hasFreeIndicator = freeIndicators.some(ind => pageText.includes(ind));
                    
                    // If there's a clear "free" message near the form, don't require payment
                    if (hasFreeIndicator && result.details.length < 2) {
                        result.requiresPayment = false;
                        result.reason = 'Free indicator found, overriding payment detection';
                    }
                    
                    return result;
                }
            """)
            
            return {
                "requires_payment": result.get("requiresPayment", False),
                "reason": result.get("reason", ""),
                "details": result.get("details", [])
            }
            
        except Exception as e:
            logger.warning(f"Payment check error: {e}")
            return {"requires_payment": False, "reason": f"Check failed: {e}"}

    async def _check_unwanted_page_state(self) -> Dict[str, Any]:
        """
        Check if the page has navigated to an unwanted state (Cart, Checkout, Product Page, App Store).
        This is critical to avoid wasting tokens on non-signup pages.
        """
        current_url = self.page.url.lower()
        
        # 0. APP STORE DETECTION (highest priority - check first)
        # When a navigation button leads to an app download page, skip immediately
        app_store_domains = [
            # Google Play Store
            "play.google.com",
            "market.android.com",
            # Apple App Store
            "apps.apple.com",
            "itunes.apple.com",
            # Amazon Appstore
            "amazon.com/dp/",
            "amazon.com/gp/product/",
            "amazon.com/gp/mas/",
            # Microsoft Store
            "microsoft.com/store/apps",
            "microsoft.com/p/",
            "apps.microsoft.com",
            # Samsung Galaxy Store
            "galaxystore.samsung.com",
            "apps.samsung.com",
            # Huawei AppGallery
            "appgallery.huawei.com",
            # F-Droid (open source Android store)
            "f-droid.org/packages/",
            # APK download sites (unwanted)
            "apkpure.com",
            "apkmirror.com",
            "aptoide.com",
        ]
        
        for domain in app_store_domains:
            if domain in current_url:
                return {"is_unwanted": True, "reason": f"App store page detected: {domain}"}
        
        # Also check if the page title indicates an app store
        try:
            page_title = await self.page.title()
            if page_title:
                title_lower = page_title.lower()
                app_store_title_patterns = [
                    "on the app store",
                    "on google play",
                    "apps on google play",
                    "get it on google play",
                    "download on the app store",
                    "android apps on google play",
                    "- google play",
                    "- app store",
                    "microsoft store",
                    "galaxy store",
                ]
                for pattern in app_store_title_patterns:
                    if pattern in title_lower:
                        return {"is_unwanted": True, "reason": f"App store title detected: {pattern}"}
        except:
            pass  # Title check failed, continue with other checks
        
        # 1. URL-based detection (fastest)
        # Avoid skipping /forms/ or /signup/
        if "/forms/" in current_url or "/signup/" in current_url or "/register/" in current_url:
            pass # Likely safe
        else:
            unwanted_url_patterns = [
                "/cart", "/checkout", "/basket", "/bag", 
                "/login", "/signin", "/auth/login",
                "/shop/", "/orders", "/account/login"
            ]
            
            for pattern in unwanted_url_patterns:
                if pattern in current_url:
                    return {"is_unwanted": True, "reason": f"Unwanted URL pattern: {pattern}"}
        
        # 2. Content-based detection (using JS)
        try:
            result = await self.page.evaluate("""
                () => {
                    const title = document.title.toLowerCase();
                    const h1s = Array.from(document.querySelectorAll('h1')).map(h => h.innerText.toLowerCase());
                    
                    // Cart/Checkout Indicators
                    if (title.includes('shopping cart') || title.includes('your cart') || title.includes('checkout')) return {isUnwanted: true, reason: 'Cart/Checkout title detected'};
                    if (h1s.some(h => h.includes('shopping cart') || h.includes('your cart') || h.includes('checkout') || h.includes('your bag'))) return {isUnwanted: true, reason: 'Cart/Checkout heading detected'};
                    
                    // Product Selection Indicators (Quantity selectors + Add to Cart)
                    // Be careful not to flag "Add to Cart" IF there is also a "Subscribe" option, but usually Add to Cart means product
                    const hasQuantity = document.querySelector('input[name="quantity"], select[name="quantity"], .quantity-selector');
                    const hasAddToCart = Array.from(document.querySelectorAll('button, input[type="submit"], a.btn, button.btn')).some(b => {
                        const t = (b.innerText || b.value || '').toLowerCase();
                        return (t.includes('add to cart') || t.includes('add to bag') || t.includes('proceed to checkout'));
                    });
                    
                    if (hasQuantity && hasAddToCart) return {isUnwanted: true, reason: 'Product page detected (Quantity + Add to Cart)'};
                    
                    // Specific to Shopify/Commerce
                    if (window.location.href.includes('/products/') && hasAddToCart) {
                        return {isUnwanted: true, reason: 'Product page with Add to Cart detected'};
                    }

                    // Login Indicators (Reinforce initial check)
                    if ((title.includes('login') || title.includes('sign in')) && !title.includes('sign up') && !title.includes('register')) {
                         // Check for login forms vs signup forms
                         const hasLoginBtn = Array.from(document.querySelectorAll('button')).some(b => b.innerText.toLowerCase().includes('log in') || b.innerText.toLowerCase().includes('sign in'));
                         if (hasLoginBtn) return {isUnwanted: true, reason: 'Login page detected'};
                    }
                    
                    // ACCOUNT REGISTRATION DETECTION (password required = not a simple newsletter)
                    // Skip forms that require password - these are account creation, not newsletter signups
                    const passwordInputs = document.querySelectorAll('input[type="password"]');
                    if (passwordInputs.length > 0) {
                        // Check if password input is visible (not hidden)
                        const hasVisiblePassword = Array.from(passwordInputs).some(inp => {
                            const style = window.getComputedStyle(inp);
                            const rect = inp.getBoundingClientRect();
                            return style.display !== 'none' && 
                                   style.visibility !== 'hidden' && 
                                   parseFloat(style.opacity) > 0 &&
                                   rect.width > 0 && rect.height > 0;
                        });
                        
                        if (hasVisiblePassword) {
                            // Check for "Create Account", "Sign Up", "Register" buttons with password
                            const accountBtns = Array.from(document.querySelectorAll('button, input[type="submit"]')).filter(b => {
                                const t = (b.innerText || b.value || '').toLowerCase();
                                return t.includes('create account') || t.includes('sign up') || 
                                       t.includes('register') || t.includes('get started') ||
                                       t.includes('create your account') || t.includes('join now');
                            });
                            
                            // Also check for OAuth/Social login buttons (another sign this is account creation)
                            const hasSocialLogin = document.querySelector(
                                'button[data-provider], [class*="google"], [class*="facebook"], ' +
                                '[class*="apple"], [class*="oauth"], [class*="social-login"], ' +
                                'a[href*="oauth"], a[href*="auth/google"], a[href*="auth/facebook"]'
                            );
                            
                            // Check for "Continue with Google/Facebook" text
                            const hasSocialText = Array.from(document.querySelectorAll('button, a')).some(el => {
                                const t = (el.innerText || '').toLowerCase();
                                return t.includes('continue with google') || t.includes('continue with facebook') ||
                                       t.includes('sign in with google') || t.includes('sign up with google') ||
                                       t.includes('login with google') || t.includes('sign in with apple');
                            });
                            
                            if (accountBtns.length > 0 || hasSocialLogin || hasSocialText) {
                                return {isUnwanted: true, reason: 'Account registration form detected (password + create account button)'};
                            }
                            
                            // If there's a password field with email field, it's likely login/signup form
                            const hasEmailInput = document.querySelector('input[type="email"], input[name*="email"]');
                            if (hasEmailInput) {
                                return {isUnwanted: true, reason: 'Login/Registration form detected (email + password fields)'};
                            }
                        }
                    }
                    
                    return {isUnwanted: false, reason: ''};
                }
            """)
            return {"is_unwanted": result["isUnwanted"], "reason": result["reason"]}
            
        except Exception as e:
            return {"is_unwanted": False, "reason": str(e)}
    
    async def _capture_screenshot(self) -> Optional[str]:
        """Capture full page screenshot as base64 for comprehensive AI visibility."""
        try:
            # Use full_page=True to capture the entire webpage
            # This gives the AI better visibility of all elements including:
            # - Footer newsletter forms
            # - Below-the-fold signup sections
            # - Modal/popup triggers that may be visible after scrolling
            screenshot_bytes = await self.page.screenshot(full_page=True)
            return base64.b64encode(screenshot_bytes).decode('utf-8')
        except Exception as e:
            logger.error(f"Screenshot error: {e}")
            # Fallback to viewport screenshot if full page fails
            try:
                screenshot_bytes = await self.page.screenshot(full_page=False)
                return base64.b64encode(screenshot_bytes).decode('utf-8')
            except:
                return None
    
    async def _observe_page(self, use_vision: bool = True) -> Dict[str, Any]:
        """Observe current page state."""
        logger.debug(f"👁️ Observing page (vision={use_vision})...")
        
        try:
            screenshot_base64 = await self._capture_screenshot() if use_vision else None
            page_info = await self.llm_analyzer._extract_page_info()
            
            visible_text = await self.page.evaluate("""
                () => document.body.innerText.substring(0, 2000)
            """)
            
            # More rigorous success detection
            # Don't just look for keywords - check for actual success patterns
            success_detection = await self._detect_success_indicator(visible_text)
            
            # Detect login indicators
            login_indicators = await self.page.evaluate("""
                () => {
                    const pageText = document.body.innerText.toLowerCase();
                    const indicators = {
                        hasForgotPassword: false,
                        hasRememberMe: false,
                        hasLoginButton: false,
                        hasSignupButton: false,
                        hasPasswordOnly: false
                    };
                    
                    // Check for forgot password
                    indicators.hasForgotPassword = pageText.includes('forgot password') || 
                        pageText.includes('reset password') ||
                        pageText.includes('forgot your password');
                    
                    // Check for remember me
                    const rememberCheckbox = document.querySelector('input[type="checkbox"]');
                    if (rememberCheckbox) {
                        const label = rememberCheckbox.closest('label')?.textContent?.toLowerCase() || '';
                        indicators.hasRememberMe = label.includes('remember');
                    }
                    
                    // Check buttons
                    document.querySelectorAll('button, input[type="submit"], a[role="button"]').forEach(btn => {
                        const text = (btn.textContent || btn.value || '').toLowerCase();
                        if (text.match(/^(sign in|log in|login)$/)) {
                            indicators.hasLoginButton = true;
                        }
                        if (text.match(/^(sign up|signup|register|create account|join|subscribe)$/)) {
                            indicators.hasSignupButton = true;
                        }
                    });
                    
                    // Check if form only has email + password (login pattern)
                    const inputs = document.querySelectorAll('input');
                    let hasEmail = false, hasPassword = false, hasName = false, hasPhone = false;
                    inputs.forEach(inp => {
                        const type = inp.type?.toLowerCase();
                        const name = (inp.name + inp.id + inp.placeholder).toLowerCase();
                        if (type === 'email' || name.includes('email')) hasEmail = true;
                        if (type === 'password') hasPassword = true;
                        if (name.includes('name') && !name.includes('username')) hasName = true;
                        if (type === 'tel' || name.includes('phone')) hasPhone = true;
                    });
                    indicators.hasPasswordOnly = hasEmail && hasPassword && !hasName && !hasPhone;
                    
                    return indicators;
                }
            """)
            
            # Determine if this looks like a login page
            is_likely_login = (
                login_indicators.get('hasForgotPassword') or
                login_indicators.get('hasRememberMe') or
                (login_indicators.get('hasLoginButton') and not login_indicators.get('hasSignupButton')) or
                login_indicators.get('hasPasswordOnly')
            )
            
            # Detect error messages on page
            error_messages = await self.page.evaluate("""
                () => {
                    const errors = [];
                    const errorSelectors = [
                        '.error', '.error-message', '.field-error', '.validation-error',
                        '[class*="error"]', '[class*="invalid"]', '[role="alert"]',
                        '.text-danger', '.invalid-feedback'
                    ];
                    
                    errorSelectors.forEach(selector => {
                        try {
                            document.querySelectorAll(selector).forEach(el => {
                                if (el.offsetParent !== null && el.textContent.trim()) {
                                    errors.push({ text: el.textContent.trim().substring(0, 100) });
                                }
                            });
                        } catch(e) {}
                    });
                    return errors.slice(0, 5);
                }
            """)
            
            # Detect VISIBLE CAPTCHA presence on page (not just hidden scripts/elements)
            captcha_detected = await self.page.evaluate("""
                () => {
                    const result = {
                        found: false,
                        type: null,
                        isVisible: false,
                        hasVisibleCheckbox: false
                    };
                    
                    // Helper to check if element is actually visible
                    const isElementVisible = (el) => {
                        if (!el) return false;
                        const rect = el.getBoundingClientRect();
                        const style = window.getComputedStyle(el);
                        return rect.width > 0 && rect.height > 0 && 
                               style.display !== 'none' && 
                               style.visibility !== 'hidden' &&
                               parseFloat(style.opacity) > 0;
                    };
                    
                    // Check for VISIBLE reCAPTCHA iframe (not just any recaptcha element)
                    const recaptchaIframe = document.querySelector('iframe[src*="recaptcha"][src*="anchor"]');
                    if (recaptchaIframe && isElementVisible(recaptchaIframe)) {
                        result.found = true;
                        result.type = 'recaptcha';
                        result.isVisible = true;
                        result.hasVisibleCheckbox = true;
                    }
                    
                    // Check for visible g-recaptcha container that's actually rendered
                    const gRecaptcha = document.querySelector('.g-recaptcha');
                    if (gRecaptcha && isElementVisible(gRecaptcha)) {
                        const iframe = gRecaptcha.querySelector('iframe');
                        if (iframe && isElementVisible(iframe)) {
                            result.found = true;
                            result.type = 'recaptcha';
                            result.isVisible = true;
                            result.hasVisibleCheckbox = true;
                        }
                    }
                    
                    // Check for visible hCaptcha
                    const hcaptchaIframe = document.querySelector('iframe[src*="hcaptcha"]');
                    if (hcaptchaIframe && isElementVisible(hcaptchaIframe)) {
                        result.found = true;
                        result.type = 'hcaptcha';
                        result.isVisible = true;
                        result.hasVisibleCheckbox = true;
                    }
                    
                    // Check for visible Cloudflare Turnstile
                    const turnstileIframe = document.querySelector('iframe[src*="challenges.cloudflare"]');
                    if (turnstileIframe && isElementVisible(turnstileIframe)) {
                        result.found = true;
                        result.type = 'turnstile';
                        result.isVisible = true;
                    }
                    
                    // Check for visible reCAPTCHA challenge popup (image selection)
                    const challengeIframe = document.querySelector('iframe[src*="recaptcha"][src*="bframe"]');
                    if (challengeIframe && isElementVisible(challengeIframe)) {
                        result.found = true;
                        result.type = 'recaptcha_challenge';
                        result.isVisible = true;
                    }
                    
                    // Check for visible "please complete captcha" type errors
                    const pageText = document.body.innerText.toLowerCase();
                    const hasCaptchaError = (pageText.includes('please fill captcha') || 
                                            pageText.includes('please complete the captcha') ||
                                            pageText.includes('captcha verification required'));
                    if (hasCaptchaError) {
                        result.found = true;
                        result.type = 'captcha_error';
                        result.isVisible = true;
                    }
                    
                    return result;
                }
            """)
            
            return {
                "url": self.page.url,
                "screenshot": screenshot_base64,
                "forms": page_info.get("forms", []),
                "inputs": page_info.get("inputs", []),
                "buttons": page_info.get("buttons", []),
                "visible_text": visible_text,
                "simplified_html": page_info.get("simplifiedHtml", ""),
                "has_success_indicator": success_detection["is_success"],
                "success_reason": success_detection.get("reason", ""),
                "has_error_messages": len(error_messages) > 0,
                "error_messages": error_messages,
                "fields_already_filled": self.state.fields_filled,
                "is_likely_login_page": is_likely_login,
                "login_indicators": login_indicators,
                "form_count": len(page_info.get("forms", [])),
                "captcha_detected": captcha_detected
            }
            
        except Exception as e:
            logger.error(f"Observe error: {e}")
            return {}
    
    async def _reason_next_action(self, page_state: Dict[str, Any]) -> Optional[AgentAction]:
        """Use LLM to determine next action with rate limit handling."""
        logger.debug("🧠 Reasoning next action...")
        
        # Check for stop before making LLM call
        if self._stop_check():
            slog.detail("⏹ Stop requested before LLM call")
            return None
        
        try:
            if not page_state:
                return AgentAction("wait", reasoning="Page is loading")
            
            # Detect current country code from page BEFORE reasoning
            detected_country_code = await self._detect_country_code_from_page()
            if detected_country_code:
                self.state.detected_country_code = detected_country_code
            
            context = self._build_reasoning_context(page_state)
            
            # Check for repetitive failures (loop detection)
            recent_actions = self.state.actions_taken[-6:]
            if len(recent_actions) >= 4:
                phone_fill_attempts = [a for a in recent_actions 
                                      if "phone" in (a.selector or "").lower() 
                                      or "phone" in (a.reasoning or "").lower()]
                if len(phone_fill_attempts) >= 3:
                    # Bot is stuck on phone - force use detected country code
                    logger.warning("⚠️ Detected phone fill loop - using auto-generated number")
                    country = getattr(self.state, 'detected_country_code', '1')
                    phone_number = self._generate_phone_for_country(country)
                    slog.detail(f"   📞 Auto-generated phone for +{country}: {phone_number}")
                    
                    # Find phone selector from page
                    phone_selector = "[name='phoneNumber']"
                    for inp in page_state.get("inputs", []):
                        if inp.get("type") == "tel" or "phone" in (inp.get("name", "") + inp.get("id", "")).lower():
                            phone_selector = f"#{inp['id']}" if inp.get('id') else f"[name='{inp.get('name')}']"
                            break
                    
                    return AgentAction(
                        action_type="fill_field",
                        selector=phone_selector,
                        value=phone_number,
                        reasoning=f"Auto-generated valid phone for detected country +{country}"
                    )
            
            # Rate limit handling
            max_retries = 3
            retry_count = 0
            
            while retry_count <= max_retries:
                try:
                    llm_response = await self.llm_analyzer._call_llm_for_next_action(
                        context=context,
                        conversation_history=self.state.conversation_history,
                        screenshot_base64=page_state.get("screenshot")
                    )
                    
                    self.consecutive_rate_limits = 0
                    break
                    
                except Exception as e:
                    error_msg = str(e)
                    if "rate_limit" in error_msg.lower():
                        retry_count += 1
                        self.consecutive_rate_limits += 1
                        
                        if retry_count > max_retries:
                            raise Exception("Rate limit exceeded after retries")
                        
                        # Parse wait time or use progressive backoff
                        wait_time = 10 * retry_count
                        if "Please try again in" in error_msg:
                            match = re.search(r'in ([\d.]+)(m|s)', error_msg)
                            if match:
                                val = float(match.group(1))
                                wait_time = (val * 60 if match.group(2) == 'm' else val) + 2
                        
                        logger.warning(f"⏳ Rate limit (retry {retry_count}/{max_retries}), waiting {wait_time:.0f}s...")
                        await asyncio.sleep(wait_time)
                        continue
                    else:
                        raise
            
            if not llm_response:
                return None
            
            # Detect country code change attempts
            reasoning = llm_response.get("reasoning", "").lower()
            selector = llm_response.get("selector", "").lower()
            action_type = llm_response.get("action", "")
            
            is_country_code_attempt = (
                action_type == "click" and 
                ("country" in reasoning or "country" in selector or 
                 "+92" in selector or "+1" in selector or "+44" in selector or
                 "🇵🇰" in selector or "🇺🇸" in selector or "🇬🇧" in selector or
                 "dial" in selector.lower() or "flag" in selector.lower())
            )
            
            if is_country_code_attempt:
                self.state.country_code_attempts += 1
                slog.detail(f"   📞 Country code change attempt #{self.state.country_code_attempts}")
                
                # After 1 attempt, immediately use detected country code
                if self.state.country_code_attempts >= 1:
                    logger.warning("⚠️ Country code dropdown detected - leaving at default and generating matching phone!")
                    self.state.phone_fallback_used = True
                    
                    country = getattr(self.state, 'detected_country_code', '92')
                    phone_number = self._generate_phone_for_country(country)
                    
                    # Find phone selector
                    phone_selector = "[name='phoneNumber']"
                    for inp in page_state.get("inputs", []):
                        if inp.get("type") == "tel" or "phone" in (inp.get("name", "") + inp.get("id", "")).lower():
                            phone_selector = f"#{inp['id']}" if inp.get('id') else f"[name='{inp.get('name')}']"
                            break
                    
                    return AgentAction(
                        action_type="fill_field",
                        selector=phone_selector,
                        value=phone_number,
                        reasoning=f"Using default country code +{country}, generated matching phone: {phone_number}"
                    )
            
            self.state.conversation_history.append({
                "role": "assistant",
                "content": json.dumps(llm_response)
            })
            
            action = self._parse_llm_response(llm_response, page_state)
            
            if action:
                # Simple log: one-liner for the step
                action_desc = action.action_type
                if action.action_type == "fill_field":
                    field_type = "email" if "email" in (action.selector or "").lower() else "field"
                    action_desc = f"Fill {field_type}"
                elif action.action_type == "click":
                    if "submit" in (action.reasoning or "").lower():
                        action_desc = "Submit form"
                    else:
                        action_desc = "Click button"
                elif action.action_type == "complete":
                    action_desc = "Complete"
                
                slog.step_simple(self.state.current_step, action_desc, action.selector or "")
                
                # Detailed logging
                slog.detail(f"💡 LLM Decision: {action.action_type}")
                slog.detail(f"   🧠 {action.reasoning}")
                if action.selector:
                    slog.detail(f"   🎯 {action.selector[:50]}")
            
            return action
            
        except Exception as e:
            logger.error(f"Reasoning error: {e}")
            # Store the error so it can be reported in results
            self.last_llm_error = str(e)
            return None
    
    def _build_reasoning_context(self, page_state: Dict[str, Any]) -> Dict[str, Any]:
        """Build context for LLM reasoning."""
        # Build action history
        action_history = []
        for action in self.state.actions_taken[-5:]:
            action_history.append({
                "type": action.action_type,
                "selector": action.selector,
                "success": action.success,
                "error": action.error_message if not action.success else None
            })
        
        # Build failed selector hints
        failed_selectors = {}
        for action in self.state.actions_taken:
            if not action.success and action.selector:
                if action.selector not in failed_selectors:
                    failed_selectors[action.selector] = {"count": 0, "error": action.error_message}
                failed_selectors[action.selector]["count"] += 1
        
        selector_hints = []
        for selector, info in failed_selectors.items():
            if info["count"] >= 1:
                hint = f"❌ '{selector[:40]}' FAILED {info['count']}x"
                if info["error"]:
                    hint += f": {info['error'][:50]}"
                    if "hidden" in info["error"].lower():
                        hint += " → Try fill_field with checkbox type"
                    elif "timeout" in info["error"].lower():
                        hint += " → Try different selector"
                selector_hints.append(hint)
        
        # Build filled field types for clear display
        filled_field_types = self.state.get_filled_field_types()
        
        return {
            "goal": "Sign up for email list",
            "credentials": self.credentials,
            "current_step": self.state.current_step,
            "page_url": page_state.get("url", ""),
            "visible_inputs": page_state.get("inputs", []),
            "visible_buttons": page_state.get("buttons", []),
            "page_text_sample": page_state.get("visible_text", "")[:500],
            "simplified_html": page_state.get("simplified_html", ""),
            "fields_filled": list(self.state.fields_filled.keys()),
            "field_types_filled": filled_field_types,  # e.g., ["email", "name", "phone"]
            "action_history": action_history,
            "has_success_indicator": page_state.get("has_success_indicator", False),
            "has_error_messages": page_state.get("has_error_messages", False),
            "error_messages": page_state.get("error_messages", []),
            "failed_selector_hints": selector_hints,
            "checkboxes_checked": self.state.checkboxes_checked,
            "country_code_attempts": self.state.country_code_attempts,
            "phone_fallback_used": self.state.phone_fallback_used,
            "detected_country_code": getattr(self.state, 'detected_country_code', None),
            # IMPORTANT: Local page analysis - this is ground truth from thorough analysis
            "local_page_analysis": self.page_analysis,
            # IMPORTANT: Active form context - use this to find the correct submit button
            "active_form": {
                "form_id": self.state.active_form_id,
                "form_selector": self.state.active_form_selector,
                "submit_selector": self.state.active_form_submit_selector
            } if self.state.active_form_id else None,
        }
    
    def _parse_llm_response(self, llm_response: Dict[str, Any], page_state: Dict[str, Any] = None) -> Optional[AgentAction]:
        """Parse LLM response into AgentAction with phone/checkbox handling."""
        try:
            action_type = llm_response.get("action", "unknown")
            selector = llm_response.get("selector", "")
            value = llm_response.get("value", "")
            reasoning = llm_response.get("reasoning", "")
            normalized_field_type = None  # Track the normalized field type
            
            if action_type == "fill_field":
                field_type = llm_response.get("field_type", "").lower()
                
                if field_type == "email":
                    value = self.credentials.get("email", "")
                    normalized_field_type = "email"
                
                elif field_type in ["full_name", "fullname", "name"]:
                    value = self.credentials.get("full_name", "")
                    normalized_field_type = "name"
                
                elif field_type in ["first_name", "firstname"]:
                    value = self.credentials.get("first_name", "")
                    normalized_field_type = "first_name"
                
                elif field_type in ["last_name", "lastname"]:
                    value = self.credentials.get("last_name", "")
                    normalized_field_type = "last_name"
                
                elif field_type in ["country_code", "countrycode"]:
                    # DON'T try to change country code - skip this action
                    slog.detail("   ⚠️ Skipping country code change - will use detected default")
                    self.state.country_code_attempts += 1
                    return None
                
                elif field_type in ["phone", "phone_number"]:
                    # ALWAYS use detected country code for phone generation
                    detected_country = getattr(self.state, 'detected_country_code', '1')
                    normalized_field_type = "phone"
                    
                    if llm_response.get("use_phone_number_only", False) or detected_country != "1":
                        # Generate phone matching the detected country code
                        value = self._generate_phone_for_country(detected_country)
                        slog.detail(f"   📞 Generated phone for +{detected_country}: {value}")
                    else:
                        phone = self.credentials.get("phone", {})
                        if isinstance(phone, dict):
                            value = phone.get("number", "") or phone.get("full", "")
                        else:
                            value = str(phone)
                        
                        # If user's phone doesn't match detected country, generate a matching one
                        if value and detected_country not in ["1", ""]:
                            value = self._generate_phone_for_country(detected_country)
                            slog.detail(f"   📞 Generated matching phone for +{detected_country}: {value}")
                
                elif field_type in ["phone_fallback", "phonefallback"]:
                    # Generate phone for detected country code
                    detected_country = getattr(self.state, 'detected_country_code', '1')
                    value = self._generate_phone_for_country(detected_country)
                    slog.detail(f"   📞 Fallback phone for +{detected_country}: {value}")
                    normalized_field_type = "phone"
                
                elif field_type in ["business_name", "company", "company_name"]:
                    business_types = ["Marketing", "Consulting", "Digital", "Creative", "Tech", "Media", "Solutions"]
                    business_names = ["Pro", "Plus", "Group", "Agency", "Services", "Hub", "Labs", "Studio"]
                    value = f"{random.choice(business_types)} {random.choice(business_names)}"
                    normalized_field_type = "business_name"
                
                elif field_type in ["checkbox", "radio"]:
                    value = "true"
                    normalized_field_type = "checkbox"
                
                elif field_type in ["website", "url"]:
                    first_name = self.credentials.get("first_name", "user").lower()
                    value = f"https://{first_name}business.com"
                    normalized_field_type = "website"
                
                elif field_type in ["message", "comment", "notes"]:
                    value = "I'm interested in learning more about your services!"
                    normalized_field_type = "message"
                
                else:
                    normalized_field_type = field_type or "other"
                    if not value:
                        # Try to provide sensible defaults for unknown fields
                        if "company" in field_type or "business" in field_type:
                            value = "My Business LLC"
                        elif "website" in field_type or "url" in field_type:
                            value = "https://example.com"
                        else:
                            value = f"AutoFill"
            
            return AgentAction(
                action_type=action_type,
                selector=selector,
                value=value,
                reasoning=reasoning,
                field_type=normalized_field_type
            )
            
        except Exception as e:
            logger.error(f"Parse error: {e}")
            return None
    
    def _generate_phone_for_country(self, country_code: str) -> str:
        """Generate a valid phone number for a specific country code."""
        country_code = country_code.replace("+", "").strip()
        
        # Country-specific phone number formats
        phone_formats = {
            # Pakistan
            "92": {
                "prefixes": ["300", "306"],
                "length": 7  # After prefix
            },
            # India
            "91": {
                "prefixes": ["70", "72", "73", "74", "75", "76", "77", "78", "79",
                            "80", "81", "82", "83", "84", "85", "86", "87", "88", "89",
                            "90", "91", "92", "93", "94", "95", "96", "97", "98", "99"],
                "length": 8  # After prefix
            },
            # UK
            "44": {
                "prefixes": ["71", "72", "73", "74", "75", "76", "77", "78", "79"],
                "length": 8  # After prefix
            },
            # UAE
            "971": {
                "prefixes": ["50", "52", "54", "55", "56", "58"],
                "length": 7  # After prefix
            },
            # Saudi Arabia
            "966": {
                "prefixes": ["50", "53", "54", "55", "56", "57", "58", "59"],
                "length": 7  # After prefix
            },
            # Canada/US
            "1": {
                "prefixes": ["201", "202", "203", "204", "205", "206", "207", "208", "209",
                            "210", "212", "213", "214", "215", "216", "217", "218", "219",
                            "310", "312", "313", "314", "315", "316", "317", "318", "319",
                            "404", "405", "406", "407", "408", "409", "410", "412", "413",
                            "415", "416", "417", "418", "419", "424", "425"],
                "length": 7  # After prefix
            },
            # Australia
            "61": {
                "prefixes": ["400", "401", "402", "403", "404", "405", "406", "407", "408", "409",
                            "410", "411", "412", "413", "414", "415", "416", "417", "418", "419",
                            "420", "421", "422", "423", "424", "425", "426", "427", "428", "429"],
                "length": 6  # After prefix
            },
            # Germany
            "49": {
                "prefixes": ["151", "152", "153", "155", "156", "157", "159",
                            "160", "162", "163", "164", "170", "171", "172", "173", "174", "175", "176", "177", "178", "179"],
                "length": 7  # After prefix
            },
            # France
            "33": {
                "prefixes": ["6", "7"],
                "length": 8  # After prefix
            },
        }
        
        # Get format for country, default to US-like format
        format_info = phone_formats.get(country_code, phone_formats.get("1"))
        
        prefix = random.choice(format_info["prefixes"])
        remaining_digits = ''.join([str(random.randint(0, 9)) for _ in range(format_info["length"])])
        
        return f"{prefix}{remaining_digits}"
    
    async def _detect_country_code_from_page(self) -> Optional[str]:
        """
        Detect the currently selected country code from the page.
        Handles multiple formats:
        - Dial codes like +1, +92, +44
        - Flag emojis like 🇺🇸, 🇵🇰
        - Country names like "United States", "Pakistan"
        - ISO codes like "US", "PK"
        - Flag images with title/alt attributes
        """
        try:
            # Comprehensive country code detection
            country_code = await self.page.evaluate("""
                () => {
                    // Mapping of country identifiers to dial codes
                    const countryToDialCode = {
                        // Common countries - names
                        'united states': '1', 'usa': '1', 'us': '1', 'america': '1',
                        'canada': '1', 'ca': '1',
                        'united kingdom': '44', 'uk': '44', 'gb': '44', 'great britain': '44', 'england': '44',
                        'pakistan': '92', 'pk': '92',
                        'india': '91', 'in': '91',
                        'australia': '61', 'au': '61',
                        'germany': '49', 'de': '49', 'deutschland': '49',
                        'france': '33', 'fr': '33',
                        'italy': '39', 'it': '39',
                        'spain': '34', 'es': '34',
                        'brazil': '55', 'br': '55',
                        'mexico': '52', 'mx': '52',
                        'china': '86', 'cn': '86',
                        'japan': '81', 'jp': '81',
                        'south korea': '82', 'korea': '82', 'kr': '82',
                        'russia': '7', 'ru': '7',
                        'uae': '971', 'united arab emirates': '971', 'ae': '971',
                        'saudi arabia': '966', 'sa': '966',
                        'singapore': '65', 'sg': '65',
                        'hong kong': '852', 'hk': '852',
                        'indonesia': '62', 'id': '62',
                        'malaysia': '60', 'my': '60',
                        'philippines': '63', 'ph': '63',
                        'thailand': '66', 'th': '66',
                        'vietnam': '84', 'vn': '84',
                        'netherlands': '31', 'nl': '31', 'holland': '31',
                        'belgium': '32', 'be': '32',
                        'switzerland': '41', 'ch': '41',
                        'austria': '43', 'at': '43',
                        'poland': '48', 'pl': '48',
                        'sweden': '46', 'se': '46',
                        'norway': '47', 'no': '47',
                        'denmark': '45', 'dk': '45',
                        'finland': '358', 'fi': '358',
                        'ireland': '353', 'ie': '353',
                        'portugal': '351', 'pt': '351',
                        'greece': '30', 'gr': '30',
                        'turkey': '90', 'tr': '90',
                        'egypt': '20', 'eg': '20',
                        'south africa': '27', 'za': '27',
                        'nigeria': '234', 'ng': '234',
                        'kenya': '254', 'ke': '254',
                        'israel': '972', 'il': '972',
                        'new zealand': '64', 'nz': '64',
                        'argentina': '54', 'ar': '54',
                        'chile': '56', 'cl': '56',
                        'colombia': '57', 'co': '57',
                        'peru': '51', 'pe': '51',
                        'venezuela': '58', 've': '58',
                        'bangladesh': '880', 'bd': '880',
                        'sri lanka': '94', 'lk': '94',
                        'nepal': '977', 'np': '977',
                    };
                    
                    // Flag emoji to dial code mapping
                    const flagEmojiToDialCode = {
                        '🇺🇸': '1', '🇨🇦': '1',
                        '🇬🇧': '44', '🇵🇰': '92', '🇮🇳': '91',
                        '🇦🇺': '61', '🇩🇪': '49', '🇫🇷': '33',
                        '🇮🇹': '39', '🇪🇸': '34', '🇧🇷': '55',
                        '🇲🇽': '52', '🇨🇳': '86', '🇯🇵': '81',
                        '🇰🇷': '82', '🇷🇺': '7', '🇦🇪': '971',
                        '🇸🇦': '966', '🇸🇬': '65', '🇭🇰': '852',
                        '🇮🇩': '62', '🇲🇾': '60', '🇵🇭': '63',
                        '🇹🇭': '66', '🇻🇳': '84', '🇳🇱': '31',
                        '🇧🇪': '32', '🇨🇭': '41', '🇦🇹': '43',
                        '🇵🇱': '48', '🇸🇪': '46', '🇳🇴': '47',
                        '🇩🇰': '45', '🇫🇮': '358', '🇮🇪': '353',
                        '🇵🇹': '351', '🇬🇷': '30', '🇹🇷': '90',
                        '🇪🇬': '20', '🇿🇦': '27', '🇳🇬': '234',
                        '🇰🇪': '254', '🇮🇱': '972', '🇳🇿': '64',
                        '🇦🇷': '54', '🇨🇱': '56', '🇨🇴': '57',
                        '🇵🇪': '51', '🇻🇪': '58', '🇧🇩': '880',
                        '🇱🇰': '94', '🇳🇵': '977',
                    };
                    
                    // Helper function to extract dial code from text
                    const extractDialCode = (text) => {
                        if (!text) return null;
                        text = text.toLowerCase().trim();
                        
                        // First check for explicit dial code pattern (+XX or just digits)
                        const dialMatch = text.match(/\\+?(\\d{1,4})/);
                        if (dialMatch && dialMatch[1].length >= 1 && dialMatch[1].length <= 4) {
                            // Validate it's a known dial code
                            const code = dialMatch[1];
                            const knownCodes = ['1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', 
                                '40', '41', '43', '44', '45', '46', '47', '48', '49', '51', '52', '53', '54', 
                                '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', 
                                '84', '86', '90', '91', '92', '93', '94', '95', '98', '212', '213', '216', 
                                '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229', 
                                '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', 
                                '241', '242', '243', '244', '245', '246', '247', '248', '249', '250', '251', 
                                '252', '253', '254', '255', '256', '257', '258', '260', '261', '262', '263', 
                                '264', '265', '266', '267', '268', '269', '290', '291', '297', '298', '299',
                                '350', '351', '352', '353', '354', '355', '356', '357', '358', '359', '370',
                                '371', '372', '373', '374', '375', '376', '377', '378', '380', '381', '382',
                                '385', '386', '387', '389', '420', '421', '423', '500', '501', '502', '503',
                                '504', '505', '506', '507', '508', '509', '590', '591', '592', '593', '594',
                                '595', '596', '597', '598', '599', '670', '672', '673', '674', '675', '676',
                                '677', '678', '679', '680', '681', '682', '683', '685', '686', '687', '688',
                                '689', '690', '691', '692', '850', '852', '853', '855', '856', '880', '886',
                                '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971',
                                '972', '973', '974', '975', '976', '977', '992', '993', '994', '995', '996', '998'];
                            if (knownCodes.includes(code)) {
                                return code;
                            }
                        }
                        
                        // Check for flag emojis in text
                        for (const [flag, code] of Object.entries(flagEmojiToDialCode)) {
                            if (text.includes(flag)) {
                                return code;
                            }
                        }
                        
                        // Check for country names
                        for (const [country, code] of Object.entries(countryToDialCode)) {
                            if (text.includes(country)) {
                                return code;
                            }
                        }
                        
                        return null;
                    };
                    
                    // Selectors for country/phone code elements
                    const selectors = [
                        // Phone input library components
                        '.react-tel-input .selected-flag',
                        '.intl-tel-input .selected-flag', 
                        '.intl-tel-input .iti__selected-flag',
                        '.vue-tel-input .selected-flag',
                        '.iti__flag-container .iti__selected-flag',
                        '.flag-dropdown .selected-flag',
                        '.phone-input .flag',
                        
                        // Country code specific elements
                        '.country-code', '.dial-code', '.phone-code',
                        '[class*="countryCode"]', '[class*="country-code"]',
                        '[class*="dialCode"]', '[class*="dial-code"]',
                        '[class*="selectedCountry"]', '[class*="selected-country"]',
                        
                        // Data attributes
                        '[data-dial-code]', '[data-country-code]', '[data-country]',
                        
                        // Flag elements
                        '.flag', '[class*="flag"]',
                        '.selected-flag', '[class*="selected-flag"]',
                        
                        // Select dropdowns
                        'select[name*="country"] option:checked',
                        'select[class*="country"] option:checked',
                        'select[name*="code"] option:checked',
                        
                        // Generic code spans
                        'span[class*="code"]', 'div[class*="code"]'
                    ];
                    
                    // Try each selector
                    for (const selector of selectors) {
                        try {
                            const elements = document.querySelectorAll(selector);
                            for (const el of elements) {
                                // Check data attributes first
                                const dataDialCode = el.getAttribute('data-dial-code');
                                if (dataDialCode) {
                                    return dataDialCode.replace('+', '');
                                }
                                
                                const dataCountryCode = el.getAttribute('data-country-code');
                                if (dataCountryCode) {
                                    const code = countryToDialCode[dataCountryCode.toLowerCase()];
                                    if (code) return code;
                                }
                                
                                // Check title attribute (often contains country name for flags)
                                const title = el.getAttribute('title') || el.getAttribute('aria-label') || '';
                                const titleCode = extractDialCode(title);
                                if (titleCode) return titleCode;
                                
                                // Check text content
                                const textCode = extractDialCode(el.textContent);
                                if (textCode) return textCode;
                                
                                // Check for flag images
                                const flagImg = el.querySelector('img');
                                if (flagImg) {
                                    const alt = flagImg.getAttribute('alt') || '';
                                    const imgTitle = flagImg.getAttribute('title') || '';
                                    const imgSrc = flagImg.getAttribute('src') || '';
                                    
                                    const altCode = extractDialCode(alt);
                                    if (altCode) return altCode;
                                    
                                    const titleCode = extractDialCode(imgTitle);
                                    if (titleCode) return titleCode;
                                    
                                    // Try to extract country code from image filename
                                    const srcMatch = imgSrc.match(/\\/([a-z]{2})(?:\\.png|\\.svg|\\.jpg|\\.gif|$)/i);
                                    if (srcMatch) {
                                        const isoCode = srcMatch[1].toLowerCase();
                                        const code = countryToDialCode[isoCode];
                                        if (code) return code;
                                    }
                                }
                            }
                        } catch(e) {}
                    }
                    
                    // Check phone input containers more thoroughly
                    const phoneInputs = document.querySelectorAll('input[type="tel"], input[name*="phone"], input[class*="phone"]');
                    for (const input of phoneInputs) {
                        // Check all ancestors up to 4 levels
                        let parent = input.parentElement;
                        for (let i = 0; i < 4 && parent; i++) {
                            // Look for any element that might contain country info
                            const flagEl = parent.querySelector('.flag, [class*="flag"], [class*="country"]');
                            if (flagEl) {
                                const title = flagEl.getAttribute('title') || flagEl.getAttribute('aria-label') || '';
                                const code = extractDialCode(title);
                                if (code) return code;
                                
                                // Check text
                                const textCode = extractDialCode(flagEl.textContent);
                                if (textCode) return textCode;
                            }
                            
                            // Check parent text for dial code
                            const parentCode = extractDialCode(parent.textContent?.substring(0, 100));
                            if (parentCode) return parentCode;
                            
                            parent = parent.parentElement;
                        }
                    }
                    
                    // Last resort: Look for any visible +XX pattern in form areas
                    const forms = document.querySelectorAll('form');
                    for (const form of forms) {
                        const text = form.textContent || '';
                        const matches = text.match(/\\+(\\d{1,4})/g);
                        if (matches && matches.length > 0) {
                            return matches[0].replace('+', '');
                        }
                    }
                    
                    return null;
                }
            """)
            
            if country_code:
                slog.detail(f"📞 Detected country code from page: +{country_code}")
                return country_code
            
            # Default to US if nothing detected
            logger.debug("📞 No country code detected, defaulting to +1 (US)")
            return "1"
            
        except Exception as e:
            logger.debug(f"Could not detect country code: {e}")
            return "1"  # Default to US
    
    async def _detect_success_indicator(self, visible_text: str) -> Dict[str, Any]:
        """
        Rigorous success detection - must have actual evidence of successful signup.
        Returns dict with 'is_success' bool and 'reason' string.
        """
        visible_lower = visible_text.lower()
        
        # Strong success patterns - these strongly indicate actual success
        strong_success_patterns = [
            "thank you for signing up",
            "thanks for signing up",
            "thank you for registering",
            "thanks for registering",
            "registration successful",
            "signup successful",
            "sign up successful",
            "successfully registered",
            "successfully signed up",
            "account created",
            "account has been created",
            "welcome! your account",
            "welcome to your account",
            "check your email for confirmation",
            "check your inbox",
            "verification email sent",
            "confirmation email sent",
            "we've sent you an email",
            "we have sent you an email",
            "please verify your email",
            "please check your email",
            "you're all set",
            "you are all set",
            "you're in!",
            "you are in!",
            "registration complete",
            "signup complete",
            "sign up complete",
            "congratulations! you",
            "welcome aboard",
            "you've been added",
            "you have been added",
            "subscription confirmed",
            "you're subscribed",
            "you are subscribed",
            "successfully subscribed",
            "thank you for subscribing",
            "thanks for subscribing",
        ]
        
        # Check for strong success patterns
        for pattern in strong_success_patterns:
            if pattern in visible_lower:
                return {"is_success": True, "reason": f"Strong success pattern: '{pattern}'"}
        
        # If form was submitted, check for weaker success indicators
        if self.state.form_submitted and self.state.submit_attempts > 0:
            # Check if URL changed after submit (often indicates success)
            current_url = self.page.url
            if self.state.url_before_submit and current_url != self.state.url_before_submit:
                # URL changed - likely success if also has success keywords
                weak_success_keywords = ["thank", "success", "confirm", "welcome", "complete"]
                if any(kw in visible_lower for kw in weak_success_keywords):
                    return {"is_success": True, "reason": f"URL changed after submit + success keyword"}
            
            # Check if form disappeared
            try:
                form_count = await self.page.evaluate("() => document.querySelectorAll('form').length")
                if self.state.form_count_before_submit > 0 and form_count == 0:
                    # Form disappeared - might indicate success
                    weak_success_keywords = ["thank", "success", "confirm", "welcome"]
                    if any(kw in visible_lower for kw in weak_success_keywords):
                        return {"is_success": True, "reason": "Form disappeared + success keyword"}
            except:
                pass
            
            # NEW: Check for overlay/modal popup after submission
            # These often appear after successful signup (e.g., "thank you" popups, recommendation modals)
            # IMPORTANT: Some overlays contain CAPTCHAs or errors - must check content carefully!
            try:
                overlay_info = await self.page.evaluate("""
                    () => {
                        // Common overlay/modal selectors
                        const overlaySelectors = [
                            '[data-active="true"][class*="overlay"]',
                            '[data-active="true"][class*="modal"]',
                            '.formkit-overlay[data-active="true"]',
                            '.seva-overlay[data-active="true"]',
                            '[class*="modal"][class*="active"]',
                            '[class*="popup"][class*="show"]',
                            '[class*="overlay"][class*="visible"]',
                            '[role="dialog"][aria-hidden="false"]',
                            '[role="dialog"]:not([aria-hidden="true"])',
                            '.modal.show',
                            '.modal.in',
                            '[data-state="open"]',
                        ];
                        
                        for (const selector of overlaySelectors) {
                            try {
                                const overlay = document.querySelector(selector);
                                if (overlay && overlay.offsetParent !== null) {
                                    // Check overlay style
                                    const style = window.getComputedStyle(overlay);
                                    if (style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0) {
                                        // Get overlay text and HTML
                                        const overlayText = overlay.innerText?.toLowerCase() || '';
                                        const overlayHtml = overlay.innerHTML?.toLowerCase() || '';
                                        const hasIframe = overlay.querySelector('iframe') !== null;
                                        const iframeSrc = overlay.querySelector('iframe')?.src?.toLowerCase() || '';
                                        const hasCloseBtn = overlay.querySelector('[class*="close"], [aria-label*="close"], button svg') !== null;
                                        
                                        // CAPTCHA DETECTION - NOT success!
                                        const captchaIndicators = [
                                            'captcha', 'recaptcha', 'hcaptcha', 'turnstile', 
                                            'verify you are human', 'robot', 'i am not a robot',
                                            'security check', 'challenge'
                                        ];
                                        const hasCaptcha = captchaIndicators.some(c => 
                                            overlayText.includes(c) || overlayHtml.includes(c) || 
                                            iframeSrc.includes('recaptcha') || iframeSrc.includes('hcaptcha') ||
                                            iframeSrc.includes('challenges.cloudflare')
                                        );
                                        
                                        // Check for success indicators in overlay
                                        const successIndicators = [
                                            'thank you', 'thanks for', 'success', 'subscribed', 'confirmed', 
                                            'welcome', 'check your email', 'check your inbox',
                                            'you are in', 'congratulations'
                                        ];
                                        const hasSuccessText = successIndicators.some(kw => overlayText.includes(kw));
                                        
                                        // Recommendation indicators (success after signup)
                                        const hasRecommendation = overlayText.includes('recommendation') || 
                                            overlayText.includes('suggest') || iframeSrc.includes('recommendation');
                                        
                                        return {
                                            found: true,
                                            selector: selector,
                                            hasIframe: hasIframe,
                                            hasCaptcha: hasCaptcha,
                                            hasCloseBtn: hasCloseBtn,
                                            hasSuccessText: hasSuccessText,
                                            hasRecommendation: hasRecommendation,
                                            text: overlayText.substring(0, 200)
                                        };
                                    }
                                }
                            } catch (e) {}
                        }
                        
                        return { found: false };
                    }
                """)
                
                if overlay_info.get("found"):
                    slog.detail(f"   🔲 Detected overlay/modal popup after form submission")
                    
                    # CAPTCHA detected - NOT success, this requires manual intervention
                    if overlay_info.get("hasCaptcha"):
                        slog.detail_warning(f"   ⚠️ CAPTCHA detected in overlay - NOT marking as success")
                        # Don't return success - the main loop will handle this via _check_and_handle_overlay
                        pass
                    # Only mark as success if we have explicit success indicators
                    elif overlay_info.get("hasSuccessText"):
                        return {"is_success": True, "reason": f"Success overlay detected: {overlay_info.get('text', '')[:50]}"}
                    elif overlay_info.get("hasRecommendation"):
                        return {"is_success": True, "reason": f"Recommendation overlay after submit (post-signup)"}
                    # Iframe alone is NOT sufficient - could be CAPTCHA, verification, etc.
                    # Only trust iframe if it's combined with success text or recommendations
                    elif overlay_info.get("hasIframe"):
                        slog.detail(f"   🔍 Overlay has iframe but no success text - need to verify content")
                        # Don't automatically assume success
            except Exception as e:
                logger.debug(f"Overlay detection error: {e}")
        
        # Negative patterns - if these exist, definitely NOT success even if keywords match
        negative_patterns = [
            "error",
            "failed",
            "invalid",
            "required field",
            "please fill",
            "please enter",
            "please provide",
            "must be",
            "cannot be empty",
            "is required",
            "try again",
            "forgot password",  # Login page
            "sign in",  # Login page
            "log in",  # Login page
        ]
        
        has_negative = any(neg in visible_lower for neg in negative_patterns)
        
        # Simple success keywords are NOT enough by themselves
        # They could be in headers like "Welcome to Our Site" before signup
        simple_keywords = ["thank", "success", "confirm", "welcome"]
        has_simple_keyword = any(kw in visible_lower for kw in simple_keywords)
        
        # Only trust simple keywords if:
        # 1. Form was submitted AND
        # 2. No negative patterns AND  
        # 3. Multiple fields were filled
        if has_simple_keyword and not has_negative:
            if self.state.form_submitted and len(self.state.fields_filled) >= 2:
                return {"is_success": True, "reason": "Form submitted + multiple fields + success keyword"}
        
        # Default: NOT success
        return {"is_success": False, "reason": "No clear success indicator"}
    
    def _generate_fallback_phone(self, reasoning: str = "") -> str:
        """Generate a fallback phone number based on detected country code."""
        reasoning_text = reasoning.lower()
        
        # Try to extract country code from reasoning
        country_code = "1"  # Default to US
        
        # Match patterns like +92, +1, etc
        match = re.search(r'\+(\d{1,4})', reasoning_text)
        if match:
            country_code = match.group(1)
        elif "pakistan" in reasoning_text:
            country_code = "92"
        elif "india" in reasoning_text:
            country_code = "91"
        elif "uk" in reasoning_text or "britain" in reasoning_text:
            country_code = "44"
        elif "uae" in reasoning_text or "emirates" in reasoning_text:
            country_code = "971"
        elif "saudi" in reasoning_text:
            country_code = "966"
        elif "australia" in reasoning_text:
            country_code = "61"
        elif "germany" in reasoning_text:
            country_code = "49"
        elif "france" in reasoning_text:
            country_code = "33"
        
        return self._generate_phone_for_country(country_code)
    
    async def _check_and_handle_overlay(self) -> Dict[str, Any]:
        """
        Check for blocking overlays/modals that may indicate success or need to be closed.
        
        IMPORTANT: We must carefully analyze overlay content - not all overlays indicate success!
        Overlays can contain:
        - CAPTCHAs (NOT success)
        - Error messages (NOT success)
        - Additional verification steps (NOT success)
        - Success/confirmation messages (success)
        - Recommendation popups after signup (success)
        
        Returns:
            - {"is_success": True, "reason": "..."} if overlay indicates successful signup
            - {"closed": True} if overlay was closed
            - {"needs_action": True, "reason": "..."} if overlay requires user action (CAPTCHA, etc.)
            - {} if no overlay found
        """
        try:
            overlay_info = await self.page.evaluate("""
                () => {
                    // Common overlay/modal selectors
                    const overlaySelectors = [
                        '[data-active="true"][class*="overlay"]',
                        '[data-active="true"][class*="modal"]',
                        '.formkit-overlay[data-active="true"]',
                        '.seva-overlay[data-active="true"]',
                        '[class*="modal"][class*="active"]',
                        '[class*="popup"][class*="show"]',
                        '[class*="overlay"][class*="visible"]',
                        '[role="dialog"][aria-hidden="false"]',
                        '[role="dialog"]:not([aria-hidden="true"])',
                        '.modal.show',
                        '.modal.in',
                        '[data-state="open"]',
                    ];
                    
                    for (const selector of overlaySelectors) {
                        try {
                            const overlay = document.querySelector(selector);
                            if (overlay && overlay.offsetParent !== null) {
                                const style = window.getComputedStyle(overlay);
                                if (style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0) {
                                    const overlayText = overlay.innerText?.toLowerCase() || '';
                                    const overlayHtml = overlay.innerHTML?.toLowerCase() || '';
                                    const hasIframe = overlay.querySelector('iframe') !== null;
                                    
                                    // Get iframe src if exists
                                    const iframeSrc = overlay.querySelector('iframe')?.src || '';
                                    const iframeSrcLower = iframeSrc.toLowerCase();
                                    
                                    // CAPTCHA DETECTION - these are NOT success!
                                    const captchaIndicators = [
                                        'captcha', 'recaptcha', 'hcaptcha', 'turnstile', 
                                        'verify you are human', 'robot', 'bot detection',
                                        'security check', 'challenge', 'i am not a robot',
                                        'verify you are not a robot', 'prove you are human'
                                    ];
                                    const hasCaptcha = captchaIndicators.some(c => 
                                        overlayText.includes(c) || overlayHtml.includes(c) || iframeSrcLower.includes(c)
                                    );
                                    
                                    // Check for CAPTCHA iframes
                                    const captchaIframeDomains = [
                                        'recaptcha', 'google.com/recaptcha', 'hcaptcha.com', 
                                        'challenges.cloudflare.com', 'turnstile'
                                    ];
                                    const hasCaptchaIframe = hasIframe && captchaIframeDomains.some(d => iframeSrcLower.includes(d));
                                    
                                    // ERROR/VALIDATION DETECTION - these are NOT success!
                                    const errorIndicators = [
                                        'error', 'failed', 'invalid', 'incorrect', 
                                        'please try again', 'something went wrong',
                                        'required field', 'please fill', 'please enter'
                                    ];
                                    const hasError = errorIndicators.some(e => overlayText.includes(e));
                                    
                                    // SUCCESS INDICATORS
                                    const successIndicators = [
                                        'thank you', 'thanks for', 'success', 'confirmed', 
                                        'subscribed', 'welcome', 'check your email', 
                                        'check your inbox', 'verification email sent',
                                        'you are in', 'congratulations',
                                        'successfully registered', 'successfully subscribed'
                                    ];
                                    const hasSuccessText = successIndicators.some(s => overlayText.includes(s));
                                    
                                    // RECOMMENDATION/SUGGESTION INDICATORS (usually appear after successful signup)
                                    const recommendationIndicators = [
                                        'recommendation', 'suggest', 'you might also like',
                                        'other newsletters', 'similar', 'discover more'
                                    ];
                                    const hasRecommendation = recommendationIndicators.some(r => overlayText.includes(r) || iframeSrcLower.includes(r));
                                    
                                    // Look for close button
                                    const closeSelectors = [
                                        '[class*="close"]',
                                        '[aria-label*="close"]',
                                        '[aria-label*="Close"]',
                                        'button svg[viewBox]',  // SVG close icons
                                        '[data-formkit-close]',
                                        '.formkit-close',
                                        'button[type="button"]:has(svg)',
                                    ];
                                    
                                    let closeBtn = null;
                                    for (const closeSelector of closeSelectors) {
                                        try {
                                            closeBtn = overlay.querySelector(closeSelector);
                                            if (closeBtn) break;
                                        } catch(e) {}
                                    }
                                    
                                    return {
                                        found: true,
                                        selector: selector,
                                        hasIframe: hasIframe,
                                        iframeSrc: iframeSrc,
                                        hasCaptcha: hasCaptcha || hasCaptchaIframe,
                                        hasError: hasError,
                                        hasSuccessText: hasSuccessText,
                                        hasRecommendation: hasRecommendation,
                                        hasCloseBtn: closeBtn !== null,
                                        closeBtnSelector: closeBtn ? (closeBtn.id ? '#' + closeBtn.id : 
                                            (closeBtn.className ? '.' + closeBtn.className.split(' ')[0] : 
                                            '[data-formkit-close], .formkit-close, [aria-label*="close"], button:has(svg)')) : null,
                                        text: overlayText.substring(0, 500)
                                    };
                                }
                            }
                        } catch (e) {}
                    }
                    
                    return { found: false };
                }
            """)
            
            if not overlay_info.get("found"):
                return {}
            
            slog.detail(f"   🔲 Detected overlay/modal popup")
            overlay_text = overlay_info.get('text', '')[:100]
            
            # CAPTCHA DETECTION - NOT success, need to skip this page
            if overlay_info.get("hasCaptcha"):
                slog.detail_warning(f"   ⚠️ CAPTCHA detected in overlay - cannot proceed automatically")
                return {"needs_action": True, "reason": "CAPTCHA detected", "type": "captcha"}
            
            # ERROR DETECTION - NOT success
            if overlay_info.get("hasError"):
                slog.detail_warning(f"   ⚠️ Error detected in overlay: {overlay_text}")
                return {"has_error": True, "reason": f"Error in overlay: {overlay_text}"}
            
            # SUCCESS DETECTION - only if we have clear success indicators
            # Check for explicit success text (strongest indicator)
            if overlay_info.get("hasSuccessText"):
                slog.detail_success(f"   🎉 Overlay has success text: {overlay_text}...")
                return {"is_success": True, "reason": f"Success overlay: {overlay_text}"}
            
            # Recommendation overlays after form submission usually indicate success
            if overlay_info.get("hasRecommendation") and self.state.form_submitted:
                slog.detail_success(f"   🎉 Recommendation overlay detected after form submission")
                return {"is_success": True, "reason": "Post-signup recommendation overlay"}
            
            # Iframe WITHOUT success text or recommendations - could be anything (CAPTCHA, verification, etc.)
            # Don't automatically assume success - let the bot continue and check
            if overlay_info.get("hasIframe") and not overlay_info.get("hasSuccessText") and not overlay_info.get("hasRecommendation"):
                iframe_src = overlay_info.get("iframeSrc", "")
                slog.detail(f"   🔍 Overlay contains iframe but no clear success indicator")
                slog.detail(f"      Iframe src: {iframe_src[:50] if iframe_src else 'unknown'}...")
                # Don't return success - let the loop continue to analyze
            
            # Try to close the overlay if it's blocking and doesn't indicate success
            if overlay_info.get("hasCloseBtn"):
                try:
                    close_selectors = [
                        '[data-formkit-close]',
                        '.formkit-close',
                        '[aria-label*="Close"]',
                        '[aria-label*="close"]',
                        overlay_info.get("closeBtnSelector", ''),
                    ]
                    
                    for close_selector in close_selectors:
                        if not close_selector:
                            continue
                        try:
                            close_btn = await self.page.wait_for_selector(close_selector, timeout=2000)
                            if close_btn:
                                await close_btn.click(timeout=3000)
                                await asyncio.sleep(0.5)
                                slog.detail(f"   ✅ Closed overlay using: {close_selector}")
                                return {"closed": True}
                        except:
                            continue
                except Exception as e:
                    logger.debug(f"Could not close overlay: {e}")
            
            return {}
            
        except Exception as e:
            logger.debug(f"Overlay check error: {e}")
            return {}
    
    async def _handle_captcha(self) -> Dict[str, Any]:
        """
        Handle CAPTCHA solving using 2captcha service or manual attempt.
        
        Strategy:
        1. First check if captcha is actually VISIBLE (not just hidden scripts)
        2. Try 2captcha service (if API key provided)
        3. If 2captcha fails or no API key, try clicking the captcha checkbox once
        4. Track attempts to avoid wasting credits
        
        Returns:
            {"solved": True} if captcha was solved
            {"skipped": True} if captcha could not be solved
            {} if no captcha found or not visible
        """
        try:
            slog.detail("   🤖 Checking for visible CAPTCHA...")
            
            # Detect what type of captcha is present AND if it's visible
            captcha_info = await self.page.evaluate("""
                () => {
                    const result = {
                        found: false,
                        isVisible: false,
                        type: null,
                        sitekey: null,
                        iframeSelector: null
                    };
                    
                    // Helper to check if element is actually visible
                    const isElementVisible = (el) => {
                        if (!el) return false;
                        const rect = el.getBoundingClientRect();
                        const style = window.getComputedStyle(el);
                        return rect.width > 0 && rect.height > 0 && 
                               style.display !== 'none' && 
                               style.visibility !== 'hidden' &&
                               parseFloat(style.opacity) > 0;
                    };
                    
                    // Check for reCAPTCHA v2 (checkbox) - MUST be visible
                    const recaptchaFrame = document.querySelector('iframe[src*="recaptcha"][src*="anchor"]');
                    if (recaptchaFrame && isElementVisible(recaptchaFrame)) {
                        result.found = true;
                        result.isVisible = true;
                        result.type = 'recaptcha_v2';
                        result.iframeSelector = 'iframe[src*="recaptcha"][src*="anchor"]';
                        
                        // Try to find sitekey
                        const sitekeyEl = document.querySelector('[data-sitekey]');
                        if (sitekeyEl) {
                            result.sitekey = sitekeyEl.getAttribute('data-sitekey');
                        }
                    }
                    
                    // Check for visible g-recaptcha container
                    const gRecaptcha = document.querySelector('.g-recaptcha');
                    if (!result.found && gRecaptcha && isElementVisible(gRecaptcha)) {
                        const iframe = gRecaptcha.querySelector('iframe');
                        if (iframe && isElementVisible(iframe)) {
                            result.found = true;
                            result.isVisible = true;
                            result.type = 'recaptcha_v2';
                            result.iframeSelector = '.g-recaptcha iframe';
                            result.sitekey = gRecaptcha.getAttribute('data-sitekey');
                        }
                    }
                    
                    // Check for visible hCaptcha
                    const hcaptchaFrame = document.querySelector('iframe[src*="hcaptcha"]');
                    if (!result.found && hcaptchaFrame && isElementVisible(hcaptchaFrame)) {
                        result.found = true;
                        result.isVisible = true;
                        result.type = 'hcaptcha';
                        result.iframeSelector = 'iframe[src*="hcaptcha"]';
                        
                        const sitekeyEl = document.querySelector('[data-sitekey]');
                        if (sitekeyEl) {
                            result.sitekey = sitekeyEl.getAttribute('data-sitekey');
                        }
                    }
                    
                    // Check for visible Cloudflare Turnstile
                    const turnstileFrame = document.querySelector('iframe[src*="challenges.cloudflare"]');
                    if (!result.found && turnstileFrame && isElementVisible(turnstileFrame)) {
                        result.found = true;
                        result.isVisible = true;
                        result.type = 'turnstile';
                        result.iframeSelector = 'iframe[src*="challenges.cloudflare"]';
                    }
                    
                    // Check for reCAPTCHA challenge popup (image selection)
                    const challengeFrame = document.querySelector('iframe[src*="recaptcha"][src*="bframe"]');
                    if (!result.found && challengeFrame && isElementVisible(challengeFrame)) {
                        result.found = true;
                        result.isVisible = true;
                        result.type = 'recaptcha_challenge';
                    }
                    
                    return result;
                }
            """)
            
            # Only proceed if captcha is found AND visible
            if not captcha_info.get("found") or not captcha_info.get("isVisible"):
                if captcha_info.get("found") and not captcha_info.get("isVisible"):
                    slog.detail("   🔍 CAPTCHA exists but not visible yet - skipping solve attempt")
                else:
                    slog.detail("   🔍 No visible CAPTCHA detected")
                return {}
            
            captcha_type = captcha_info.get("type", "unknown")
            sitekey = captcha_info.get("sitekey")
            slog.detail(f"   🔒 CAPTCHA detected: {captcha_type}")
            
            # Strategy 1: Try 2captcha service (if API key provided and not exceeded attempts)
            if self.captcha_api_key and self.captcha_solve_attempts < self.max_captcha_attempts:
                self.captcha_solve_attempts += 1
                slog.detail(f"   🔧 Attempting 2captcha solve (attempt {self.captcha_solve_attempts}/{self.max_captcha_attempts})...")
                
                solved = await self._solve_with_2captcha(captcha_type, sitekey)
                if solved:
                    self.state.captcha_solved = True
                    slog.detail_success("   ✅ CAPTCHA solved via 2captcha!")
                    return {"solved": True}
                else:
                    slog.detail_warning("   ⚠️ 2captcha failed to solve")
            elif not self.captcha_api_key:
                slog.detail("   ⚠️ No 2captcha API key configured")
            elif self.captcha_solve_attempts >= self.max_captcha_attempts:
                slog.detail(f"   ⚠️ Max 2captcha attempts ({self.max_captcha_attempts}) reached, skipping to save credits")
            
            # Strategy 2: Try clicking the captcha checkbox (for reCAPTCHA v2)
            if captcha_type == "recaptcha_v2" and not self.state.captcha_solved:
                slog.detail("   🖱️ Trying to click reCAPTCHA checkbox...")
                try:
                    # Try to click the checkbox inside the iframe
                    iframe = await self.page.wait_for_selector('iframe[src*="recaptcha"]', timeout=5000)
                    if iframe:
                        frame = await iframe.content_frame()
                        if frame:
                            checkbox = await frame.wait_for_selector('.recaptcha-checkbox', timeout=3000)
                            if checkbox:
                                await checkbox.click()
                                await asyncio.sleep(3)  # Wait for verification
                                
                                # Check if solved (checkbox becomes checked)
                                is_checked = await frame.evaluate("""
                                    () => {
                                        const cb = document.querySelector('.recaptcha-checkbox');
                                        return cb && cb.getAttribute('aria-checked') === 'true';
                                    }
                                """)
                                
                                if is_checked:
                                    self.state.captcha_solved = True
                                    slog.detail_success("   ✅ CAPTCHA checkbox clicked successfully!")
                                    return {"solved": True}
                                else:
                                    slog.detail_warning("   ⚠️ Checkbox click did not solve CAPTCHA (might need image verification)")
                except Exception as e:
                    slog.detail(f"   ⚠️ Checkbox click failed: {str(e)[:50]}")
            
            # Could not solve captcha
            slog.detail_warning("   ❌ Could not solve CAPTCHA automatically")
            return {"skipped": True}
            
        except Exception as e:
            logger.debug(f"CAPTCHA handling error: {e}")
            return {"skipped": True}
    
    async def _solve_with_2captcha(self, captcha_type: str, sitekey: str = None) -> bool:
        """
        Use 2captcha service to solve CAPTCHA.
        
        Args:
            captcha_type: Type of captcha (recaptcha_v2, recaptcha_v3, hcaptcha, etc.)
            sitekey: The site key for the captcha
            
        Returns:
            True if solved, False otherwise
        """
        if not self.captcha_api_key:
            return False
        
        if not sitekey:
            slog.detail("   ⚠️ No sitekey found, cannot use 2captcha")
            return False
        
        try:
            page_url = self.page.url
            slog.detail(f"   📤 Sending captcha to 2captcha (type: {captcha_type})...")
            
            # Prepare request based on captcha type
            async with aiohttp.ClientSession() as session:
                # Step 1: Submit captcha for solving
                if captcha_type in ["recaptcha_v2", "recaptcha_enterprise"]:
                    submit_url = "http://2captcha.com/in.php"
                    params = {
                        "key": self.captcha_api_key,
                        "method": "userrecaptcha",
                        "googlekey": sitekey,
                        "pageurl": page_url,
                        "json": 1
                    }
                    if captcha_type == "recaptcha_enterprise":
                        params["enterprise"] = 1
                        
                elif captcha_type == "hcaptcha":
                    submit_url = "http://2captcha.com/in.php"
                    params = {
                        "key": self.captcha_api_key,
                        "method": "hcaptcha",
                        "sitekey": sitekey,
                        "pageurl": page_url,
                        "json": 1
                    }
                else:
                    slog.detail(f"   ⚠️ Unsupported captcha type for 2captcha: {captcha_type}")
                    return False
                
                # Submit captcha
                async with session.get(submit_url, params=params) as resp:
                    result = await resp.json()
                    
                if result.get("status") != 1:
                    slog.detail(f"   ⚠️ 2captcha submit failed: {result.get('error_text', 'Unknown error')}")
                    return False
                
                captcha_id = result.get("request")
                slog.detail(f"   ⏳ Captcha submitted (ID: {captcha_id}), waiting for solution...")
                
                # Step 2: Poll for result (max 120 seconds)
                result_url = "http://2captcha.com/res.php"
                result_params = {
                    "key": self.captcha_api_key,
                    "action": "get",
                    "id": captcha_id,
                    "json": 1
                }
                
                for _ in range(24):  # 24 * 5 = 120 seconds
                    await asyncio.sleep(5)
                    
                    async with session.get(result_url, params=result_params) as resp:
                        result = await resp.json()
                    
                    if result.get("status") == 1:
                        token = result.get("request")
                        slog.detail(f"   🎉 Got captcha solution!")
                        
                        # Step 3: Inject the token into the page
                        return await self._inject_captcha_token(captcha_type, token)
                    
                    elif result.get("request") == "CAPCHA_NOT_READY":
                        continue
                    else:
                        slog.detail(f"   ⚠️ 2captcha error: {result.get('error_text', result.get('request', 'Unknown'))}")
                        return False
                
                slog.detail("   ⚠️ 2captcha timeout (120s)")
                return False
                
        except Exception as e:
            slog.detail(f"   ⚠️ 2captcha error: {str(e)[:50]}")
            return False
    
    async def _inject_captcha_token(self, captcha_type: str, token: str) -> bool:
        """Inject solved captcha token into the page."""
        try:
            if captcha_type in ["recaptcha_v2", "recaptcha_v3", "recaptcha_enterprise"]:
                # Inject reCAPTCHA token
                await self.page.evaluate(f"""
                    (token) => {{
                        // Set the response in hidden textarea
                        const responseField = document.querySelector('#g-recaptcha-response, [name="g-recaptcha-response"]');
                        if (responseField) {{
                            responseField.value = token;
                            responseField.innerHTML = token;
                        }}
                        
                        // Also try to trigger the callback if it exists
                        if (typeof grecaptcha !== 'undefined' && grecaptcha.getResponse) {{
                            // For reCAPTCHA v2, try to set the response
                            try {{
                                const iframe = document.querySelector('iframe[src*="recaptcha"]');
                                if (iframe) {{
                                    iframe.style.display = 'none';
                                }}
                            }} catch(e) {{}}
                        }}
                        
                        // Look for callback functions
                        const callbacks = ['onCaptchaSuccess', 'captchaCallback', 'recaptchaCallback'];
                        for (const cb of callbacks) {{
                            if (typeof window[cb] === 'function') {{
                                window[cb](token);
                            }}
                        }}
                    }}
                """, token)
                
                slog.detail("   ✅ reCAPTCHA token injected")
                return True
                
            elif captcha_type == "hcaptcha":
                # Inject hCaptcha token
                await self.page.evaluate(f"""
                    (token) => {{
                        const responseField = document.querySelector('[name="h-captcha-response"], [name="g-recaptcha-response"]');
                        if (responseField) {{
                            responseField.value = token;
                        }}
                        
                        // Trigger hcaptcha callback
                        if (typeof hcaptcha !== 'undefined') {{
                            try {{
                                hcaptcha.setResponse(token);
                            }} catch(e) {{}}
                        }}
                    }}
                """, token)
                
                slog.detail("   ✅ hCaptcha token injected")
                return True
                
            return False
            
        except Exception as e:
            slog.detail(f"   ⚠️ Token injection failed: {str(e)[:50]}")
            return False
    
    async def _execute_action(self, action: AgentAction) -> Dict[str, Any]:
        """Execute an action on the page."""
        logger.debug(f"⚡ Executing: {action.action_type}")
        
        try:
            if action.action_type == "fill_field":
                return await self._execute_fill_field(action)
            elif action.action_type == "click":
                return await self._execute_click(action)
            elif action.action_type == "wait":
                return await self._execute_wait(action)
            elif action.action_type == "scroll":
                return await self._execute_scroll(action)
            elif action.action_type == "complete":
                return {"success": True, "message": "Complete"}
            else:
                return {"success": False, "error": f"Unknown action: {action.action_type}"}
                
        except Exception as e:
            logger.error(f"Execute error: {e}")
            return {"success": False, "error": str(e)}
    
    async def _execute_fill_field(self, action: AgentAction) -> Dict[str, Any]:
        """Fill a form field with comprehensive checkbox handling."""
        try:
            if not action.selector or not action.value:
                return {"success": False, "error": "Missing selector or value"}
            
            # Parse selector
            parsed_selector = self._parse_selector(action.selector)
            
            # Wait for element (use attached for hidden checkboxes)
            element = await self.page.wait_for_selector(parsed_selector, state='attached', timeout=5000)
            
            if not element:
                return {"success": False, "error": f"Element not found: {action.selector}"}
            
            # Track which form this field belongs to - helps find the correct submit button
            try:
                form_info = await element.evaluate(r"""
                    (el) => {
                        const form = el.closest('form');
                        if (!form) return null;
                        
                        const formIdx = Array.from(document.querySelectorAll('form')).indexOf(form);
                        let formSelector = '';
                        if (form.id) formSelector = '#' + form.id;
                        else if (form.className) {
                            const firstClass = form.className.split(' ')[0];
                            if (firstClass) formSelector = 'form.' + firstClass;
                        }
                        if (!formSelector) formSelector = 'form:nth-of-type(' + (formIdx + 1) + ')';
                        
                        // Find submit button in this form - look for actual submit buttons, not dropdowns
                        let submitSelector = '';
                        let submitBtn = null;
                        
                        // Priority 1: Look for input[type="submit"]
                        submitBtn = form.querySelector('input[type="submit"]');
                        
                        // Priority 2: Look for button with submit-related text
                        if (!submitBtn) {
                            const submitPatterns = ['submit', 'sign up', 'signup', 'register', 'subscribe', 'join', 'send', 'continue', 'next', 'get started'];
                            const buttons = form.querySelectorAll('button, [role="button"]');
                            for (const btn of buttons) {
                                const btnText = (btn.textContent || btn.value || '').toLowerCase().trim();
                                // Skip buttons that are clearly dropdowns (country code, flags, etc.)
                                // Check for country code pattern: +XX or just digits, or very short text
                                if (btnText.includes('+') || /^\+?\d{1,4}$/.test(btnText) || btnText.length < 2) {
                                    continue;
                                }
                                if (submitPatterns.some(p => btnText.includes(p))) {
                                    submitBtn = btn;
                                    break;
                                }
                            }
                        }
                        
                        // Priority 3: Look for button[type="submit"]
                        if (!submitBtn) {
                            submitBtn = form.querySelector('button[type="submit"]');
                        }
                        
                        // Priority 4: Last button in form (often the submit button)
                        if (!submitBtn) {
                            const buttons = form.querySelectorAll('button');
                            if (buttons.length > 0) {
                                // Get the last button, skip if it looks like a dropdown
                                for (let i = buttons.length - 1; i >= 0; i--) {
                                    const btnText = (buttons[i].textContent || '').toLowerCase().trim();
                                    // Skip country code dropdowns: check for +XX or just digits, or very short text
                                    if (!btnText.includes('+') && !/^\+?\d{1,4}$/.test(btnText) && btnText.length >= 2) {
                                        submitBtn = buttons[i];
                                        break;
                                    }
                                }
                            }
                        }
                        
                        if (submitBtn) {
                            const btnText = (submitBtn.textContent || submitBtn.value || '').trim();
                            if (submitBtn.id) submitSelector = '#' + submitBtn.id;
                            else if (btnText && btnText.length > 1) submitSelector = formSelector + " button:has-text('" + btnText.substring(0, 20) + "')";
                            else submitSelector = formSelector + ' button[type="submit"], ' + formSelector + ' button:last-of-type';
                        }
                        
                        return {
                            formId: form.id || 'form_' + formIdx,
                            formSelector: formSelector,
                            submitSelector: submitSelector
                        };
                    }
                """)
                
                if form_info:
                    self.state.active_form_id = form_info.get('formId', '')
                    self.state.active_form_selector = form_info.get('formSelector', '')
                    self.state.active_form_submit_selector = form_info.get('submitSelector', '')
                    slog.detail(f"   📋 Working with form: {self.state.active_form_id}")
                    if self.state.active_form_submit_selector:
                        slog.detail(f"   🎯 Form submit button: {self.state.active_form_submit_selector}")
            except Exception as e:
                logger.debug(f"Could not detect form context: {e}")
            
            tag_name = await element.evaluate("el => el.tagName")
            input_type = await element.evaluate("el => el.type || ''")
            
            # Handle SELECT dropdown
            if tag_name == "SELECT":
                is_visible = await element.is_visible()
                if not is_visible:
                    return {"success": False, "error": "Select not visible"}
                
                try:
                    await element.select_option(value=action.value)
                    return {"success": True}
                except:
                    try:
                        await element.select_option(label=action.value)
                        return {"success": True}
                    except:
                        return {"success": False, "error": "Could not select option"}
            
            # Handle CHECKBOX/RADIO
            elif input_type in ["checkbox", "radio"]:
                is_visible = await element.is_visible()
                is_checked = await element.is_checked()
                should_check = str(action.value).lower() in ["true", "yes", "1", "on"]
                
                # Hidden checkbox handling (sr-only pattern)
                if not is_visible:
                    slog.detail(f"   📦 Hidden checkbox detected...")
                    try:
                        checkbox_id = await element.get_attribute("id")
                        
                        # Strategy 1: Click parent label via JavaScript
                        try:
                            has_parent_label = await element.evaluate("el => el.closest('label') !== null")
                            if has_parent_label:
                                slog.detail(f"      → Clicking wrapping label via JS...")
                                await element.evaluate("el => el.closest('label').click()")
                                await asyncio.sleep(0.3)
                                
                                is_now_checked = await element.is_checked()
                                if is_now_checked == should_check:
                                    logger.success(f"✅ Hidden checkbox toggled via parent label")
                                    if should_check and action.selector not in self.state.checkboxes_checked:
                                        self.state.checkboxes_checked.append(action.selector)
                                    return {"success": True}
                        except Exception as e:
                            logger.debug(f"      Parent label failed: {e}")
                        
                        # Strategy 2: Click separate label[for]
                        if checkbox_id:
                            try:
                                label = await self.page.query_selector(f'label[for="{checkbox_id}"]')
                                if label:
                                    slog.detail(f"      → Clicking separate label...")
                                    await label.click()
                                    await asyncio.sleep(0.3)
                                    
                                    is_now_checked = await element.is_checked()
                                    if is_now_checked == should_check:
                                        logger.success(f"✅ Hidden checkbox toggled via label[for]")
                                        if should_check and action.selector not in self.state.checkboxes_checked:
                                            self.state.checkboxes_checked.append(action.selector)
                                        return {"success": True}
                            except Exception as e:
                                logger.debug(f"      label[for] failed: {e}")
                        
                        # Strategy 3: Force with JavaScript
                        slog.detail(f"      → Force-checking via JavaScript...")
                        await element.evaluate(f"""el => {{
                            el.checked = {str(should_check).lower()};
                            el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                            el.dispatchEvent(new Event('click', {{ bubbles: true }}));
                            const label = el.closest('label');
                            if (label) label.dispatchEvent(new Event('click', {{ bubbles: true }}));
                        }}""")
                        await asyncio.sleep(0.3)
                        
                        final_checked = await element.is_checked()
                        if final_checked == should_check:
                            logger.success(f"✅ Hidden checkbox force-checked")
                            if should_check and action.selector not in self.state.checkboxes_checked:
                                self.state.checkboxes_checked.append(action.selector)
                            return {"success": True}
                        else:
                            return {"success": True, "message": "Checkbox processed (uncertain state)"}
                            
                    except Exception as e:
                        return {"success": False, "error": f"Hidden checkbox error: {e}"}
                
                # Visible checkbox - normal handling
                if should_check and not is_checked:
                    await element.check()
                    logger.success(f"✅ Checked: {action.selector}")
                    if action.selector not in self.state.checkboxes_checked:
                        self.state.checkboxes_checked.append(action.selector)
                    return {"success": True}
                elif not should_check and is_checked:
                    await element.uncheck()
                    return {"success": True}
                else:
                    if is_checked and action.selector not in self.state.checkboxes_checked:
                        self.state.checkboxes_checked.append(action.selector)
                    return {"success": True, "message": "Already correct state"}
            
            # Handle regular INPUT
            else:
                is_visible = await element.is_visible()
                if not is_visible:
                    return {"success": False, "error": "Element not visible"}
                
                value_str = action.value
                if isinstance(value_str, dict):
                    value_str = value_str.get('full', str(value_str))
                elif not isinstance(value_str, str):
                    value_str = str(value_str)
                
                await element.click()
                await asyncio.sleep(0.3)
                await element.fill(value_str)
                await asyncio.sleep(0.5)
                
                filled_value = await element.input_value()
                
                # Verify the value was filled
                if filled_value == value_str:
                    logger.success(f"✅ Filled: {action.selector}")
                    return {"success": True}
                
                # For phone fields, be more lenient - input masking might format the value
                is_phone_field = input_type == "tel" or any(x in action.selector.lower() for x in ["phone", "tel", "mobile"])
                if is_phone_field:
                    # Extract just the digits from both values and compare
                    typed_digits = ''.join(c for c in value_str if c.isdigit())
                    filled_digits = ''.join(c for c in filled_value if c.isdigit())
                    
                    # Success if most digits match (allowing for country code being added/removed)
                    if typed_digits in filled_digits or filled_digits in typed_digits:
                        logger.success(f"✅ Filled phone (with formatting): {action.selector}")
                        logger.debug(f"   Typed: {value_str} → Field shows: {filled_value}")
                        return {"success": True}
                    
                    # Also check if the field at least has some digits
                    if len(filled_digits) >= 7:  # Most phone numbers have at least 7 digits
                        logger.success(f"✅ Filled phone (formatted): {action.selector}")
                        logger.debug(f"   Typed: {value_str} → Field shows: {filled_value}")
                        return {"success": True}
                    
                    logger.warning(f"⚠️ Phone verification: typed '{value_str}' but field shows '{filled_value}'")
                
                    return {"success": False, "error": "Value verification failed"}
            
        except Exception as e:
            error_msg = str(e)
            if "is not a valid selector" in error_msg:
                return {"success": False, "error": f"Invalid selector: {action.selector}"}
            return {"success": False, "error": error_msg}
    
    def _parse_selector(self, selector: str) -> str:
        """Parse selector and handle :contains() pseudo-class."""
        contains_pattern = r':contains\(["\']([^"\']+)["\']\)'
        match = re.search(contains_pattern, selector)
        
        if match:
            text = match.group(1)
            base_selector = re.sub(contains_pattern, '', selector)
            if base_selector and base_selector not in ['', ':']:
                return f"{base_selector} >> text={text}"
            return f"text={text}"
        
        return selector
    
    async def _execute_click(self, action: AgentAction) -> Dict[str, Any]:
        """Click an element with multiple fallback strategies."""
        try:
            if not action.selector:
                return {"success": False, "error": "Missing selector"}
            
            # Track submit attempts - but be smart about distinguishing form submits from CTA buttons
            submit_keywords = ["submit", "sign up", "signup", "register", "join", "continue", "next", 
                              "create account", "subscribe", "send"]
            
            selector_lower = action.selector.lower()
            reasoning_lower = (action.reasoning or "").lower()
            combined_text = f"{selector_lower} {reasoning_lower}"
            
            # DYNAMIC CTA DETECTION using scoring system
            # Action verbs that indicate navigation/CTA (not form submit)
            action_verbs = ["try", "get", "start", "begin", "discover", "explore", "learn", 
                           "see", "watch", "view", "find", "request", "book", "schedule", 
                           "contact", "connect", "launch", "unlock", "grab", "claim", "access"]
            
            # Urgency words that reinforce CTA nature
            urgency_words = ["now", "today", "free", "instant", "demo", "trial", "more"]
            
            # Calculate CTA score
            cta_score = 0
            for verb in action_verbs:
                if re.search(rf'\b{verb}', combined_text):
                    cta_score += 2
            for word in urgency_words:
                if word in combined_text:
                    cta_score += 1
            
            # Is it a CTA? (score >= 2 means at least one action verb matched)
            is_cta = cta_score >= 2
            is_submit_keyword = any(kw in selector_lower or kw in reasoning_lower for kw in submit_keywords)
            
            # Only mark as form submit if:
            # 1. It matches submit keywords AND
            # 2. We have filled at least one field (meaning we're actually submitting a form, not clicking a CTA)
            has_filled_fields = len(self.state.fields_filled) > 0
            is_real_submit = is_submit_keyword and has_filled_fields and not is_cta
            
            # Track ANY click after filling fields (potential submit attempt)
            # This helps when the LLM detects success after a CTA click that wasn't technically marked as "submit"
            if has_filled_fields:
                self.state.click_attempts_after_fill += 1
            
            # CRITICAL: Capture URL before clicking for page load detection
            url_before_click = self.page.url
            
            # If this looks like a submit, capture state BEFORE clicking
            if is_real_submit:
                self.state.url_before_submit = url_before_click
                try:
                    self.state.form_count_before_submit = await self.page.evaluate(
                        "() => document.querySelectorAll('form').length"
                    )
                except:
                    pass
            
            # STRATEGY 0: If we have an active form submit selector and this looks like a submit action,
            # try the active form's submit button FIRST before trying generic selectors
            if is_real_submit and self.state.active_form_submit_selector:
                try:
                    slog.detail(f"   🎯 Trying active form's submit button: {self.state.active_form_submit_selector}")
                    element = await self.page.wait_for_selector(self.state.active_form_submit_selector, timeout=3000)
                    if element and await element.is_visible():
                        await element.scroll_into_view_if_needed()
                        await element.click()
                        logger.success(f"✅ Clicked active form submit: {self.state.active_form_submit_selector[:40]}")
                        self.state.submit_attempts += 1
                        self.state.form_submitted = True
                        slog.detail(f"   📤 Submit attempt #{self.state.submit_attempts} - form marked as submitted")
                        await self._wait_for_page_load_after_click(url_before_click, is_cta=False)
                        return {"success": True}
                except Exception as e:
                    logger.debug(f"   Active form submit failed: {e}, trying other strategies...")
            
            # Strategy 1: Direct selector
            try:
                element = await self.page.wait_for_selector(action.selector, timeout=3000)
                if element and await element.is_visible():
                    await element.scroll_into_view_if_needed()
                    await element.click()
                    logger.success(f"✅ Clicked: {action.selector[:40]}")
                    if is_real_submit:
                        self.state.submit_attempts += 1
                        self.state.form_submitted = True
                        slog.detail(f"   📤 Submit attempt #{self.state.submit_attempts} - form marked as submitted")
                    elif is_cta:
                        slog.detail(f"   🔘 CTA button clicked (not a form submit)")
                    await self._wait_for_page_load_after_click(url_before_click, is_cta=is_cta)
                    return {"success": True}
            except:
                pass
            
            # Strategy 2: Parsed selector
            parsed = self._parse_selector(action.selector)
            try:
                element = await self.page.wait_for_selector(parsed, timeout=3000)
                if element and await element.is_visible():
                    await element.scroll_into_view_if_needed()
                    await element.click()
                    logger.success(f"✅ Clicked (parsed): {parsed[:40]}")
                    if is_real_submit:
                        self.state.submit_attempts += 1
                        self.state.form_submitted = True
                        slog.detail(f"   📤 Submit attempt #{self.state.submit_attempts} - form marked as submitted")
                    await self._wait_for_page_load_after_click(url_before_click, is_cta=is_cta)
                    return {"success": True}
            except:
                pass
            
            # Strategy 3: Text-based search
            text_match = re.search(r'["\']([^"\']+)["\']', action.selector)
            if text_match:
                search_text = text_match.group(1)
                for tag in ["button", "a", "div", "span"]:
                    try:
                        element = await self.page.locator(f"{tag}:has-text('{search_text}')").first.element_handle(timeout=2000)
                        if element:
                            await element.scroll_into_view_if_needed()
                            await element.click()
                            logger.success(f"✅ Clicked {tag} with text: {search_text}")
                            if is_real_submit:
                                self.state.submit_attempts += 1
                                self.state.form_submitted = True
                                slog.detail(f"   📤 Submit attempt #{self.state.submit_attempts} - form marked as submitted")
                            await self._wait_for_page_load_after_click(url_before_click, is_cta=is_cta)
                            return {"success": True}
                    except:
                        continue
            
            # Strategy 4: Simplified class selector
            if "." in action.selector:
                parts = action.selector.split(".")
                if len(parts) >= 2:
                    tag = parts[0] if parts[0] else "div"
                    simplified = f"{tag}.{'.'.join(parts[1:3])}"
                    try:
                        elements = await self.page.query_selector_all(simplified)
                        for elem in elements:
                            if await elem.is_visible():
                                await elem.scroll_into_view_if_needed()
                                await elem.click()
                                logger.success(f"✅ Clicked (simplified): {simplified}")
                                if is_real_submit:
                                    self.state.submit_attempts += 1
                                    self.state.form_submitted = True
                                    slog.detail(f"   📤 Submit attempt #{self.state.submit_attempts} - form marked as submitted")
                                await self._wait_for_page_load_after_click(url_before_click, is_cta=is_cta)
                                return {"success": True}
                    except:
                        pass
            
            # If all strategies failed, check if this is due to overlay blocking
            # This is common after form submission when a success popup appears
            if self.state.form_submitted and self.state.submit_attempts > 0:
                # Check if an overlay is blocking the click
                overlay_result = await self._check_and_handle_overlay()
                if overlay_result.get("is_success"):
                    slog.detail_success(f"   🎉 Click blocked by success overlay - marking as complete!")
                    # Return a special indicator that the overlay indicates success
                    return {"success": True, "overlay_success": True, "reason": overlay_result.get("reason")}
                elif overlay_result.get("closed"):
                    slog.detail("   🔲 Closed blocking overlay - retrying click...")
                    # Retry the click after closing overlay
                    try:
                        element = await self.page.wait_for_selector(action.selector, timeout=3000)
                        if element and await element.is_visible():
                            await element.scroll_into_view_if_needed()
                            await element.click()
                            logger.success(f"✅ Clicked after closing overlay: {action.selector[:40]}")
                            return {"success": True}
                    except:
                        pass
            
            # If all strategies failed, track as potential hallucination
            self.state.hallucination_count += 1
            logger.warning(f"   🤔 Element not found (hallucination #{self.state.hallucination_count}?)")
            
            # Check if selector looks like a close/dismiss button (common hallucination)
            is_close_button = any(x in action.selector.lower() for x in ["×", "close", "dismiss", "x-button", "modal"])
            if is_close_button:
                slog.detail("   💡 Ignoring close button attempt - likely hallucination")
                # Return success to avoid counting this as a real failure
                return {"success": True, "note": "Skipped hallucinated close button"}
            
            return {"success": False, "error": f"Could not click: {action.selector[:50]}"}
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def _execute_wait(self, action: AgentAction) -> Dict[str, Any]:
        """Wait for a duration."""
        try:
            wait_time = float(action.value) if action.value else 2.0
            await asyncio.sleep(wait_time)
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    async def _wait_for_page_load_after_click(self, url_before: str, is_cta: bool = False) -> None:
        """
        Wait for page to fully load after a click that might cause navigation.
        This is critical for CTA buttons that open new pages or modals.
        
        Args:
            url_before: The URL before the click
            is_cta: Whether this was a CTA button click (requires longer wait)
        """
        try:
            # First, give the click a moment to trigger any navigation
            await asyncio.sleep(0.5)
            
            # Check if URL changed (indicates navigation)
            url_after = self.page.url
            url_changed = url_before != url_after
            
            if url_changed:
                slog.detail(f"   🔄 Page navigation detected: {url_before[:30]}... → {url_after[:30]}...")
                # Wait for the new page to fully load
                try:
                    await self.page.wait_for_load_state("domcontentloaded", timeout=10000)
                    slog.detail("   ✅ DOM content loaded")
                except:
                    pass
                
                try:
                    await self.page.wait_for_load_state("networkidle", timeout=10000)
                    slog.detail("   ✅ Network idle - page fully loaded")
                except:
                    # Network idle can timeout on some pages (streaming, chat widgets, etc.)
                    slog.detail("   ⏳ Network still active after 10s...")
                    
                    # If this was a navigation, we should be careful about proceeding too fast
                    slog.detail("   ✋ Waiting extra 4s to ensure page stability...")
                    await asyncio.sleep(4.0)
                
                # Verify page content exists
                try:
                    content_len = await self.page.evaluate("document.body.innerText.length")
                    if content_len < 200:
                        slog.detail_warning(f"   ⚠️ Page seems empty (loading? len={content_len}). Waiting more...")
                        await asyncio.sleep(3.0)
                        
                        # Check again
                        content_len = await self.page.evaluate("document.body.innerText.length")
                        if content_len < 200:
                             slog.detail_warning("   ⚠️ Page still seems empty, but proceeding...")
                except Exception as e:
                     logger.debug(f"Content check failed: {e}")

                # Additional wait for any JavaScript to initialize
                await asyncio.sleep(2.0)
            
            elif is_cta:
                # CTA was clicked but URL didn't change - might be loading a modal/popup
                slog.detail("   🔄 CTA clicked, waiting for modal/popup or DOM changes...")
                
                # Wait for potential modal/popup to appear
                await asyncio.sleep(1.0)
                
                # Try to detect DOM changes (new elements appearing)
                # Try to detect DOM changes (new elements appearing)
                try:
                    # Wait for any network activity to settle
                    await self.page.wait_for_load_state("networkidle", timeout=5000)
                except:
                    slog.detail("   ⏳ Network still active after 5s (CTA click)...")
                    slog.detail("   ✋ Waiting extra 3s for modal/transition...")
                    await asyncio.sleep(3.0)
                
                # Additional wait for animations/transitions
                await asyncio.sleep(1.5)
            
            else:
                # Regular click (like form submit) - standard wait
                await asyncio.sleep(1.5)
                
        except Exception as e:
            logger.debug(f"Wait for page load error (non-critical): {e}")
            # Even if waiting fails, continue - the page might still be usable
            await asyncio.sleep(2.0)
    
    async def _execute_scroll(self, action: AgentAction) -> Dict[str, Any]:
        """Scroll the page to reveal more content."""
        try:
            # Get current scroll position
            current_scroll = await self.page.evaluate("window.pageYOffset || document.documentElement.scrollTop")
            
            # Get page height
            page_height = await self.page.evaluate("document.documentElement.scrollHeight")
            viewport_height = await self.page.evaluate("window.innerHeight")
            
            # Calculate scroll amount (scroll down by viewport height, or to bottom if near end)
            if current_scroll + viewport_height >= page_height - 100:
                # Near bottom, scroll to bottom
                await self.page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
            else:
                # Scroll down by viewport height
                await self.page.evaluate(f"window.scrollBy(0, {viewport_height})")
            
            # Wait a bit for content to load after scrolling
            await asyncio.sleep(0.5)
            
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
