"""
LLM-powered page analyzer for dynamic form detection.
Based on working implementation from Reverse-Outreach-AutomationBot.
"""

import asyncio
import json
from typing import Dict, List, Optional, Any
from playwright.async_api import Page
from loguru import logger


class LLMPageAnalyzer:
    """
    Analyze web pages using LLM to determine form filling strategy.
    """

    # Pricing per 1M tokens (as of Jan 2025)
    MODEL_PRICING = {
        "gpt-4o": {"input": 2.50, "output": 10.00},
        "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    }

    # Class-level cost tracking (shared across instances in a session)
    _session_costs = {}  # {model: {"input_tokens": 0, "output_tokens": 0, "cost": 0.0}}
    _total_calls = 0

    @classmethod
    def reset_cost_tracking(cls):
        """Reset cost tracking for a new session."""
        cls._session_costs = {}
        cls._total_calls = 0

    @classmethod
    def get_cost_summary(cls) -> Dict[str, Any]:
        """Get cumulative cost summary by model."""
        total_cost = sum(m.get("cost", 0) for m in cls._session_costs.values())
        return {
            "by_model": cls._session_costs.copy(),
            "total_cost": total_cost,
            "total_calls": cls._total_calls
        }

    def __init__(self, page: Page, credentials: Dict[str, str],
                 llm_provider: str = "openai", llm_config: Optional[Dict[str, Any]] = None):
        self.page = page
        self.credentials = credentials
        self.llm_provider = llm_provider
        self.llm_config = llm_config or {}

    def _track_cost(self, model: str, prompt_tokens: int, completion_tokens: int):
        """Track API cost for this call."""
        # Get pricing for model (default to gpt-4o-mini if unknown)
        pricing = self.MODEL_PRICING.get(model, self.MODEL_PRICING["gpt-4o-mini"])

        # Calculate cost (pricing is per 1M tokens)
        input_cost = (prompt_tokens / 1_000_000) * pricing["input"]
        output_cost = (completion_tokens / 1_000_000) * pricing["output"]
        call_cost = input_cost + output_cost

        # Update session totals
        if model not in self._session_costs:
            self._session_costs[model] = {"input_tokens": 0, "output_tokens": 0, "cost": 0.0, "calls": 0}

        self._session_costs[model]["input_tokens"] += prompt_tokens
        self._session_costs[model]["output_tokens"] += completion_tokens
        self._session_costs[model]["cost"] += call_cost
        self._session_costs[model]["calls"] += 1
        self.__class__._total_calls += 1

        # Get cumulative total
        total_cost = sum(m.get("cost", 0) for m in self._session_costs.values())

        # Log the cost (always visible)
        logger.info(f"💰 ${call_cost:.4f} ({prompt_tokens}+{completion_tokens} tok) | Total: ${total_cost:.4f}")
    
    async def _extract_page_info(self) -> Dict[str, Any]:
        """Extract relevant information from the page, including HTML and visibility status."""
        try:
            page_structure = await self.page.evaluate(r"""
                () => {
                    const isVisible = (elem) => {
                        if (!elem) return false;
                        const style = window.getComputedStyle(elem);
                        return style.display !== 'none' &&
                               style.visibility !== 'hidden' &&
                               style.opacity !== '0' &&
                               elem.offsetParent !== null;
                    };

                    // Safely get className as string (handles SVG elements, etc.)
                    const getClassName = (elem) => {
                        if (!elem) return '';
                        const cn = elem.className;
                        if (typeof cn === 'string') return cn;
                        if (cn && cn.baseVal !== undefined) return cn.baseVal; // SVGAnimatedString
                        if (cn && typeof cn.toString === 'function') return cn.toString();
                        return '';
                    };

                    const result = {
                        title: document.title,
                        url: window.location.href,
                        forms: [],
                        buttons: [],
                        inputs: [],
                        visibleText: document.body.innerText.substring(0, 1500),
                        simplifiedHtml: ''
                    };
                    
                    // Extract simplified HTML (forms, inputs, buttons only)
                    const cleanHtml = document.createElement('div');
                    
                    document.querySelectorAll('form').forEach((form, idx) => {
                        if (isVisible(form)) {
                            const formClone = form.cloneNode(true);
                            // Remove script/style/noscript
                            formClone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
                            // Remove hidden containers (honeypots, spam traps)
                            formClone.querySelectorAll('[style*="display: none"], [style*="display:none"], [hidden], .hidden, .d-none, .sr-only, .visually-hidden').forEach(el => el.remove());
                            // Remove inputs inside hidden containers that we might have missed
                            formClone.querySelectorAll('*').forEach(el => {
                                const style = el.getAttribute('style') || '';
                                if (style.includes('display') && style.includes('none')) {
                                    el.remove();
                                }
                            });
                            cleanHtml.appendChild(formClone);
                        }
                    });
                    
                    if (cleanHtml.children.length === 0) {
                        const container = document.createElement('div');
                        container.id = 'extracted-elements';
                        
                        document.querySelectorAll('input:not([type="hidden"]), textarea, button').forEach(elem => {
                            if (isVisible(elem)) {
                                container.appendChild(elem.cloneNode(true));
                            }
                        });
                        
                        cleanHtml.appendChild(container);
                    }
                    
                    result.simplifiedHtml = cleanHtml.innerHTML.substring(0, 5000);
                    
                    // Find all forms WITH their submit buttons
                    document.querySelectorAll('form').forEach((form, idx) => {
                        const formId = form.id || `form_${idx}`;
                        
                        // Build form selector
                        let formSelector = '';
                        if (form.id) formSelector = `#${form.id}`;
                        else if (getClassName(form)) {
                            const firstClass = getClassName(form).split(' ')[0];
                            if (firstClass) formSelector = `form.${firstClass}`;
                        }
                        if (!formSelector) formSelector = `form:nth-of-type(${idx + 1})`;
                        
                        const formInfo = {
                            id: formId,
                            selector: formSelector,
                            action: form.action,
                            method: form.method,
                            inputs: [],
                            submitButtons: [],  // NEW: Track submit buttons for this form
                            visible: isVisible(form)
                        };
                        
                        // Find inputs in this form
                        form.querySelectorAll('input, textarea, select').forEach(input => {
                            if (input.type !== 'hidden') {
                                let inputSelector = '';
                                if (input.id) inputSelector = `#${input.id}`;
                                else if (input.name) inputSelector = `${formSelector} [name='${input.name}']`;
                                else inputSelector = `${formSelector} input[type='${input.type || 'text'}']`;
                                
                                formInfo.inputs.push({
                                    type: input.type || 'text',
                                    name: input.name,
                                    id: input.id,
                                    selector: inputSelector,
                                    placeholder: input.placeholder || '',
                                    required: input.required,
                                    visible: isVisible(input),
                                    formId: formId  // Track which form this input belongs to
                                });
                            }
                        });
                        
                        // Find submit buttons WITHIN this specific form - filter out dropdowns
                        const submitPatterns = ['submit', 'sign up', 'signup', 'register', 'subscribe', 'join', 'send', 'continue', 'next', 'get started'];
                        form.querySelectorAll('button, input[type="submit"], [role="button"]').forEach(btn => {
                            const text = (btn.textContent || btn.value || '').trim();
                            const textLower = text.toLowerCase();
                            
                            // Skip buttons that are clearly dropdowns (country code, flags, etc.)
                            // Check for country code pattern: +XX or just digits, or very short text
                            const isCountryCode = text.includes('+') || 
                                                  /^\+?\d{1,4}$/.test(text) || 
                                                  text.length < 2;
                            if (isCountryCode) {
                                return; // Skip this button
                            }
                            
                            // Prioritize buttons with submit-related text
                            const isLikelySubmit = submitPatterns.some(p => textLower.includes(p)) || 
                                                   btn.type === 'submit';
                            
                            let btnSelector = '';
                            if (btn.id) btnSelector = `#${btn.id}`;
                            else if (text) btnSelector = `${formSelector} button:has-text('${text.substring(0, 20)}')`;
                            else btnSelector = `${formSelector} button`;
                            
                            formInfo.submitButtons.push({
                                text: text.substring(0, 50),
                                type: btn.type || 'button',
                                selector: btnSelector,
                                visible: isVisible(btn),
                                isLikelySubmit: isLikelySubmit
                            });
                        });
                        
                        // If no button found in form, check for submit input
                        if (formInfo.submitButtons.length === 0) {
                            const submitInput = form.querySelector('input[type="submit"]');
                            if (submitInput) {
                                formInfo.submitButtons.push({
                                    text: submitInput.value || 'Submit',
                                    type: 'submit',
                                    selector: `${formSelector} input[type="submit"]`,
                                    visible: isVisible(submitInput)
                                });
                            }
                        }
                        
                        result.forms.push(formInfo);
                    });
                    
                    // Find all inputs (even outside forms) - include form context
                    document.querySelectorAll('input:not([type="hidden"]), textarea, select').forEach(input => {
                        const parentLabel = input.closest('label');
                        const parentForm = input.closest('form');
                        const isVisibleInput = isVisible(input) || (parentLabel && isVisible(parentLabel));
                        
                        if (isVisibleInput) {
                            const isSelect = input.tagName === 'SELECT';
                            const inputType = input.type || 'text';
                            
                            // Determine which form this input belongs to
                            let formId = null;
                            let formSelector = null;
                            let formSubmitSelector = null;
                            
                            if (parentForm) {
                                const formIdx = Array.from(document.querySelectorAll('form')).indexOf(parentForm);
                                formId = parentForm.id || `form_${formIdx}`;
                                
                                // Build form selector
                                if (parentForm.id) formSelector = `#${parentForm.id}`;
                                else if (getClassName(parentForm)) {
                                    const firstClass = getClassName(parentForm).split(' ')[0];
                                    if (firstClass) formSelector = `form.${firstClass}`;
                                }
                                if (!formSelector) formSelector = `form:nth-of-type(${formIdx + 1})`;
                                
                                // Find the submit button for THIS form - skip dropdown buttons
                                let formSubmitBtn = parentForm.querySelector('input[type="submit"]');
                                if (!formSubmitBtn) {
                                    const submitPatterns = ['submit', 'sign up', 'signup', 'register', 'subscribe', 'join', 'send'];
                                    const buttons = parentForm.querySelectorAll('button, [role="button"]');
                                    for (const btn of buttons) {
                                        const btnText = (btn.textContent || '').toLowerCase().trim();
                                        // Skip dropdown buttons (country code, flags)
                                        // Check for country code pattern: +XX or just digits, or very short text
                                        if (btnText.includes('+') || /^\+?\d{1,4}$/.test(btnText) || btnText.length < 2) continue;
                                        if (submitPatterns.some(p => btnText.includes(p))) {
                                            formSubmitBtn = btn;
                                            break;
                                        }
                                    }
                                }
                                if (formSubmitBtn) {
                                    const btnText = (formSubmitBtn.textContent || formSubmitBtn.value || '').trim();
                                    if (formSubmitBtn.id) formSubmitSelector = `#${formSubmitBtn.id}`;
                                    else if (btnText && btnText.length > 1) formSubmitSelector = `${formSelector} button:has-text('${btnText.substring(0, 20)}')`;
                                    else formSubmitSelector = `${formSelector} button[type="submit"]`;
                                }
                            }
                            
                            let labelText = '';
                            let isHiddenInput = false;
                            let hasWrappingLabel = false;
                            
                            if (inputType === 'radio' || inputType === 'checkbox') {
                                isHiddenInput = getClassName(input).includes('sr-only') ||
                                              getClassName(input).includes('visually-hidden') ||
                                              !isVisible(input);
                                
                                if (parentLabel) {
                                    hasWrappingLabel = true;
                                    labelText = parentLabel.textContent?.trim() || '';
                                } else {
                                    const label = input.id ? document.querySelector(`label[for="${input.id}"]`) : null;
                                    labelText = label ? label.textContent?.trim() : '';
                                }
                            }
                            
                            result.inputs.push({
                                type: isSelect ? 'select' : inputType,
                                name: input.name,
                                id: input.id,
                                placeholder: input.placeholder || '',
                                className: getClassName(input),
                                ariaLabel: input.getAttribute('aria-label') || '',
                                label: labelText,
                                value: input.value || '',
                                checked: input.checked || false,
                                visible: true,
                                hidden_input: isHiddenInput,
                                wrapped_in_label: hasWrappingLabel,
                                options: isSelect ? Array.from(input.options).map(opt => opt.value || opt.text) : [],
                                // NEW: Form context - helps LLM know which submit button to use
                                formId: formId,
                                formSelector: formSelector,
                                formSubmitSelector: formSubmitSelector
                            });
                        }
                    });
                    
                    // Find div/span-based checkboxes (clickable divs that act as checkboxes)
                    const divCheckboxSelectors = [
                        'div[role="checkbox"]',
                        'div[role="option"]',
                        'div[class*="option"]',
                        'div[class*="choice"]',
                        'label[class*="option"]',
                        'label[class*="choice"]'
                    ].join(',');
                    
                    document.querySelectorAll(divCheckboxSelectors).forEach(opt => {
                        if (isVisible(opt)) {
                            result.inputs.push({
                                type: 'div-checkbox',
                                name: opt.getAttribute('name') || '',
                                id: opt.id,
                                placeholder: '',
                                className: getClassName(opt),
                                ariaLabel: opt.getAttribute('aria-label') || '',
                                label: opt.textContent?.trim() || '',
                                value: opt.getAttribute('value') || '',
                                checked: opt.getAttribute('aria-checked') === 'true' || opt.classList.contains('checked') || opt.classList.contains('selected'),
                                visible: true,
                                options: []
                            });
                        }
                    });
                    
                    // Find all clickable elements including CTA buttons/links
                    const clickableSelectors = [
                        'button',
                        'input[type="submit"]',
                        'input[type="button"]',
                        'a[role="button"]',
                        'a[href="#"]',
                        'div[role="button"]',
                        'div.btn',
                        'div[class*="btn"]',
                        'div[class*="submit"]',
                        // CTA link patterns - common navigation buttons
                        'a[class*="btn"]',
                        'a[class*="button"]',
                        'a[class*="cta"]',
                        'a[class*="action"]',
                        // Span/div based buttons
                        'span[class*="btn"]',
                        'span[role="button"]'
                    ].join(',');
                    
                    // DYNAMIC CTA DETECTION using scoring system
                    // Instead of exact pattern matching, use semantic word groups
                    const isCTAButton = (text, className = '') => {
                        const textLower = text.toLowerCase();
                        const classLower = (className || '').toLowerCase();
                        let score = 0;
                        
                        // ACTION VERBS - words that indicate taking an action (score: +2 each)
                        const actionVerbs = [
                            'try', 'get', 'start', 'begin', 'join', 'sign', 'register', 
                            'subscribe', 'download', 'claim', 'access', 'unlock', 'discover',
                            'explore', 'learn', 'see', 'watch', 'view', 'find', 'request',
                            'book', 'schedule', 'contact', 'connect', 'create', 'build',
                            'launch', 'activate', 'enable', 'grab', 'secure', 'reserve',
                            'order', 'buy', 'shop', 'add', 'apply', 'submit', 'send'
                        ];
                        
                        // URGENCY/CTA WORDS - words that create urgency (score: +1 each)
                        const urgencyWords = [
                            'now', 'today', 'free', 'instant', 'immediate', 'quick',
                            'fast', 'easy', 'simple', 'limited', 'exclusive', 'special',
                            'bonus', 'offer', 'deal', 'save', 'discount', 'new'
                        ];
                        
                        // TARGET WORDS - what user is getting (score: +1 each)
                        const targetWords = [
                            'demo', 'trial', 'quote', 'consultation', 'guide', 'ebook',
                            'report', 'newsletter', 'updates', 'access', 'account',
                            'membership', 'started', 'more', 'info', 'details'
                        ];
                        
                        // NEGATIVE WORDS - words that indicate NOT a signup CTA (score: -3 each)
                        const negativeWords = [
                            'login', 'log in', 'signin', 'sign in', 'cart', 'checkout',
                            'forgot', 'password', 'reset', 'logout', 'log out'
                        ];
                        
                        // Check action verbs (most important)
                        actionVerbs.forEach(verb => {
                            // Match word boundaries - "try" matches "try", "trying", but not "country"
                            const regex = new RegExp('\\b' + verb, 'i');
                            if (regex.test(textLower)) score += 2;
                        });
                        
                        // Check urgency words
                        urgencyWords.forEach(word => {
                            if (textLower.includes(word)) score += 1;
                        });
                        
                        // Check target words
                        targetWords.forEach(word => {
                            if (textLower.includes(word)) score += 1;
                        });
                        
                        // Check negative words
                        negativeWords.forEach(word => {
                            if (textLower.includes(word)) score -= 3;
                        });
                        
                        // Bonus for CTA-related class names
                        if (classLower.includes('cta') || classLower.includes('action') || 
                            classLower.includes('primary') || classLower.includes('hero')) {
                            score += 2;
                        }
                        
                        // Text length check - CTAs are usually short (2-6 words)
                        const wordCount = textLower.split(/\s+/).length;
                        if (wordCount >= 1 && wordCount <= 6) score += 1;
                        if (wordCount > 10) score -= 1;
                        
                        // Return true if score >= 2 (at least one action verb match)
                        return score >= 2;
                    };
                    
                    document.querySelectorAll(clickableSelectors).forEach(btn => {
                        const isVisibleOrSubmit = isVisible(btn) || (btn.tagName === 'INPUT' && btn.type === 'submit');
                        if (isVisibleOrSubmit) {
                            const btnText = btn.textContent?.trim() || btn.value || btn.innerText?.trim() || '';
                            const isCTA = isCTAButton(btnText, getClassName(btn));
                            result.buttons.push({
                                text: btnText,
                                type: btn.type || btn.tagName.toLowerCase(),
                                id: btn.id,
                                name: btn.name || '',
                                className: getClassName(btn),
                                visible: isVisible(btn),
                                isCTA: isCTA
                            });
                        }
                    });
                    
                    // Also find prominent links that might be CTA buttons
                    document.querySelectorAll('a').forEach(link => {
                        if (isVisible(link)) {
                            const linkText = link.textContent?.trim() || '';
                            const isCTA = isCTAButton(linkText, getClassName(link));
                            // Only include if it looks like a CTA (not just regular navigation)
                            if (isCTA && linkText.length > 2 && linkText.length < 50) {
                                // Check if not already added as a button
                                const alreadyAdded = result.buttons.some(b => b.text === linkText);
                                if (!alreadyAdded) {
                                    result.buttons.push({
                                        text: linkText,
                                        type: 'link',
                                        id: link.id,
                                        name: '',
                                        className: getClassName(link),
                                        visible: true,
                                        isCTA: true,
                                        href: link.href
                                    });
                                }
                            }
                        }
                    });
                    
                    return result;
                }
            """)
            
            logger.debug(f"Found {len(page_structure.get('forms', []))} forms, "
                        f"{len(page_structure.get('inputs', []))} inputs, "
                        f"{len(page_structure.get('buttons', []))} buttons")
            
            return page_structure
            
        except Exception as e:
            # Navigation errors are expected after successful form submissions
            error_str = str(e)
            if "context was destroyed" in error_str or "navigation" in error_str.lower():
                logger.debug(f"Page navigated during extraction (expected after submit): {e}")
            else:
                logger.error(f"Error extracting page info: {e}")
            return {"forms": [], "inputs": [], "buttons": [], "simplifiedHtml": ""}
    
    async def _call_llm_for_next_action(self, context: Dict[str, Any], 
                                        conversation_history: List[Dict[str, str]],
                                        screenshot_base64: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Call LLM to determine next action."""
        if screenshot_base64:
            logger.info("🤖 Calling LLM with vision...")
        else:
            logger.info("🤖 Calling LLM (text only)...")
        
        try:
            prompt = self._build_prompt(context)
            
            if self.llm_provider == "openai":
                response = await self._call_openai(prompt, conversation_history, screenshot_base64)
            else:
                response = self._fallback_action(context)
            
            return response
            
        except Exception as e:
            logger.error(f"LLM error: {e}")
            raise
    
    def _build_prompt(self, context: Dict[str, Any]) -> str:
        """Build comprehensive prompt for LLM based on MVP."""
        credentials = context.get("credentials", {})
        current_step = context.get("current_step", 1)
        fields_filled = context.get("fields_filled", [])
        action_history = context.get("action_history", [])
        has_success = context.get("has_success_indicator", False)
        detected_country = context.get("detected_country_code")
        
        # Get local page analysis - this is GROUND TRUTH
        local_analysis = context.get("local_page_analysis", {})
        
        # Format phone number
        phone = credentials.get('phone', {})
        if isinstance(phone, dict):
            phone_display = f"{phone.get('full', '+1234567890')} (Country: {phone.get('country_code', '+1')}, Number: {phone.get('number', '234567890')})"
        else:
            phone_display = str(phone)
        
        # Detected country code section
        detected_country_section = ""
        if detected_country:
            detected_country_section = f"""
🌍 DETECTED COUNTRY CODE ON PAGE: +{detected_country}
⚠️ IMPORTANT: The phone field has country code +{detected_country} pre-selected!
→ DO NOT try to change the country code dropdown!
→ Use field_type="phone" with use_phone_number_only=true
→ System will auto-generate a valid phone for +{detected_country}
"""
        
        # Local page analysis section - CRITICAL for preventing false dismissals
        local_analysis_section = ""
        if local_analysis:
            has_signup = local_analysis.get("has_signup_form", False)
            reason = local_analysis.get("reason", "")
            if has_signup:
                local_analysis_section = f"""
🔴🔴🔴 CRITICAL - PRE-ANALYSIS RESULT 🔴🔴🔴
The page was THOROUGHLY analyzed by the system (scrolled, checked all sections).
RESULT: ✅ SIGNUP FORM FOUND - "{reason}"

⚠️ DO NOT say "Login page detected" or "No signup form" - the system already confirmed a signup form exists!
⚠️ Your job is to FIND and FILL the signup form, not to re-judge the page type.
⚠️ Look for email inputs, newsletter signups, subscription forms - they may be in the footer or other sections.
⚠️ If you can't find the form immediately, SCROLL DOWN or look in different page sections.
🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴
"""
        
        # Active form context - CRITICAL for clicking the correct submit button
        active_form = context.get("active_form")
        active_form_section = ""
        if active_form and active_form.get("form_id"):
            submit_selector = active_form.get("submit_selector", "")
            active_form_section = f"""
🎯🎯🎯 ACTIVE FORM CONTEXT 🎯🎯🎯
You are currently working with form: {active_form.get('form_id')}
Form selector: {active_form.get('form_selector')}

📌 SUBMIT BUTTON FOR THIS FORM: {submit_selector}
⚠️ IMPORTANT: Use THIS exact selector to submit the form you just filled!
⚠️ DO NOT click generic "Submit" buttons elsewhere - they belong to different forms!
⚠️ This page has MULTIPLE forms - make sure you click the right submit button!
🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯
"""
        
        # Format inputs with detailed info
        visible_inputs = context.get("visible_inputs", [])
        inputs_text = self._format_inputs_for_llm(visible_inputs)
        buttons_text = self._format_buttons_for_llm(context.get("visible_buttons", []))
        
        # Count checkboxes
        checkbox_count = sum(1 for inp in visible_inputs if inp.get('type') in ['checkbox', 'radio', 'div-checkbox'])
        checkbox_alert = f"\n🚨 ALERT: {checkbox_count} CHECKBOX/SELECTION FIELDS DETECTED!\n" if checkbox_count > 0 else ""
        
        # Error messages
        error_messages = context.get("error_messages", [])
        has_errors = context.get("has_error_messages", False)
        error_text = "\n".join([f"- {err.get('text', '')}" for err in error_messages[:3]]) if has_errors else "None"
        
        # Failed selector warnings
        failed_warnings = context.get('failed_selector_hints', [])
        failed_warning_section = ""
        if failed_warnings:
            failed_warning_section = f"""
🚨 PREVIOUS FAILURES - DO NOT REPEAT:
{chr(10).join(failed_warnings)}
TRY A DIFFERENT APPROACH!
============================================================

"""

        # NON-EXISTENT SELECTORS BLOCKLIST - These elements DO NOT exist on the page
        non_existent = context.get('non_existent_selectors', [])
        blocklist_section = ""
        if non_existent:
            blocklist_section = f"""
🛑🛑🛑 BLOCKLIST - THESE SELECTORS DO NOT EXIST ON THIS PAGE 🛑🛑🛑
{chr(10).join([f"  ❌ {sel}" for sel in non_existent[:10]])}

⛔ DO NOT suggest ANY of the above selectors - they have been VERIFIED to not exist!
⛔ If you need to fill a field type (e.g., first_name), find a DIFFERENT selector from VISIBLE INPUTS below.
⛔ Only use selectors that appear in the VISIBLE INPUTS list!
🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑🛑

"""
        
        # Action history
        history_text = ""
        if action_history:
            last = action_history[-1]
            history_text = f"{'✅ SUCCESS' if last.get('success') else '❌ FAILED'}: {last.get('type')} on {last.get('selector', 'N/A')[:40]}"
            if not last.get('success') and last.get('error'):
                history_text += f"\n   Error: {last.get('error')[:100]}"
        
        return f"""{blocklist_section}{failed_warning_section}{local_analysis_section}{active_form_section}You are an AI agent signing up for an email list. Your goal is to SIGN UP (create new account), NOT login.

🚨 SIGNUP FORMS TO LOOK FOR 🚨
- Newsletter signup forms (often in footer or sidebar)
- Email subscription forms ("Sign up to receive", "Subscribe", "Get updates")
- Registration forms with email + name/phone fields
- Any form with an email input and a submit button

✅ VALID SIGNUP TARGETS:
- Newsletter signups ("Sign up for our newsletter", "Subscribe to updates")
- Email list forms (just email + submit button is valid!)
- Registration forms with name/email/phone
- Free trial signups

🚫 AVOID (only if NO signup form exists):
- Pure login pages with "Forgot Password" and "Remember Me"
- Pages with ONLY email + password (no name/phone/newsletter text)

CREDENTIALS:
- First Name: {credentials.get('first_name', 'Test')}
- Last Name: {credentials.get('last_name', 'User')}
- Full Name: {credentials.get('full_name', credentials.get('first_name', 'Test User'))}
- Email: {credentials.get('email', 'test@example.com')}
- Phone: {phone_display}
{detected_country_section}
CURRENT STATE:
- Step: {current_step}/30
- Page URL: {context.get('page_url', 'Unknown')}
- Checkboxes checked: {len(context.get('checkboxes_checked', []))} {'⚠️ DO NOT CHECK MORE!' if context.get('checkboxes_checked') else ''}
- Success indicator: {has_success}
- Validation errors: {has_errors}

🟢🟢🟢 FIELDS ALREADY FILLED (DO NOT REFILL!) 🟢🟢🟢
Field types filled: {', '.join(context.get('field_types_filled', [])) if context.get('field_types_filled') else 'None yet'}
Selectors filled: {', '.join(fields_filled) if fields_filled else 'None yet'}

⛔ CRITICAL: DO NOT fill any field that is already in the list above!
⛔ If email/name/phone are already filled, go STRAIGHT to clicking Submit!
⛔ Refilling fields wastes tokens and causes loops!
🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢

LAST ACTION: {history_text or 'None'}

⚠️ ERROR MESSAGES ON PAGE:
{error_text}
{checkbox_alert}
VISIBLE INPUTS:
{inputs_text}

VISIBLE BUTTONS:
{buttons_text}

PAGE TEXT EXCERPT:
{context.get('page_text_sample', '')[:400]}

ACTION TYPES:
1. "fill_field" - Fill a form field (text, email, phone, checkbox, etc.)
2. "click" - Click a button/link (including scroll buttons to see more content)
3. "scroll" - Scroll down the page to reveal more content (useful for finding forms below the fold)
4. "wait" - Wait for page to load
5. "complete" - ONLY after seeing actual success message ("Thank you", "Subscribed", etc.)

⚠️ IMPORTANT: Do NOT mark "complete" unless:
- You SEE a clear success message after submitting a form, OR
- You have already FILLED fields and CLICKED submit

🚫 NEVER mark "complete" on step 1! The system already verified a signup form exists.
🚫 NEVER say "Login page detected" if the system found a signup form (see PRE-ANALYSIS above).

🔍 FINDING SIGNUP FORMS:
Many pages have signup forms in unexpected locations:
- Footer section (newsletter signups)
- Sidebar or popup
- After scrolling down
- Behind "Subscribe" or "Get Updates" buttons
- **BEHIND CTA BUTTONS** (very common!)

🚀🚀🚀 CLICKING NAVIGATION BUTTONS TO FIND FORMS 🚀🚀🚀
IF you don't see an email input directly visible, CLICK these buttons first:
- "Try It", "Try Now", "Try Free", "Try for Free"
- "Get Started", "Start Now", "Start Free Trial"
- "Learn More", "Find Out More", "Discover"
- "Sign Up", "Register", "Create Account"
- "Subscribe", "Join", "Join Now", "Join Free"
- "Get Access", "Claim", "Claim Now"
- "Download", "Get Guide", "Get Ebook"
- "Request Demo", "Book Demo", "Schedule"
- "Contact Us", "Get in Touch"
- Any prominent CTA button on landing pages!

⚡ STRATEGY FOR LANDING PAGES WITHOUT VISIBLE FORMS:
1. First, CLICK the most prominent CTA button (usually "Get Started", "Try Free", etc.)
2. Wait for modal/popup or new form to appear
3. If form appears, fill it out
4. If not, try scrolling down to find forms
5. Look for footer newsletter signup as last resort

NEWSLETTER FORMS ARE VALID TARGETS:
- "Sign Up To Receive Our Newsletter" + email input = VALID
- "Subscribe to updates" + email input = VALID  
- Just email + submit button = VALID (it's still a signup!)

IF YOU CAN'T FIND THE FORM:
1. **CLICK CTA BUTTONS FIRST** (Try It, Get Started, Learn More, etc.)
2. Try scrolling down (there may be a footer newsletter)
3. Look for "Subscribe", "Newsletter", "Get Updates" sections
4. Check for email inputs anywhere on the page

⚠️ Only skip a page if there is TRULY no email input or signup form anywhere AND you've tried clicking main CTA buttons.

CRITICAL RULES:
1. 🚫 DO NOT interact with login forms - only signup/registration forms
2. Fill fields in order: email → name → phone → checkboxes → submit
3. For CHECKBOXES: Check ONE checkbox, then move to next field type
4. 🚫 NEVER click on country code/flag dropdowns - leave them at default!
5. For PHONE: ALWAYS use field_type="phone" with use_phone_number_only=true
   - The system auto-generates a valid phone number for the detected country
   - Do NOT provide a phone number value - the system handles this!
6. If action FAILED: Try DIFFERENT selector (don't repeat same one!)
7. Mark "complete" ONLY when you SEE "thank you" or success message
8. If you see phone validation errors, use field_type="phone" with use_phone_number_only=true

⚡⚡⚡ WHEN TO CLICK SUBMIT ⚡⚡⚡
- After filling email → CLICK SUBMIT (if only email is required)
- After filling email + name → CLICK SUBMIT
- After filling email + name + phone → CLICK SUBMIT
- After checking required checkbox → CLICK SUBMIT
- 🚫 DO NOT keep filling fields that are already filled!
- 🚫 DO NOT refill email/name/phone after they are successfully filled!
- If you've filled the main fields (email/name/phone), CLICK SUBMIT NOW!
⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡⚡

IMPORTANT - AFTER CLICKING SUBMIT:
- If the form is still visible with the same fields → Click Submit AGAIN
- If you see a success message → Mark "complete"
- If new required fields appear → Fill them, then click Submit
- 🚫 DO NOT click on non-existent buttons (like '×' or close buttons)
- 🚫 DO NOT hallucinate error popups - only respond to VISIBLE elements in the input list!
- If nothing changed after Submit, try clicking Submit again (forms sometimes need multiple clicks)

WHEN SOMETHING FAILS:
- Try a DIFFERENT approach, not the same thing
- If clicking a button failed, try a different selector for the same button
- Focus on EXISTING VISIBLE elements only - don't invent selectors!

CHECKBOX HANDLING:
- Hidden checkboxes (sr-only): Use action="fill_field", field_type="checkbox", value="true"
- DIV-based checkboxes: Use action="click" on the div/label
- After checking ONE checkbox → move to other field types!

PHONE NUMBER HANDLING:
- 🚫 DO NOT click on country dropdown, flag icon, or try to change country code!
- 🚫 DO NOT use field_type="country_code" - it will be ignored!
- ✅ ALWAYS use: field_type="phone" with use_phone_number_only=true
- The system automatically detects the selected country and generates a valid number!
- If phone validation fails, just try again with field_type="phone" and use_phone_number_only=true

DROPDOWN/SELECT HANDLING:
- Leave dropdowns at their default value
- Don't try to change country, state, or other pre-selected dropdowns
- Focus on filling text inputs and clicking submit

Return ONLY valid JSON:
{{
    "action": "fill_field" | "click" | "scroll" | "wait" | "complete",
    "selector": "#id or [name='x'] or button:has-text('text') (not needed for scroll)",
    "field_type": "email" | "first_name" | "last_name" | "full_name" | "phone" | "checkbox" | "business_name" | "website" | "message",
    "value": "value to fill (for checkboxes: 'true', for phone: leave empty, not needed for scroll)",
    "use_phone_number_only": true,
    "reasoning": "Brief reason for this action"
}}

Examples:
{{\"action\": \"fill_field\", \"selector\": \"#email\", \"field_type\": \"email\", \"reasoning\": \"Fill email field\"}}
{{\"action\": \"fill_field\", \"selector\": \"#fullName\", \"field_type\": \"full_name\", \"reasoning\": \"Fill name field\"}}
{{\"action\": \"fill_field\", \"selector\": \"[name='phoneNumber']\", \"field_type\": \"phone\", \"use_phone_number_only\": true, \"reasoning\": \"Fill phone - system generates valid number\"}}
{{\"action\": \"fill_field\", \"selector\": \"#agree\", \"field_type\": \"checkbox\", \"value\": \"true\", \"reasoning\": \"Check agreement box\"}}
{{\"action\": \"click\", \"selector\": \"button:has-text('Sign Up')\", \"reasoning\": \"Submit signup form\"}}
{{\"action\": \"click\", \"selector\": \"button:has-text('Submit')\", \"reasoning\": \"Submit newsletter subscription\"}}
{{\"action\": \"click\", \"selector\": \"button:has-text('Subscribe')\", \"reasoning\": \"Subscribe to newsletter\"}}
{{\"action\": \"click\", \"selector\": \"button:has-text('Try Free')\", \"reasoning\": \"Click CTA to reveal signup form\"}}
{{\"action\": \"click\", \"selector\": \"button:has-text('Get Started')\", \"reasoning\": \"Click Get Started to open signup modal\"}}
{{\"action\": \"click\", \"selector\": \"a:has-text('Try Now')\", \"reasoning\": \"Click Try Now button to access signup\"}}
{{\"action\": \"click\", \"selector\": \"button:has-text('Learn More')\", \"reasoning\": \"Click Learn More to find signup form\"}}
{{\"action\": \"scroll\", \"reasoning\": \"Scroll down to find signup form in footer\"}}
{{\"action\": \"complete\", \"reasoning\": \"Success message 'Thank you for subscribing' visible after form submission\"}}
"""
    
    def _format_inputs_for_llm(self, inputs: List[Dict]) -> str:
        """Format input fields for LLM prompt with form context."""
        if not inputs:
            return "No visible input fields found."
        
        result = []
        for i, inp in enumerate(inputs[:15], 1):
            inp_type = inp.get('type', 'text')
            label = inp.get('label', '')
            is_hidden = inp.get('hidden_input', False)
            is_wrapped = inp.get('wrapped_in_label', False)
            
            # Build selector hint
            inp_id = inp.get('id', '')
            inp_name = inp.get('name', '')
            if inp_id:
                selector = f"#{inp_id}"
            elif inp_name:
                selector = f"[name='{inp_name}']"
            else:
                selector = f"input[type='{inp_type}']"
            
            # Get form context
            form_id = inp.get('formId', '')
            form_submit_selector = inp.get('formSubmitSelector', '')
            
            if inp_type == 'div-checkbox':
                result.append(f"{i}. ⚠️ DIV-CHECKBOX (use 'click'!): '{label}', Selector: {selector}")
            elif inp_type in ['checkbox', 'radio']:
                pattern_info = ""
                if is_hidden and is_wrapped:
                    pattern_info = " 🎯 [HIDDEN+WRAPPED: use fill_field]"
                elif is_hidden:
                    pattern_info = " 🎯 [HIDDEN: sr-only]"
                result.append(f"{i}. Type: {inp_type}{pattern_info}, Label: '{label}', Selector: {selector}, Checked: {inp.get('checked', False)}")
            else:
                placeholder = inp.get('placeholder', '')
                form_info = ""
                if form_id and form_submit_selector:
                    form_info = f" 📋 [Form: {form_id}, Submit: {form_submit_selector}]"
                result.append(f"{i}. Type: {inp_type}, Selector: {selector}, Placeholder: '{placeholder}'{form_info}")
        
        return "\n".join(result)
    
    def _format_buttons_for_llm(self, buttons: List[Dict]) -> str:
        """Format buttons for LLM prompt, highlighting CTA buttons."""
        if not buttons:
            return "No visible buttons found."
        
        result = []
        # Prioritize CTA buttons by putting them first
        sorted_buttons = sorted(buttons, key=lambda b: (not b.get('isCTA', False), b.get('text', '')))
        
        for i, btn in enumerate(sorted_buttons[:15], 1):  # Increased from 10 to 15
            text = btn.get('text', '')[:40]
            btn_id = btn.get('id', '')
            btn_class = btn.get('className', '')[:30]
            btn_type = btn.get('type', 'button')
            is_cta = btn.get('isCTA', False)
            
            # Build selector - handle links differently
            if btn_id:
                selector = f"#{btn_id}"
            elif btn_type == 'link':
                selector = f"a:has-text('{text[:20]}')"
            elif text:
                selector = f"button:has-text('{text[:20]}')"
            else:
                first_class = btn_class.split()[0] if btn_class else ''
                selector = f"button.{first_class}" if first_class else "button"
            
            # Highlight CTA buttons
            cta_marker = " 🚀 [CTA - CLICK TO FIND FORM!]" if is_cta else ""
            result.append(f"{i}. Text: '{text}', Selector: {selector}{cta_marker}")
        
        return "\n".join(result)
    
    async def _call_openai(self, prompt: str, conversation_history: List[Dict[str, str]], 
                          screenshot_base64: Optional[str] = None) -> Dict[str, Any]:
        """Call OpenAI API with proper error handling."""
        import aiohttp
        
        api_key = self.llm_config.get('api_key', '')
        if not api_key or api_key.startswith('YOUR_') or api_key.startswith('sk-your'):
            raise ValueError("OpenAI API key not configured. Please add your API key in Settings.")
        
        model = self.llm_config.get('model', 'gpt-4o')
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        
        messages = [{
            "role": "system",
            "content": "You are a web automation agent. Analyze pages and return only valid JSON responses. Be precise with selectors."
        }]
        
        for msg in conversation_history[-3:]:
            messages.append(msg)
        
        if screenshot_base64:
            messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {
                        "url": f"data:image/png;base64,{screenshot_base64}",
                        "detail": "high"
                    }}
                ]
            })
        else:
            messages.append({"role": "user", "content": prompt})
        
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": 1000,
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=60)
                ) as response:
                    response_text = await response.text()
                    
                    if response.status == 429:
                        # Distinguish between quota exceeded (billing) vs temporary rate limit
                        if "exceeded your current quota" in response_text or "billing" in response_text.lower():
                            logger.error("OpenAI quota exceeded - billing issue")
                            raise Exception(f"quota_exceeded: Your OpenAI API quota is exceeded. Please add credits at https://platform.openai.com/account/billing")
                        else:
                            logger.warning("OpenAI rate limit hit (temporary)")
                            raise Exception(f"rate_limit_exceeded: {response_text}")

                    if response.status == 401:
                        logger.error("OpenAI API key invalid")
                        raise Exception(f"invalid_api_key: Your OpenAI API key is invalid or expired. Please check your API key in Settings.")

                    if response.status == 403:
                        logger.error("OpenAI API access denied")
                        raise Exception(f"api_access_denied: Access denied. Your API key may not have access to this model or region.")

                    if response.status != 200:
                        logger.error(f"OpenAI API error ({response.status}): {response_text[:200]}")
                        raise Exception(f"OpenAI error ({response.status}): {response_text[:200]}")
                    
                    try:
                        result = json.loads(response_text)
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse OpenAI response: {e}")
                        raise Exception(f"Invalid JSON from OpenAI: {response_text[:200]}")
                    
                    if 'choices' not in result or not result['choices']:
                        raise Exception("OpenAI returned no choices")

                    # Track API cost from usage data
                    if 'usage' in result:
                        usage = result['usage']
                        self._track_cost(
                            model=model,
                            prompt_tokens=usage.get('prompt_tokens', 0),
                            completion_tokens=usage.get('completion_tokens', 0)
                        )

                    content = result['choices'][0].get('message', {}).get('content')
                    
                    if content is None:
                        logger.error("OpenAI returned None content")
                        return {"action": "wait", "reasoning": "LLM returned empty response"}
                    
                    try:
                        return json.loads(content)
                    except json.JSONDecodeError:
                        if '{' in content and '}' in content:
                            start = content.find('{')
                            end = content.rfind('}') + 1
                            try:
                                return json.loads(content[start:end])
                            except:
                                pass
                        raise Exception(f"Invalid JSON from LLM: {content[:200]}")
        
        except aiohttp.ClientError as e:
            raise Exception(f"Network error: {e}")
        except asyncio.TimeoutError:
            raise Exception("OpenAI request timed out")
    
    def _fallback_action(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Fallback when LLM not available."""
        fields_filled = context.get("fields_filled", [])
        inputs = context.get("visible_inputs", [])
        buttons = context.get("visible_buttons", [])
        
        if context.get("has_success_indicator"):
            return {"action": "complete", "reasoning": "Success detected"}
        
        # Fill email
        if "email" not in str(fields_filled):
            for inp in inputs:
                if inp.get("type") == "email" or "email" in inp.get("name", "").lower():
                    selector = f"#{inp['id']}" if inp.get('id') else f"[name='{inp.get('name')}']"
                    return {"action": "fill_field", "selector": selector, "field_type": "email", "reasoning": "Fill email"}
        
        # Fill name
        if "name" not in str(fields_filled):
            for inp in inputs:
                name_attr = (inp.get("name", "") + inp.get("placeholder", "")).lower()
                if "name" in name_attr and "email" not in name_attr:
                    selector = f"#{inp['id']}" if inp.get('id') else f"[name='{inp.get('name')}']"
                    return {"action": "fill_field", "selector": selector, "field_type": "full_name", "reasoning": "Fill name"}
        
        # Submit button
        for btn in buttons:
            text = btn.get("text", "").lower()
            if any(w in text for w in ["submit", "sign up", "signup", "next", "continue", "join", "register"]):
                selector = f"#{btn['id']}" if btn.get('id') else f"button:has-text('{btn.get('text')[:20]}')"
                return {"action": "click", "selector": selector, "reasoning": "Click submit"}

        return {"action": "complete", "reasoning": "No more actions"}

    def _build_batch_planning_prompt(self, context: Dict[str, Any]) -> str:
        """Build prompt for batch planning mode - sends HTML directly to LLM."""
        credentials = context.get("credentials", {})
        page_url = context.get("page_url", "")
        simplified_html = context.get("simplified_html", "")

        return f"""You are a web automation agent. Analyze this HTML and return actions to sign up for an email newsletter or application form.

🚨🚨🚨 CRITICAL: DO NOT HALLUCINATE SELECTORS 🚨🚨🚨
You MUST only use selectors that LITERALLY appear in the HTML below.

SELECTOR RULES (MUST FOLLOW):
1. For id selectors: Only use #id if you see id="id" in the HTML
   - GOOD: id="email" → use #email
   - BAD: Making up #TojDQFSj7Qgr64InnMYO (doesn't exist in HTML!)

2. For name selectors: Only use [name="x"] if you see name="x" in the HTML
   - GOOD: name="firstName" → use [name="firstName"]
   - BAD: Making up [name="field123"]

3. For type selectors: Use input[type="x"] only for actual input types
   - GOOD: <input type="email"> → use input[type="email"]

4. For buttons: Use the button text you can SEE
   - GOOD: <button>Submit</button> → use button:has-text("Submit")
   - BAD: Making up button:has-text("Magic Button")

5. NEVER invent random alphanumeric IDs like #ABC123xyz or #Yes_I2Zu8pzZDTjTMKdrFpiH

⚠️ Before adding any action, VERIFY the selector exists in the HTML below!
⚠️ If you can't find a valid selector, skip that field - don't make one up!

REQUIRED FIELDS - MUST FILL ALL:
- Look for: required attribute, data-required="true", aria-required="true", asterisk (*)
- If you cannot fill all required fields, the form will fail validation!

CREDENTIALS (use these values for matching fields):
- Email: {credentials.get('email', 'test@example.com')}
- First Name: {credentials.get('first_name', 'John')}
- Last Name: {credentials.get('last_name', 'Doe')}
- Full Name: {credentials.get('full_name', 'John Doe')}
- Phone: {credentials.get('phone', '+1 555-123-4567')}
- Website/URL: https://example.com
- Company: Example Company
- Job Title: Marketing Manager
- Description/Message: I am interested in learning more about your services.
- Challenge/Problem: Growing my business efficiently
- Budget: $1000-5000
- How did you hear: Online search

PAGE URL: {page_url}

HTML TO ANALYZE (only use selectors from THIS HTML):
{simplified_html}

INSTRUCTIONS:
1. Scan the HTML above for ALL form fields
2. For EACH field you want to fill, find its EXACT id or name attribute from the HTML
3. Identify which fields are REQUIRED (required, data-required, *, aria-required)
4. Create fill_field actions using ONLY selectors you found in the HTML
5. For radio/checkbox groups, use the exact selector from HTML (e.g., input[type="radio"][value="Yes"])
6. End with the submit button click using its EXACT selector from HTML

Return JSON:
{{
    "actions": [
        {{"action": "fill_field", "selector": "#email", "field_type": "email", "reasoning": "Found id='email' in HTML"}},
        {{"action": "fill_field", "selector": "[name='website']", "field_type": "text", "value": "https://example.com", "reasoning": "Found name='website' in HTML"}},
        {{"action": "click", "selector": "input[type='radio'][value='Yes']", "reasoning": "Select first radio option from HTML"}},
        {{"action": "click", "selector": "button[type='submit']", "reasoning": "Found submit button in HTML"}}
    ],
    "reasoning": "Found 3 required fields + email in HTML, created actions using exact selectors"
}}

Valid field_type: email, full_name, first_name, last_name, phone, text, textarea, checkbox, radio
Valid action: fill_field, click, complete

For text/textarea fields not in credentials list, use appropriate generic values from the list above.
For required radio/checkbox groups, click the first visible option using its EXACT selector.

If no signup form found:
{{"actions": [{{"action": "complete", "reasoning": "No signup form"}}], "reasoning": "No form"}}
"""

    async def get_batch_plan(self, context: Dict[str, Any], screenshot_base64: Optional[str] = None) -> Dict[str, Any]:
        """Get a complete action plan for the page in one LLM call (HTML only, no screenshot)."""
        simplified_html = context.get("simplified_html", "")

        # Check if HTML has any usable form elements before calling LLM
        # Empty or minimal HTML means no form to fill
        html_lower = simplified_html.lower()
        has_input = "<input" in html_lower
        has_textarea = "<textarea" in html_lower

        # Check for FILLABLE text inputs - inputs users can type text into
        # Must explicitly check for text-entry types, not just any input
        has_fillable_input = (
            has_textarea or
            'type="email"' in html_lower or
            "type='email'" in html_lower or
            'type="text"' in html_lower or
            "type='text'" in html_lower or
            'type="tel"' in html_lower or
            "type='tel'" in html_lower or
            'type="password"' in html_lower or
            "type='password'" in html_lower
        )

        # If no explicit fillable type found, check for inputs with email-related attributes
        # (these are often type-less inputs that default to text)
        if not has_fillable_input and has_input:
            # Look for email signup indicators
            has_email_indicator = (
                'name="email"' in html_lower or
                "name='email'" in html_lower or
                'placeholder="email' in html_lower or
                "placeholder='email" in html_lower or
                'placeholder="your email' in html_lower or
                'placeholder="enter email' in html_lower or
                'placeholder="e-mail' in html_lower or
                '@' in simplified_html and 'placeholder=' in html_lower
            )
            has_fillable_input = has_email_indicator

        has_usable_elements = has_fillable_input

        # Fast-fail if no fillable form elements found
        # This catches pages with only: radio buttons, checkboxes, hidden inputs, buttons
        if not has_usable_elements:
            logger.warning(f"⚠️ No fillable input elements in HTML ({len(simplified_html)} chars) - skipping LLM call")
            return {
                "plan_type": "batch",
                "actions": [{"action": "complete", "reasoning": "No signup form - no fillable input elements found"}],
                "reasoning": "No fillable form elements detected in HTML (only radio/checkbox/hidden/buttons)",
                "no_form": True
            }

        if len(simplified_html) < 50:
            logger.warning(f"⚠️ HTML too short ({len(simplified_html)} chars) - skipping LLM call")
            return {
                "plan_type": "batch",
                "actions": [{"action": "complete", "reasoning": "No signup form - page has minimal content"}],
                "reasoning": "HTML content too minimal",
                "no_form": True
            }

        # Check if HTML only contains search forms (no email signup)
        # Skip LLM if no email-type inputs exist
        has_email_input = 'type="email"' in html_lower or 'type=\'email\'' in html_lower
        has_email_name = 'name="email"' in html_lower or 'name=\'email\'' in html_lower
        has_email_placeholder = 'email' in html_lower and ('placeholder=' in html_lower or '@' in simplified_html)
        is_search_only = ('action="/search"' in html_lower or 'role="search"' in html_lower) and not has_email_input and not has_email_name

        if is_search_only and not has_email_placeholder:
            logger.warning(f"⚠️ Only search forms found (no email inputs) - skipping LLM call")
            return {
                "plan_type": "batch",
                "actions": [{"action": "complete", "reasoning": "No signup form - only search form"}],
                "reasoning": "Page only has search forms",
                "no_form": True
            }

        # Log the HTML being sent (only when we're actually sending to LLM)
        html_preview = simplified_html[:200]
        logger.info(f"📤 Sending HTML to LLM ({len(simplified_html)} chars): {html_preview}...")

        prompt = self._build_batch_planning_prompt(context)

        try:
            # No screenshot - just HTML text
            result = await self._call_openai(prompt, [], None)

            # Validate the response
            if not isinstance(result, dict):
                logger.error(f"Batch plan returned non-dict: {type(result)}")
                return {"plan_type": "batch", "actions": [], "error": "Invalid response format"}

            if "actions" not in result:
                logger.error(f"Batch plan missing 'actions': {result}")
                return {"plan_type": "batch", "actions": [], "error": "Missing actions"}

            actions = result.get("actions", [])
            if not isinstance(actions, list):
                logger.error(f"Batch plan 'actions' is not a list: {type(actions)}")
                return {"plan_type": "batch", "actions": [], "error": "Actions not a list"}

            # Validate each action
            valid_actions = []
            for action in actions:
                if not isinstance(action, dict):
                    continue
                action_type = action.get("action", "")
                if action_type in ["fill_field", "click", "complete"]:
                    valid_actions.append(action)

            result["actions"] = valid_actions
            logger.info(f"Batch plan: {len(valid_actions)} actions planned")
            return result

        except Exception as e:
            error_str = str(e).lower()
            # Re-raise fatal API errors so they stop the entire run
            if any(fatal in error_str for fatal in ["quota_exceeded", "invalid_api_key", "api_access_denied"]):
                logger.error(f"Fatal API error in batch planning: {e}")
                raise
            logger.error(f"Batch planning failed: {e}")
            return {"plan_type": "batch", "actions": [], "error": str(e)}

    def _build_verification_prompt(self, context: Dict[str, Any]) -> str:
        """Build prompt for verifying form submission and getting next steps if needed."""
        fields_filled = context.get("fields_filled", [])
        actions_taken = context.get("actions_taken", [])
        simplified_html = context.get("simplified_html", "")
        page_url = context.get("page_url", "")
        visible_text = context.get("visible_text", "")[:1000]
        credentials = context.get("credentials", {})

        fields_str = "\n".join([f"  - {f}" for f in fields_filled]) if fields_filled else "  None"
        actions_str = "\n".join([f"  - {a}" for a in actions_taken]) if actions_taken else "  None"

        # Format credentials for the prompt
        creds_str = f"""
CREDENTIALS TO USE FOR NEW FIELDS:
- email: {credentials.get('email', 'test@example.com')}
- first_name: {credentials.get('first_name', 'John')}
- last_name: {credentials.get('last_name', 'Doe')}
- full_name: {credentials.get('full_name', 'John Doe')}
- phone: {credentials.get('phone', '+15551234567')}
- company: Example Company
- website: https://example.com
- job_title: Marketing Manager
- message: I am interested in learning more about your services.
"""

        # Check for network success indicators
        network_success = context.get("network_success", False)
        network_status = context.get("network_status", 0)
        network_info = ""
        if network_success:
            network_info = f"""
📡 NETWORK SUCCESS DETECTED: HTTP {network_status} response received after form submit!
This is a STRONG indicator that the form was successfully submitted to the server.
If you don't see error messages, this likely means SUCCESS."""

        # Check if this is a retry with feedback
        retry_reason = context.get("retry_reason", "")
        retry_info = ""
        if retry_reason:
            retry_info = f"""
⚠️ RETRY REQUEST: {retry_reason}
Be extra careful to only use selectors that actually appear in the HTML below!
"""

        return f"""You are verifying if a form submission was successful or if more steps are needed.
{creds_str}
{network_info}
{retry_info}
WHAT WE DID:
Fields filled:
{fields_str}

Actions taken:
{actions_str}

CURRENT PAGE STATE:
URL: {page_url}

Visible text on page (IMPORTANT - read this carefully to understand what page we're on):
{visible_text}

Form elements in HTML (inputs, buttons only):
{simplified_html}

ANALYZE THE VISIBLE TEXT ABOVE - CHECK FOR ERRORS FIRST:

⚠️ VALIDATION/REJECTION ERRORS OVERRIDE EVERYTHING - Check for these FIRST:
- "is required" or "required" near empty fields → VALIDATION ERROR
- "Invalid" (invalid phone, invalid email, etc.) → VALIDATION ERROR
- "Please fill", "Please enter", "Please provide" → VALIDATION ERROR
- Red text or error messages visible → VALIDATION ERROR
- Empty required fields with asterisks (*) → VALIDATION ERROR
- "Different Address Needed" → REJECTION ERROR (email blocked)
- "cannot subscribe", "can't subscribe" → REJECTION ERROR
- "already subscribed", "already registered" → REJECTION ERROR
- "address blocked", "email blocked" → REJECTION ERROR
- "try again", "please try again" → ERROR
- Warning icons (⚠️, !) with error text → ERROR

If you see ANY validation/rejection error messages, status MUST be "validation_error" - NOT "success"!

Only if NO validation errors are present:
- If text mentions prices ($5, $47, $97, etc.) → SALES PAGE → SUCCESS (lead captured)
- If text mentions "Buy", "Purchase", "Order now", "Get Access" → SALES PAGE → SUCCESS
- If text has long marketing copy AND the form fields we filled are gone → SUCCESS
- If text shows "Thank you", "Success", "Confirmed" → CONFIRMATION PAGE → SUCCESS

YOUR TASK:
Analyze the current page state and determine:
1. Was the form submission SUCCESSFUL? Look for:
   - "Thank you" messages
   - "Success" or "Confirmed" messages
   - "Welcome" messages
   - "Check your email" messages
   - Confirmation pages
   - Account created messages

2. Is there a VALIDATION ERROR? Look for:
   - Error messages near form fields
   - "Please fill in..." messages
   - "Invalid..." messages
   - Red highlighted fields
   - Required field warnings

3. Is this a MULTI-STEP FORM requiring more actions? Look for:
   - "Step 2", "Step 3" indicators
   - New form fields that appeared
   - "Continue" or "Next" buttons
   - Additional required fields

4. Is this a PAYMENT/UPSELL page (signup already complete)? Look for:
   - Price mentions ($, "Buy now", "Purchase", "Order", "Get Access", "Instant Access")
   - "Special offer", "One-time offer", "Limited time"
   - Long sales copy / marketing content / testimonials
   - Payment buttons or checkout forms
   - The text mentions a product, course, framework, or service being sold

CRITICAL: If we already filled fields (name, email, phone) and the page now shows:
- Sales content with prices
- "Buy" or "Purchase" or "Get Access" buttons
- Marketing copy about a product/service
- Long-form sales page content
Then the SIGNUP WAS SUCCESSFUL - the lead was captured! The payment/sales page is just an upsell.

DO NOT keep clicking buttons on sales pages. Once lead info is captured, mark as SUCCESS.

Return JSON:
{{
    "status": "success" | "needs_more_actions" | "validation_error" | "failed",
    "confidence": 0.0-1.0,
    "reasoning": "Brief explanation of what you see on the page",
    "success_indicators": ["list", "of", "success", "messages", "found"],
    "error_indicators": ["list", "of", "error", "messages", "found"],
    "next_actions": [
        // Only if status is "needs_more_actions" - MUST include selector AND field_type for fill_field actions:
        {{"action": "fill_field", "selector": "#firstName", "field_type": "first_name"}},
        {{"action": "fill_field", "selector": "#lastName", "field_type": "last_name"}},
        {{"action": "fill_field", "selector": "[name='company']", "field_type": "company"}},
        {{"action": "click", "selector": "button:has-text('Submit')"}}
    ]
}}

⚠️ CRITICAL FOR next_actions:
- For fill_field: MUST include "selector" (from HTML) AND "field_type" (from credentials list above)
- Valid field_type values: email, first_name, last_name, full_name, phone, company, website, job_title, message, checkbox
- Only use selectors that EXIST in the HTML above - don't invent selectors!
- For click: MUST include "selector" for the button

Examples:
- Page shows "Thank you for signing up!" → {{"status": "success", "confidence": 0.95, "reasoning": "Clear thank you message visible"}}
- Page shows "Step 2: Enter your name" with firstName/lastName fields → {{"status": "needs_more_actions", "next_actions": [{{"action": "fill_field", "selector": "#firstName", "field_type": "first_name"}}, {{"action": "fill_field", "selector": "#lastName", "field_type": "last_name"}}, {{"action": "click", "selector": "button:has-text('Continue')"}}]}}
- Page shows "$5 - Buy Now" sales page → {{"status": "success", "confidence": 0.85, "reasoning": "Lead captured, now showing upsell page"}}
- Page shows "Please enter a valid email" → {{"status": "validation_error", "error_indicators": ["Please enter a valid email"]}}
"""

    async def verify_submission(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Verify if form submission was successful and get next steps if needed.

        This is Phase 2 of the two-phase LLM approach:
        1. Phase 1: get_batch_plan() - Get initial actions to fill the form
        2. Phase 2: verify_submission() - Check if successful, get more actions if needed

        Args:
            context: Dict containing:
                - fields_filled: List of fields that were filled
                - actions_taken: List of actions that were executed
                - simplified_html: Current page HTML
                - page_url: Current page URL
                - visible_text: Visible text on page

        Returns:
            Dict with:
                - status: "success" | "needs_more_actions" | "validation_error" | "failed"
                - confidence: 0.0-1.0
                - reasoning: Explanation
                - next_actions: List of actions if status is "needs_more_actions"
        """
        simplified_html = context.get("simplified_html", "")

        # Quick check - if no HTML, can't verify
        if len(simplified_html) < 50:
            logger.warning("⚠️ No HTML for verification - assuming success")
            return {
                "status": "success",
                "confidence": 0.5,
                "reasoning": "No HTML available for verification",
                "next_actions": []
            }

        logger.info(f"🔍 Verifying submission (HTML: {len(simplified_html)} chars)...")

        prompt = self._build_verification_prompt(context)

        try:
            result = await self._call_openai(prompt, [], None)

            # Validate response
            if not isinstance(result, dict):
                logger.error(f"Verification returned non-dict: {type(result)}")
                return {"status": "failed", "confidence": 0, "reasoning": "Invalid LLM response", "next_actions": []}

            status = result.get("status", "failed")
            confidence = result.get("confidence", 0)
            reasoning = result.get("reasoning", "")
            next_actions = result.get("next_actions", [])

            # Log result
            if status == "success":
                logger.success(f"✅ Verification: SUCCESS (confidence: {confidence:.0%}) - {reasoning}")
            elif status == "needs_more_actions":
                logger.info(f"🔄 Verification: NEEDS MORE ACTIONS ({len(next_actions)} actions) - {reasoning}")
            elif status == "validation_error":
                logger.warning(f"⚠️ Verification: VALIDATION ERROR - {reasoning}")
            else:
                logger.error(f"❌ Verification: FAILED - {reasoning}")

            return result

        except Exception as e:
            logger.error(f"Verification failed: {e}")
            return {"status": "failed", "confidence": 0, "reasoning": str(e), "next_actions": []}
