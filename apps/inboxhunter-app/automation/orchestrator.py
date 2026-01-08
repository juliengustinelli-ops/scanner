"""
InboxHunter Bot Orchestrator
Coordinates all automation components.
"""

import asyncio
import time
import re
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from pathlib import Path

from loguru import logger

from config import BotConfig
from browser import BrowserAutomation
from agent_orchestrator import AIAgentOrchestrator
from llm_analyzer import LLMPageAnalyzer
from scrapers.meta_ads import MetaAdsScraper
from scrapers.csv_parser import CSVParser
from database.operations import DatabaseOperations
from utils.helpers import random_delay
from utils.simple_logger import slog


class PageAnalysisResult:
    """Result of page analysis."""
    
    def __init__(self):
        self.has_signup_form = False
        self.has_login_form = False
        self.is_blog_or_article = False
        self.signup_behind_button = False
        self.has_payment_indicators = False  # Informational only - for agent to use during processing
        self.has_credit_card_fields = False  # Actual CC input fields detected
        self.navigation_buttons: List[str] = []  # Selectors for buttons that might lead to signup
        self.page_type = "unknown"  # signup, login, blog, landing, other
        self.reason = ""
    
    @property
    def should_process(self) -> bool:
        """
        Return True if this page should be processed for signup.
        
        TWO-PHASE VALIDATION APPROACH:
        Phase 1 (here): Only skip pages that are DEFINITIVELY not worth processing:
          - Pure blog/article pages with NO forms at all
        
        Phase 2 (in AI agent): Handle during processing:
          - Payment requirements (detected when form actually needs CC)
          - Login requirements (detected when signup needs existing account)
        
        This prevents false positives where valid signup pages are rejected
        because they mention pricing or have a login option.
        """
        # Only skip pure blog/article pages that have NO signup form
        # (Blogs with newsletter forms should still be processed)
        if self.is_blog_or_article and not self.has_signup_form:
            return False
        
        # Process if has signup form or might have one behind a button
        return self.has_signup_form or self.signup_behind_button


# App store domains to detect and skip
APP_STORE_DOMAINS = [
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
    # F-Droid
    "f-droid.org/packages/",
    # APK download sites
    "apkpure.com",
    "apkmirror.com",
    "aptoide.com",
]


def is_app_store_url(url: str) -> Tuple[bool, str]:
    """
    Check if a URL is an app store or app download page.
    
    Returns:
        Tuple of (is_app_store, domain_matched)
    """
    url_lower = url.lower()
    for domain in APP_STORE_DOMAINS:
        if domain in url_lower:
            return (True, domain)
    return (False, "")


class InboxHunterBot:
    """
    Main orchestrator for the InboxHunter automation bot.
    Coordinates scraping, form filling, and tracking.
    """
    
    def __init__(self, config: BotConfig, stop_check: callable = None):
        """
        Initialize the bot.
        
        Args:
            config: Bot configuration
            stop_check: Optional callable that returns True if stop requested
        """
        self.config = config
        self._stop_requested = False
        self._external_stop_check = stop_check
        
        # Configure simple logger based on settings
        # Check both 'detailed_logs' and legacy 'debug' for backwards compatibility
        detailed_logs = getattr(config.settings, 'detailed_logs', False)
        legacy_debug = getattr(config.settings, 'debug', False)
        self.detailed_logs = detailed_logs or legacy_debug
        slog.set_detailed(self.detailed_logs)
        
        # Initialize database in writable app data directory
        from utils.helpers import get_app_data_directory
        data_dir = get_app_data_directory()
        db_path = data_dir / "inboxhunter.db"
        self.db = DatabaseOperations(f"sqlite:///{db_path}")
        
        # Browser instance
        self.browser: Optional[BrowserAutomation] = None
        
        # Statistics
        self.stats = {
            "total_attempts": 0,
            "successful_signups": 0,
            "failed_attempts": 0,
            "duplicates_skipped": 0,
            "pages_skipped_no_form": 0,
            "pages_skipped_login_only": 0,
            "captchas_solved": 0,
            "errors": []
        }
        
        slog.detail("🤖 InboxHunter Bot initialized")
    
    def stop(self):
        """Request the bot to stop gracefully."""
        slog.detail("⏹ Stop requested, finishing current operation...")
        self._stop_requested = True
    
    def _stop_check(self) -> bool:
        """Check if stop has been requested."""
        if self._stop_requested:
            return True
        if self._external_stop_check and self._external_stop_check():
            return True
        # Check for stop signal file (created by Rust when user clicks Stop)
        from utils.helpers import get_app_data_directory
        stop_signal_path = get_app_data_directory() / "stop_signal.txt"
        if stop_signal_path.exists():
            slog.detail("📝 Stop signal file detected")
            self._stop_requested = True  # Cache it so we don't keep checking
            return True
        return False
    
    async def run(self):
        """Main bot execution loop."""
        # Always show start message
        logger.info("🚀 Starting bot...")
        slog.detail(f"📂 Source: {self.config.settings.data_source}")
        slog.detail(f"🎯 Max signups: {self.config.settings.max_signups}")

        # Reset API cost tracking for this session
        LLMPageAnalyzer.reset_cost_tracking()

        start_time = time.time()
        
        try:
            # Initialize browser
            slog.detail("⏳ Setting up browser automation...")
            self.browser = BrowserAutomation(
                headless=self.config.settings.headless
            )
            await self.browser.initialize()
            slog.detail_success("✅ Browser ready!")
            
            # Get URLs from configured source
            slog.detail(f"⏳ Loading URLs from {self.config.settings.data_source}...")
            urls = await self._get_urls()
            
            if not urls:
                logger.warning("⚠️ No URLs found from source")
                return
            
            # Always show how many URLs
            logger.info(f"📋 Processing {len(urls)} URLs...")
            
            # Process each URL
            processed = 0
            consecutive_failures = 0
            max_failures = 5
            
            for i, url_data in enumerate(urls, 1):
                # Check stop signal
                if self._stop_check():
                    slog.detail("⏹ Stop requested - stopping bot")
                    break
                
                # Check max signups
                if processed >= self.config.settings.max_signups:
                    logger.info(f"✅ Reached max signups limit: {self.config.settings.max_signups}")
                    break
                
                # Check consecutive failures
                if consecutive_failures >= max_failures:
                    slog.detail_warning(f"❌ Too many consecutive failures ({consecutive_failures})")
                    slog.detail("Cooling down for 60 seconds...")
                    await asyncio.sleep(60)
                    consecutive_failures = 0
                
                url = url_data.get("url", "")
                source = url_data.get("source", "unknown")
                
                # Simple log: just the URL being processed
                slog.url_start(i, len(urls), url)
                
                # Detailed log: separator and source info
                slog.detail(f"{'='*60}")
                slog.detail(f"Source: {source}")
                slog.detail(f"{'='*60}")
                
                # Skip if already processed
                if self.db.is_url_processed(url):
                    slog.url_skipped("Already processed")
                    self.stats["duplicates_skipped"] += 1
                    continue
                
                # Process the URL
                result = await self._process_url(url, source)
                
                # result can be: True (success), False (failed), None (interrupted), "quick_skip" (no form)
                if result is None:
                    # Processing was interrupted by stop request
                    # URL remains in pending state - don't count as success or failure
                    slog.detail("⏹ URL left in pending state for next run")
                    break  # Stop processing more URLs
                elif result == "quick_skip":
                    # No form found - skip delay entirely, move to next URL immediately
                    consecutive_failures = 0  # Don't count quick skips as failures
                    continue
                elif result:
                    processed += 1
                    consecutive_failures = 0
                    # Success logged by _process_url
                else:
                    consecutive_failures += 1
                    # Failure logged by _process_url

                # No delay between URLs - move immediately to next

        except Exception as e:
            logger.error(f"❌ Fatal error: {e}")
            raise
        finally:
            # Always print summary, even on stop or error
            elapsed_time = time.time() - start_time
            self._print_summary(elapsed_time)
            # Clean up browser
            await self.cleanup()
    
    async def _get_urls(self) -> List[Dict[str, Any]]:
        """Get URLs from configured source."""
        source = self.config.settings.data_source
        
        if source == "csv":
            slog.detail("📂 Loading URLs from CSV...")
            parser = CSVParser(self.config.settings.csv_path)
            urls = parser.parse()
            slog.detail_success(f"✅ Loaded {len(urls)} URLs from CSV")
            return urls
        
        elif source == "meta":
            slog.detail("📡 Scraping Meta Ads Library...")
            slog.detail(f"   Keywords: {self.config.settings.meta_keywords}")
            slog.detail(f"   Max ads to scrape: {self.config.settings.ad_limit}")
            
            scraper = MetaAdsScraper(
                keywords=self.config.settings.meta_keywords.split(","),
                max_ads=self.config.settings.ad_limit,
                headless=self.config.settings.headless
            )
            await scraper.initialize()
            urls = await scraper.scrape()
            await scraper.close()
            
            if urls:
                logger.success(f"✅ Found {len(urls)} URLs from Meta Ads")
                # Save scraped URLs to database for future use
                added = self.db.add_scraped_urls_batch([{"url": u["url"], "ad_id": u.get("ad_id"), "advertiser": u.get("advertiser")} for u in urls])
                if added > 0:
                    slog.detail(f"   💾 Saved {added} new URLs to database")
                
                # AUTO-SWITCH: After scraping, switch to database mode and process from there
                logger.info("🔄 Switching to database mode for processing...")
                slog.detail("   📂 Data source switched: meta → database")
                
                # Update the config to use database as the source
                self.config.settings.data_source = "database"
                
                # Signal to frontend to update the data source setting
                # This is done via a special log message that the frontend can parse
                logger.info("📢 DATASOURCE_CHANGE:database")
                
                # Now get URLs from database (which includes the just-scraped URLs)
                slog.detail("📂 Loading URLs from database (scraped queue)...")
                unprocessed_urls = self.db.get_unprocessed_urls(limit=self.config.settings.max_signups)
                
                if unprocessed_urls:
                    logger.success(f"✅ Found {len(unprocessed_urls)} unprocessed URLs in database")
                    return [{"url": url, "source": "database"} for url in unprocessed_urls]
                else:
                    logger.warning("⚠️ No unprocessed URLs in database after scraping")
                    return []
            else:
                logger.warning("⚠️ No URLs found from Meta Ads Library")
                slog.detail("💡 Tip: Try different keywords or check if Meta requires login")
                return []
        
        elif source == "database":
            slog.detail("📂 Loading URLs from database (scraped queue)...")
            unprocessed_urls = self.db.get_unprocessed_urls(limit=self.config.settings.max_signups)
            
            if unprocessed_urls:
                logger.success(f"✅ Found {len(unprocessed_urls)} unprocessed URLs in database")
                return [{"url": url, "source": "database"} for url in unprocessed_urls]
            else:
                logger.warning("⚠️ No unprocessed URLs in database")
                slog.detail("💡 Tip: First scrape some URLs using Meta Ads or add them via CSV")
                return []
        
        else:
            logger.error(f"Unknown data source: {source}")
            return []
    
    async def _analyze_page(self) -> PageAnalysisResult:
        """
        Thoroughly analyze the current page to determine if it's worth signing up.
        This does extensive analysis including:
        - Extracting and parsing the full HTML content
        - Scrolling through entire page to find forms in all sections
        - Checking header, footer, sidebar, and main content
        - Looking for newsletter signups, subscription forms, etc.
        """
        result = PageAnalysisResult()
        
        try:
            # First, scroll through the page to ensure all lazy-loaded content is visible
            slog.detail("🔍 Analyzing page structure (scrolling to load all content)...")
            await self._scroll_page_for_analysis()

            # === NEW: Extract and parse HTML content server-side ===
            html_analysis = await self._analyze_html_content()
            slog.detail(f"   🔎 HTML Analysis: {html_analysis.get('summary', 'N/A')}")
            
            analysis = await self.browser.page.evaluate("""
                () => {
                    const result = {
                        // Form analysis
                        hasEmailInput: false,
                        hasPasswordInput: false,
                        hasConfirmPasswordInput: false,
                        hasNameInput: false,
                        hasPhoneInput: false,
                        formCount: 0,
                        
                        // Login indicators
                        hasLoginButton: false,
                        hasLoginText: false,
                        hasForgotPassword: false,
                        hasRememberMe: false,
                        
                        // Signup indicators  
                        hasSignupButton: false,
                        hasSignupText: false,
                        hasTermsCheckbox: false,
                        
                        // Blog/Article indicators
                        isBlogOrArticle: false,
                        hasArticleStructure: false,
                        hasCommentSection: false,
                        hasSocialShare: false,
                        
                        // Payment indicators
                        requiresPayment: false,
                        hasCreditCardInput: false,
                        hasPaymentText: false,
                        
                        // Navigation buttons that might lead to signup
                        navigationButtons: [],
                        
                        // Page text sample
                        pageTextSample: ''
                    };
                    
                    // Get page text from ENTIRE page
                    result.pageTextSample = document.body.innerText.substring(0, 5000).toLowerCase();
                    
                    // Count forms
                    result.formCount = document.querySelectorAll('form').length;
                    
                    // Newsletter/subscription specific patterns
                    const newsletterPatterns = ['newsletter', 'subscribe', 'subscription', 'email list', 'mailing list', 
                                               'stay updated', 'stay informed', 'get updates', 'receive updates',
                                               'sign up to receive', 'sign up for our', 'join our', 'enter your email'];
                    result.hasNewsletterText = newsletterPatterns.some(p => result.pageTextSample.includes(p));
                    
                    // Look for forms in specific page sections (header, footer, sidebar)
                    const footerForms = document.querySelectorAll('footer form, [class*="footer"] form, #footer form');
                    const headerForms = document.querySelectorAll('header form, [class*="header"] form, #header form');
                    const sidebarForms = document.querySelectorAll('[class*="sidebar"] form, aside form');
                    
                    result.hasFooterForm = footerForms.length > 0;
                    result.hasHeaderForm = headerForms.length > 0;
                    result.hasSidebarForm = sidebarForms.length > 0;
                    
                    // Check for email inputs in specific locations
                    const footerEmailInputs = document.querySelectorAll('footer input[type="email"], [class*="footer"] input[type="email"]');
                    const bottomEmailInputs = document.querySelectorAll('[class*="bottom"] input[type="email"], [class*="subscribe"] input[type="email"], [class*="newsletter"] input[type="email"]');
                    
                    result.hasFooterEmailInput = footerEmailInputs.length > 0 || bottomEmailInputs.length > 0;
                    
                    // PAYMENT DETECTION - Only detect ACTUAL credit card input fields
                    // NOTE: We only check for actual CC fields, NOT text patterns
                    // Text patterns like "per month", "checkout", etc. cause too many false positives
                    // The AI agent will handle payment forms during processing
                    const paymentInputSelectors = [
                        'input[name*="card"]', 'input[name*="credit"]', 'input[name*="cc"]',
                        'input[name*="cvv"]', 'input[name*="cvc"]', 'input[name*="ccv"]',
                        'input[name*="expir"]', 'input[autocomplete="cc-number"]',
                        'input[autocomplete="cc-exp"]', 'input[autocomplete="cc-csc"]',
                        '[class*="card-number"]', '[class*="credit-card"]'
                    ];
                    
                    // Payment iframe selectors (Stripe, PayPal, etc.)
                    const paymentIframeSelectors = [
                        'iframe[src*="stripe"]', 'iframe[src*="braintree"]', 'iframe[src*="paypal"]',
                        '[class*="stripe"]', '[class*="braintree"]', '[class*="paypal"]'
                    ];
                    
                    result.hasCreditCardInput = paymentInputSelectors.some(selector => {
                        try { return document.querySelector(selector) !== null; } catch(e) { return false; }
                    });
                    
                    result.hasPaymentIframe = paymentIframeSelectors.some(selector => {
                        try { return document.querySelector(selector) !== null; } catch(e) { return false; }
                    });
                    
                    // Informational only - NOT used for initial rejection
                    // The AI agent will use this info during processing
                    result.hasPaymentIndicators = result.hasCreditCardInput || result.hasPaymentIframe;
                    
                    // Check for input types
                    document.querySelectorAll('input').forEach(input => {
                        const type = input.type?.toLowerCase() || '';
                        const name = (input.name || '').toLowerCase();
                        const id = (input.id || '').toLowerCase();
                        const placeholder = (input.placeholder || '').toLowerCase();
                        const combined = name + id + placeholder;
                        
                        if (type === 'email' || combined.includes('email')) {
                            result.hasEmailInput = true;
                        }
                        if (type === 'password') {
                            result.hasPasswordInput = true;
                            // Check for confirm password
                            if (combined.includes('confirm') || combined.includes('repeat') || combined.includes('retype')) {
                                result.hasConfirmPasswordInput = true;
                            }
                        }
                        if (combined.includes('name') && !combined.includes('username')) {
                            result.hasNameInput = true;
                        }
                        if (type === 'tel' || combined.includes('phone') || combined.includes('mobile')) {
                            result.hasPhoneInput = true;
                        }
                    });
                    
                    // Check for login indicators
                    const pageText = result.pageTextSample;
                    const loginPatterns = ['sign in', 'log in', 'login', 'already have an account', 'existing user'];
                    const signupPatterns = [
                        'sign up', 'signup', 'register', 'create account', 'get started', 
                        'join now', 'join free', 'start free', 'subscribe', 'get access',
                        'newsletter', 'subscribe to', 'sign up for', 'sign up to receive',
                        'get updates', 'stay updated', 'stay informed', 'email list',
                        'mailing list', 'join our list', 'enter your email', 'submit your email'
                    ];
                    
                    result.hasLoginText = loginPatterns.some(p => pageText.includes(p));
                    result.hasSignupText = signupPatterns.some(p => pageText.includes(p));
                    
                    // Check buttons
                    document.querySelectorAll('button, input[type="submit"], a[role="button"], a.btn, a.button').forEach(btn => {
                        const text = (btn.textContent || btn.value || '').toLowerCase().trim();
                        const href = btn.href || '';
                        
                        // Login buttons
                        if (text.match(/^(sign in|log in|login)$/i) || 
                            (text.includes('login') && !text.includes('signup'))) {
                            result.hasLoginButton = true;
                        }
                        
                        // Signup buttons
                        if (text.match(/^(sign up|signup|register|create account|get started|join|subscribe)$/i) ||
                            text.includes('sign up') || text.includes('register') || text.includes('create account')) {
                            result.hasSignupButton = true;
                        }
                        
                        // Navigation buttons that might lead to signup form
                        const navPatterns = ['get started', 'start now', 'try free', 'get access', 'claim', 'download', 'next', 'continue', 'proceed'];
                        if (navPatterns.some(p => text.includes(p))) {
                            // Build selector for this button
                            let selector = '';
                            if (btn.id) selector = '#' + btn.id;
                            else if (btn.className) {
                                const firstClass = btn.className.split(' ')[0];
                                if (firstClass) selector = btn.tagName.toLowerCase() + '.' + firstClass;
                            }
                            if (!selector) selector = `${btn.tagName.toLowerCase()}:has-text("${text.substring(0, 20)}")`;
                            
                            result.navigationButtons.push({
                                text: text.substring(0, 50),
                                selector: selector
                            });
                        }
                    });
                    
                    // Check for forgot password (strong login indicator)
                    const forgotPatterns = ['forgot password', 'reset password', 'forgot your password', 'trouble signing in'];
                    result.hasForgotPassword = forgotPatterns.some(p => pageText.includes(p));
                    
                    // Check for remember me checkbox
                    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        const label = cb.closest('label')?.textContent?.toLowerCase() || '';
                        const id = (cb.id || '').toLowerCase();
                        if (label.includes('remember') || id.includes('remember')) {
                            result.hasRememberMe = true;
                        }
                        if (label.includes('terms') || label.includes('privacy') || label.includes('agree')) {
                            result.hasTermsCheckbox = true;
                        }
                    });
                    
                    // Blog/Article detection
                    const blogIndicators = [
                        document.querySelector('article') !== null,
                        document.querySelector('.blog-post, .post-content, .article-content, .entry-content') !== null,
                        document.querySelector('.author, .byline, .post-author') !== null,
                        document.querySelector('.comment, .comments, #comments, .disqus') !== null,
                        document.querySelector('time[datetime], .post-date, .publish-date') !== null,
                        pageText.includes('read more') && pageText.includes('comments'),
                        document.querySelectorAll('article').length > 1, // Multiple articles = blog listing
                    ];
                    
                    result.hasArticleStructure = blogIndicators.filter(Boolean).length >= 2;
                    result.hasCommentSection = document.querySelector('.comment, .comments, #comments') !== null;
                    result.hasSocialShare = document.querySelector('.share, .social-share, [class*="share"]') !== null;
                    
                    // Strong blog indicators
                    const blogTitlePatterns = ['blog', 'article', 'news', 'post', 'read time', 'min read'];
                    const isBlogTitle = blogTitlePatterns.some(p => document.title.toLowerCase().includes(p));
                    
                    result.isBlogOrArticle = result.hasArticleStructure || 
                        (isBlogTitle && !result.hasEmailInput) ||
                        (result.hasCommentSection && !result.hasEmailInput);
                    
                    return result;
                }
            """)
            
            # Analyze the results
            
            # === MERGE HTML ANALYSIS RESULTS ===
            # Override JS detection with HTML parsing results if they found more
            if html_analysis.get('has_email_field') and not analysis.get('hasEmailInput'):
                analysis['hasEmailInput'] = True
                slog.detail(f"   🔧 HTML parsing found email field missed by JS")
            
            if html_analysis.get('has_name_field') and not analysis.get('hasNameInput'):
                analysis['hasNameInput'] = True
                slog.detail(f"   🔧 HTML parsing found name field missed by JS")
            
            if html_analysis.get('has_phone_field') and not analysis.get('hasPhoneInput'):
                analysis['hasPhoneInput'] = True
                slog.detail(f"   🔧 HTML parsing found phone field missed by JS")
            
            if html_analysis.get('form_count', 0) > analysis.get('formCount', 0):
                analysis['formCount'] = html_analysis['form_count']
                slog.detail(f"   🔧 HTML parsing found {html_analysis['form_count']} forms")
            
            if html_analysis.get('has_signup_text') and not analysis.get('hasSignupText'):
                analysis['hasSignupText'] = True
            
            if html_analysis.get('has_newsletter_text') and not analysis.get('hasNewsletterText'):
                analysis['hasNewsletterText'] = True
            
            # IMPORTANT: If HTML analysis found a likely signup form, don't classify as blog
            if html_analysis.get('likely_signup_form'):
                analysis['isBlogOrArticle'] = False
                slog.detail(f"   🔧 HTML analysis found signup form - overriding blog classification")
            
            # Log detailed findings
            slog.detail(f"   📋 Forms found: {analysis.get('formCount', 0)}")
            slog.detail(f"   📧 Email inputs: {analysis.get('hasEmailInput', False)}")
            slog.detail(f"   📰 Newsletter text: {analysis.get('hasNewsletterText', False)}")
            slog.detail(f"   👇 Footer form/email: {analysis.get('hasFooterForm', False) or analysis.get('hasFooterEmailInput', False)}")
            
            # Determine page type
            has_signup_indicators = (
                analysis.get('hasSignupButton') or 
                analysis.get('hasSignupText') or
                analysis.get('hasTermsCheckbox') or
                analysis.get('hasConfirmPasswordInput') or
                analysis.get('hasNewsletterText')  # Newsletter is a signup indicator
            )
            
            has_login_indicators = (
                analysis.get('hasLoginButton') or
                analysis.get('hasForgotPassword') or
                analysis.get('hasRememberMe') or
                (analysis.get('hasLoginText') and not analysis.get('hasSignupText'))
            )
            
            # Check for newsletter/subscription forms (common case)
            has_newsletter_form = (
                analysis.get('hasNewsletterText') and analysis.get('hasEmailInput')
            ) or analysis.get('hasFooterEmailInput') or analysis.get('hasFooterForm')
            
            # Is it a signup form?
            # Signup forms typically have: email + (name OR phone OR terms checkbox OR newsletter text) + NO "forgot password"
            if analysis.get('hasEmailInput'):
                # Newsletter forms are valid signup targets!
                if has_newsletter_form:
                    result.has_signup_form = True
                    result.page_type = "signup"
                    result.reason = "Found newsletter/subscription signup form"
                elif has_signup_indicators and not analysis.get('hasForgotPassword'):
                    result.has_signup_form = True
                    result.page_type = "signup"
                    result.reason = "Found email input with signup indicators"
                elif analysis.get('hasNameInput') or analysis.get('hasPhoneInput'):
                    result.has_signup_form = True
                    result.page_type = "signup"
                    result.reason = "Found email with name/phone inputs (likely signup)"
                elif analysis.get('hasPasswordInput') and analysis.get('hasConfirmPasswordInput'):
                    result.has_signup_form = True
                    result.page_type = "signup"
                    result.reason = "Found registration form with password confirmation"
                elif analysis.get('formCount', 0) > 0:
                    # If there's an email input AND at least one form, consider it a potential signup
                    result.has_signup_form = True
                    result.page_type = "signup"
                    result.reason = "Found email input within form structure"
            
            # === FALLBACK: Use HTML analysis if JS detection found nothing ===
            # If we haven't found a signup form yet, but HTML analysis did, trust the HTML analysis
            if not result.has_signup_form and html_analysis.get('likely_signup_form'):
                result.has_signup_form = True
                result.page_type = "signup"
                form_purposes = html_analysis.get('form_purposes', [])
                if form_purposes:
                    result.reason = f"HTML analysis found signup form ({', '.join(form_purposes)})"
                else:
                    result.reason = "HTML analysis detected likely signup form"
                slog.detail(f"   ✅ HTML analysis detected signup form - overriding JS detection")
            
            # Is it a login form?
            if analysis.get('hasEmailInput') and analysis.get('hasPasswordInput'):
                if has_login_indicators and not has_signup_indicators:
                    result.has_login_form = True
                    result.page_type = "login"
                    result.reason = "Found login form (email + password + login indicators)"
            
            # Login-only page (no signup)
            if result.has_login_form and not result.has_signup_form:
                if analysis.get('hasForgotPassword') or analysis.get('hasRememberMe'):
                    result.reason = "Login-only page (has forgot password/remember me)"
            
            # CRITICAL: Check for account registration pages (require password - NOT simple newsletters)
            # If the form has a password field but NO password confirmation, it's likely:
            # 1. A login page, or
            # 2. An account registration that requires creating a password
            # Either way, we should NOT process it - we only want simple newsletter signups
            if analysis.get('hasPasswordInput') and not analysis.get('hasConfirmPasswordInput'):
                # This is either login or simple account registration (one password field)
                # We should skip these - they're not simple newsletter forms
                if analysis.get('hasEmailInput'):
                    # Override any previous signup detection
                    result.has_signup_form = False
                    result.has_login_form = True
                    result.page_type = "login_or_registration"
                    result.reason = "Form requires password - not a simple newsletter (requires account creation)"
                    slog.detail("   ⚠️ Password field detected - skipping (only processing simple newsletter forms)")
            
            # Is it a blog/article?
            # IMPORTANT: Don't mark as blog if we found a signup form - blogs can have newsletter signups!
            if analysis.get('isBlogOrArticle') and not result.has_signup_form:
                result.is_blog_or_article = True
                result.page_type = "blog"
                result.reason = "Detected blog/article structure (no signup form found)"
            elif analysis.get('isBlogOrArticle') and result.has_signup_form:
                # It's a blog BUT it has a signup form - process it!
                slog.detail("   📰 Blog page detected but has signup form - will process")
            
            # Check for payment indicators (informational only - for AI agent to use)
            # NOTE: We no longer reject pages based on payment detection here
            # The AI agent will handle this during form processing
            if analysis.get('hasPaymentIndicators') or analysis.get('hasCreditCardInput'):
                result.has_payment_indicators = True
                result.has_credit_card_fields = analysis.get('hasCreditCardInput', False)
                slog.detail("   💳 Payment indicators found (will be validated by AI agent during processing)")
            
            # Check for navigation buttons that might lead to signup
            nav_buttons = analysis.get('navigationButtons', [])
            if nav_buttons and not result.has_signup_form:
                result.signup_behind_button = True
                result.navigation_buttons = [btn['selector'] for btn in nav_buttons[:3]]  # Top 3 buttons
                result.reason = f"No visible form, but found {len(nav_buttons)} navigation button(s)"
            
            # Landing page without form
            if not result.has_signup_form and not result.has_login_form and not result.is_blog_or_article:
                if not result.signup_behind_button:
                    result.page_type = "landing_no_form"
                    result.reason = "Landing page without visible signup form"
                else:
                    result.page_type = "landing_with_nav"
            
            # Log analysis results
            slog.detail(f"   📄 Page type: {result.page_type}")
            slog.detail(f"   📝 Has signup form: {result.has_signup_form}")
            slog.detail(f"   🔐 Has login form: {result.has_login_form}")
            slog.detail(f"   📰 Is blog/article: {result.is_blog_or_article}")
            slog.detail(f"   🔘 Form behind button: {result.signup_behind_button}")
            slog.detail(f"   💡 Reason: {result.reason}")
            
            return result
            
        except Exception as e:
            logger.error(f"Page analysis error: {e}")
            # On error, assume we should try
            result.has_signup_form = True
            result.reason = f"Analysis error, assuming signup form: {e}"
            return result
    
    async def _scroll_page_for_analysis(self):
        """
        Scroll through the page to trigger lazy loading and find forms.
        
        OPTIMIZATION: Limits scroll time and iterations to avoid spending
        minutes on very long pages (novels, blogs, documentation).
        """
        MAX_SCROLL_TIME_SECONDS = 15  # Maximum time to spend scrolling
        MAX_SCROLL_ITERATIONS = 20    # Maximum number of scroll steps
        
        try:
            start_time = time.time()
            
            # Get page height
            page_height = await self.browser.page.evaluate("() => document.body.scrollHeight")
            viewport_height = await self.browser.page.evaluate("() => window.innerHeight")
            
            # Check if page is very long (>10 viewports = likely a blog/novel)
            is_long_page = page_height > (viewport_height * 10)
            if is_long_page:
                slog.detail(f"   📜 Long page detected ({page_height}px) - using quick scan mode")
            
            # Scroll incrementally through the page
            current_position = 0
            scroll_step = viewport_height * 0.7  # Scroll 70% of viewport at a time
            scroll_count = 0
            
            while current_position < page_height:
                # Check time limit
                elapsed = time.time() - start_time
                if elapsed > MAX_SCROLL_TIME_SECONDS:
                    slog.detail(f"   ⏱️ Scroll time limit reached ({elapsed:.1f}s) - stopping scan")
                    break
                
                # Check iteration limit
                scroll_count += 1
                if scroll_count > MAX_SCROLL_ITERATIONS:
                    slog.detail(f"   🔄 Scroll iteration limit reached ({scroll_count}) - stopping scan")
                    break
                
                await self.browser.page.evaluate(f"window.scrollTo(0, {current_position})")
                await asyncio.sleep(0.2)  # Reduced from 0.3 for faster scanning
                current_position += scroll_step
                
                # Update page height (might change due to lazy loading)
                # Only check every 5 scrolls for performance on long pages
                if scroll_count % 5 == 0:
                    page_height = await self.browser.page.evaluate("() => document.body.scrollHeight")
            
            # Scroll to bottom then back to top (quick peek at footer)
            await self.browser.page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(0.3)
            await self.browser.page.evaluate("window.scrollTo(0, 0)")
            await asyncio.sleep(0.2)
            
        except Exception as e:
            logger.debug(f"Scroll analysis error (non-critical): {e}")
    
    async def _analyze_html_content(self) -> Dict[str, Any]:
        """
        Extract and parse HTML content to find signup forms that JavaScript detection might miss.
        This is a more thorough analysis that looks at the raw HTML structure.
        """
        result = {
            'has_email_field': False,
            'has_name_field': False,
            'has_phone_field': False,
            'has_password_field': False,
            'has_signup_text': False,
            'has_newsletter_text': False,
            'has_submit_button': False,
            'form_count': 0,
            'input_count': 0,
            'likely_signup_form': False,
            'form_purposes': [],  # List of detected form purposes
            'summary': ''
        }
        
        try:
            # Extract the full HTML content
            html_content = await self.browser.page.content()
            html_lower = html_content.lower()
            
            # Also get the visible text for context analysis
            visible_text = await self.browser.page.evaluate("() => document.body.innerText")
            visible_text_lower = visible_text.lower() if visible_text else ""
            
            # === FORM DETECTION ===
            # Count <form> tags
            form_count = html_lower.count('<form')
            result['form_count'] = form_count
            
            # Count input elements (more comprehensive than JS detection)
            input_count = html_lower.count('<input')
            result['input_count'] = input_count
            
            # === EMAIL FIELD DETECTION ===
            email_patterns = [
                'type="email"', "type='email'",
                'type=email',
                'name="email"', "name='email'",
                'id="email"', "id='email'",
                'placeholder="email', "placeholder='email",
                'placeholder="your email', "placeholder='your email",
                'placeholder="enter email', "placeholder='enter email",
                'placeholder="e-mail', "placeholder='e-mail",
                'name="mail"', 'id="mail"',
                'name="user_email"', 'name="useremail"',
                'name="emailaddress"', 'name="email_address"',
                'autocomplete="email"',
                # React/Vue/Angular patterns
                'formcontrolname="email"',
                'data-email', 'data-field="email"',
                # Common class patterns
                'class="email', "class='email",
                'class="input-email', 'class="email-input',
            ]
            result['has_email_field'] = any(pattern in html_lower for pattern in email_patterns)
            
            # === NAME FIELD DETECTION ===
            name_patterns = [
                'name="name"', 'id="name"',
                'name="fullname"', 'name="full_name"', 'name="full-name"',
                'name="firstname"', 'name="first_name"', 'name="first-name"',
                'name="lastname"', 'name="last_name"', 'name="last-name"',
                'name="fname"', 'name="lname"',
                'placeholder="name', 'placeholder="your name',
                'placeholder="full name', 'placeholder="first name',
                'autocomplete="name"', 'autocomplete="given-name"',
                'formcontrolname="name"', 'formcontrolname="firstname"',
                'data-field="name"',
            ]
            result['has_name_field'] = any(pattern in html_lower for pattern in name_patterns)
            
            # === PHONE FIELD DETECTION ===
            phone_patterns = [
                'type="tel"', "type='tel'",
                'name="phone"', 'name="telephone"', 'name="mobile"',
                'id="phone"', 'id="telephone"', 'id="mobile"',
                'name="phonenumber"', 'name="phone_number"', 'name="phone-number"',
                'placeholder="phone', 'placeholder="your phone',
                'placeholder="mobile', 'placeholder="cell',
                'autocomplete="tel"',
                'formcontrolname="phone"',
                'data-field="phone"',
                # Common phone input libraries
                'react-tel-input', 'intl-tel-input', 'phone-input',
            ]
            result['has_phone_field'] = any(pattern in html_lower for pattern in phone_patterns)
            
            # === PASSWORD FIELD DETECTION ===
            password_patterns = [
                'type="password"', "type='password'",
                'name="password"', 'id="password"',
                'autocomplete="new-password"', 'autocomplete="current-password"',
            ]
            result['has_password_field'] = any(pattern in html_lower for pattern in password_patterns)
            
            # === SIGNUP TEXT DETECTION (in HTML and visible text) ===
            signup_text_patterns = [
                'sign up', 'signup', 'sign-up',
                'register', 'registration',
                'create account', 'create an account',
                'join now', 'join us', 'join free',
                'get started', 'start free', 'start now',
                'subscribe', 'subscription',
                'get access', 'claim your', 'claim access',
                'newsletter', 'mailing list', 'email list',
                'stay updated', 'get updates', 'receive updates',
                'enter your email', 'submit your email',
                'free trial', 'try free', 'try for free',
            ]
            combined_text = html_lower + " " + visible_text_lower
            result['has_signup_text'] = any(pattern in combined_text for pattern in signup_text_patterns)
            
            # === NEWSLETTER TEXT DETECTION ===
            newsletter_patterns = [
                'newsletter', 'mailing list', 'email list',
                'subscribe to', 'sign up for our', 'join our list',
                'get our updates', 'receive updates', 'stay informed',
                'get notified', 'be the first to know',
            ]
            result['has_newsletter_text'] = any(pattern in combined_text for pattern in newsletter_patterns)
            
            # === SUBMIT BUTTON DETECTION ===
            submit_patterns = [
                'type="submit"', "type='submit'",
                '>submit<', '>sign up<', '>signup<', '>register<',
                '>join<', '>subscribe<', '>get started<', '>continue<',
                '>send<', '>get access<', '>claim<', '>start<',
                'button.*submit', 'button.*sign',
            ]
            result['has_submit_button'] = any(pattern in html_lower for pattern in submit_patterns)
            
            # === FORM PURPOSE DETECTION ===
            form_purposes = []
            
            # Check for signup form patterns
            if result['has_email_field'] and (result['has_name_field'] or result['has_phone_field']):
                form_purposes.append('registration')
            
            if result['has_email_field'] and result['has_newsletter_text']:
                form_purposes.append('newsletter')
            
            if result['has_email_field'] and not result['has_password_field']:
                # Email-only forms are usually newsletter/lead capture
                form_purposes.append('lead_capture')
            
            if result['has_email_field'] and result['has_password_field']:
                if result['has_name_field'] or result['has_phone_field']:
                    form_purposes.append('registration')
                else:
                    form_purposes.append('login_or_signup')
            
            result['form_purposes'] = form_purposes
            
            # === DETERMINE IF LIKELY SIGNUP FORM ===
            # A page is likely to have a signup form if:
            likely_signup = False
            likelihood_reasons = []
            
            # Strong indicators
            if result['has_email_field'] and result['has_signup_text']:
                likely_signup = True
                likelihood_reasons.append("email + signup text")
            
            if result['has_email_field'] and result['has_name_field']:
                likely_signup = True
                likelihood_reasons.append("email + name fields")
            
            if result['has_email_field'] and result['has_newsletter_text']:
                likely_signup = True
                likelihood_reasons.append("email + newsletter text")
            
            if result['has_email_field'] and result['has_submit_button'] and form_count > 0:
                likely_signup = True
                likelihood_reasons.append("email + submit + form")
            
            # Moderate indicators - email field alone in a form context
            if result['has_email_field'] and form_count > 0 and result['has_submit_button']:
                likely_signup = True
                likelihood_reasons.append("form with email and submit")
            
            # Check for specific signup form structures in HTML
            signup_form_patterns = [
                # Form with signup-related action
                'action=".*signup', 'action=".*subscribe', 'action=".*register',
                'action=".*newsletter', 'action=".*join',
                # Form with signup-related id/class
                'class=".*signup', 'class=".*subscribe', 'class=".*register',
                'class=".*newsletter', 'class=".*lead', 'class=".*opt-in',
                'id="signup', 'id="subscribe', 'id="register', 'id="newsletter',
                # Data attributes
                'data-form-type="signup"', 'data-form-type="subscribe"',
                'data-form-type="newsletter"', 'data-form-type="lead"',
            ]
            if any(re.search(pattern, html_lower) for pattern in signup_form_patterns):
                likely_signup = True
                likelihood_reasons.append("signup form class/id/action")
            
            result['likely_signup_form'] = likely_signup
            
            # Build summary
            summary_parts = []
            if result['has_email_field']:
                summary_parts.append("email")
            if result['has_name_field']:
                summary_parts.append("name")
            if result['has_phone_field']:
                summary_parts.append("phone")
            if result['has_password_field']:
                summary_parts.append("password")
            
            if summary_parts:
                result['summary'] = f"Found: {', '.join(summary_parts)} fields | Forms: {form_count} | Inputs: {input_count}"
                if likely_signup:
                    result['summary'] += f" | LIKELY SIGNUP ({', '.join(likelihood_reasons)})"
            else:
                result['summary'] = f"Forms: {form_count} | Inputs: {input_count} | No standard fields detected"
            
            slog.detail(f"   📄 HTML parsed: {len(html_content)} bytes, {input_count} inputs, {form_count} forms")
            
        except Exception as e:
            logger.warning(f"HTML analysis error: {e}")
            result['summary'] = f"Analysis error: {e}"
        
        return result
    
    async def _try_navigate_to_signup(self, navigation_buttons: List[str]) -> Tuple[bool, Optional[str]]:
        """
        Try clicking navigation buttons to reach a signup form.
        
        Returns:
            Tuple of (found_signup_form, skip_reason)
            - (True, None) if signup form found
            - (False, None) if no signup form found but should continue
            - (False, "app_store") if redirected to app store - should skip this URL
        """
        slog.detail("🔄 Attempting to navigate to signup form...")
        
        for i, selector in enumerate(navigation_buttons[:3], 1):  # Try up to 3 buttons
            if self._stop_check():
                return (False, None)
            
            try:
                slog.detail(f"   Trying button {i}/{len(navigation_buttons)}: {selector[:50]}")
                
                # Try to click the button
                try:
                    element = await self.browser.page.wait_for_selector(selector, timeout=3000)
                    if element and await element.is_visible():
                        await element.scroll_into_view_if_needed()
                        await element.click()
                        await asyncio.sleep(2)  # Wait for page to update
                        
                        # Check if we were redirected to an app store
                        current_url = self.browser.page.url
                        is_app_store, matched_domain = is_app_store_url(current_url)
                        if is_app_store:
                            slog.detail_warning(f"   📱 App store redirect detected: {matched_domain}")
                            return (False, f"app_store:{matched_domain}")
                        
                        # Re-analyze the page
                        new_analysis = await self._analyze_page()
                        if new_analysis.has_signup_form:
                            logger.success(f"   ✅ Found signup form after clicking button!")
                            return (True, None)
                except Exception as e:
                    logger.debug(f"   Button click failed: {e}")
                    continue
                    
            except Exception as e:
                logger.debug(f"   Navigation attempt failed: {e}")
                continue
        
        slog.detail("   ❌ Could not find signup form after navigation attempts")
        return (False, None)
    
    async def _process_url(self, url: str, source: str) -> bool:
        """
        Process a single URL (navigate, analyze, fill form, submit).
        
        Args:
            url: Landing page URL
            source: Source of the URL
            
        Returns:
            True if successful, False otherwise
            Returns None if processing was interrupted by stop request
        """
        self.stats["total_attempts"] += 1
        
        try:
            # Check stop before starting
            if self._stop_check():
                slog.detail("⏹ Stop requested before processing - leaving URL in pending state")
                self.stats["total_attempts"] -= 1  # Don't count this as an attempt
                return None  # Return None to indicate interrupted, not failed
            
            # Navigate to page
            slog.detail("🌐 Navigating to landing page...")
            success = await self.browser.navigate(url)
            
            if not success:
                # Check if navigation failed due to stop request
                if self._stop_check():
                    slog.detail("⏹ Navigation interrupted by stop request - leaving URL in pending state")
                    self.stats["total_attempts"] -= 1  # Don't count this as an attempt
                    return None  # Don't mark as failed - leave in pending state
                
                # Record navigation failure as SKIPPED (not failed)
                # Network errors, timeouts, connection resets are not processing failures
                # They should be skipped so user can retry later if needed
                error_reason = getattr(self.browser, 'last_error', None) or 'Unknown error'
                slog.url_skipped(f"Could not load page ({error_reason})")
                self.stats.setdefault("pages_skipped_load_error", 0)
                self.stats["pages_skipped_load_error"] += 1
                self._record_result(url, source, "skipped", [], 
                                   error_message=f"Page failed to load: {error_reason}",
                                   error_category="load_error",
                                   details=f"Could not load page - {error_reason}")
                return False
            
            # Check if the initial URL redirected to an app store
            current_url = self.browser.page.url
            is_app_store, matched_domain = is_app_store_url(current_url)
            if is_app_store:
                slog.url_skipped(f"App store page ({matched_domain})")
                self.stats.setdefault("pages_skipped_app_store", 0)
                self.stats["pages_skipped_app_store"] += 1
                self._record_result(url, source, "skipped", [],
                                   error_message=f"App store URL: {matched_domain}",
                                   error_category="app_store",
                                   details="URL leads directly to app download page")
                return False
            
            # BATCH MODE: Skip slow pre-analysis, let LLM detect forms from screenshot + HTML
            if self.config.settings.batch_planning:
                slog.detail("⚡ Batch mode: Skipping pre-analysis (LLM will detect forms)")
                # Create minimal analysis result for batch mode
                analysis = PageAnalysisResult()
                analysis.has_signup_form = True  # Assume form exists, LLM will verify
            else:
                # Regular mode: Full page analysis
                analysis = await self._analyze_page()

            # Skip login-only pages (only in regular mode - batch mode lets LLM decide)
            if not self.config.settings.batch_planning and analysis.has_login_form and not analysis.has_signup_form:
                slog.url_skipped("Login page (no signup)")
                self.stats["pages_skipped_login_only"] += 1
                self._record_result(url, source, "skipped", [], 
                                   error_message=f"Login-only page: {analysis.reason}",
                                   error_category="login_page",
                                   details="Page type: login, No signup form found")
                return False
            
            # Skip blog/article pages
            if analysis.is_blog_or_article:
                slog.url_skipped("Blog/article (no form)")
                self.stats["pages_skipped_no_form"] += 1
                self._record_result(url, source, "skipped", [],
                                   error_message=f"Blog/article page: {analysis.reason}",
                                   error_category="blog_article",
                                   details="Page type: blog/article, No signup form found")
                return False
            
            # NOTE: Payment detection is now handled by the AI agent during processing
            # This prevents false positives from pages that mention pricing but have free signups
            if analysis.has_payment_indicators:
                slog.detail("   💳 Payment indicators found - AI agent will validate during processing")
            
            # Try to navigate to signup if form is behind a button
            if analysis.signup_behind_button and not analysis.has_signup_form:
                slog.detail("🔍 Form might be behind navigation buttons, attempting to find it...")
                found_form, skip_reason = await self._try_navigate_to_signup(analysis.navigation_buttons)
                
                # Check if we were redirected to an app store or other unwanted page
                if skip_reason:
                    if skip_reason.startswith("app_store:"):
                        domain = skip_reason.split(":", 1)[1] if ":" in skip_reason else "unknown"
                        slog.url_skipped(f"App store redirect ({domain})")
                        self.stats.setdefault("pages_skipped_app_store", 0)
                        self.stats["pages_skipped_app_store"] += 1
                        self._record_result(url, source, "skipped", [],
                                           error_message=f"App store redirect: {domain}",
                                           error_category="app_store",
                                           details="Button click led to app download page")
                        return False
                
                if not found_form:
                    # Re-analyze one more time
                    final_analysis = await self._analyze_page()
                    if not final_analysis.has_signup_form:
                        logger.warning(f"⏭️ Skipping page - NO SIGNUP FORM found after navigation attempts")
                        self.stats["pages_skipped_no_form"] += 1
                        self._record_result(url, source, "skipped", [], 
                                           error_message="No signup form found after navigation",
                                           error_category="no_form")
                        return False
            
            # Skip if no signup form and not behind a button
            if not analysis.has_signup_form and not analysis.signup_behind_button:
                logger.warning(f"⏭️ Skipping page - NO SIGNUP FORM: {analysis.reason}")
                self.stats["pages_skipped_no_form"] += 1
                self._record_result(url, source, "skipped", [], 
                                   error_message=f"No signup form: {analysis.reason}",
                                   error_category="no_form")
                return False
            
            # Create AI Agent - pass the local page analysis to prevent LLM from contradicting it
            credentials = {
                "email": self.config.credentials.email,
                "first_name": self.config.credentials.first_name,
                "last_name": self.config.credentials.last_name,
                "full_name": self.config.credentials.full_name,
                "phone": self.config.credentials.phone_config.model_dump(),
                "_captcha_api_key": self.config.api_keys.captcha or None
            }
            
            llm_config = {
                "api_key": self.config.api_keys.openai,
                "model": self.config.settings.llm_model,
                "batch_planning": self.config.settings.batch_planning
            }
            
            # Pass the page analysis so LLM knows what was found
            # Including payment indicators for runtime validation
            page_analysis_for_agent = {
                "has_signup_form": analysis.has_signup_form,
                "has_login_form": analysis.has_login_form,
                "page_type": analysis.page_type,
                "reason": analysis.reason,
                # Payment indicators for AI agent to validate during processing
                "has_payment_indicators": analysis.has_payment_indicators,
                "has_credit_card_fields": analysis.has_credit_card_fields
            }
            
            agent = AIAgentOrchestrator(
                page=self.browser.page,
                credentials=credentials,
                llm_provider="openai",
                llm_config=llm_config,
                stop_check=self._stop_check,
                page_analysis=page_analysis_for_agent,
                captcha_api_key=self.config.api_keys.captcha or None
            )
            
            # Execute signup
            slog.detail("🤖 Starting AI Agent...")
            result = await agent.execute_signup()
            
            # Check if processing was interrupted by stop request
            if result.get("interrupted_by_stop"):
                slog.detail("⏹ Signup interrupted by stop request - leaving URL in pending state")
                self.stats["total_attempts"] -= 1  # Don't count this as an attempt
                return None  # Don't mark as failed - leave in pending state
            
            if result["success"]:
                # Record success with details about what was signed up
                fields = result.get("fields_filled", [])
                signup_type = "Newsletter" if len(fields) <= 2 else "Account"
                details = f"Signup type: {signup_type}, Fields filled: {len(fields)}"
                if analysis.reason:
                    details += f", Form: {analysis.reason}"
                
                # Simple log: success with type
                slog.url_success(signup_type)
                
                self._record_result(url, source, "success", fields, details=details)
                self.stats["successful_signups"] += 1
                return True
            else:
                # Check if it was skipped (unwanted page, payment required, etc.)
                skipped_reason = result.get("skipped_reason")
                if skipped_reason:
                    error_msg = result.get("errors", ["Skipped"])[0]
                    slog.url_skipped(f"Agent skipped: {skipped_reason}")
                    
                    # Determine error category for skipped pages
                    skip_category = "skipped"
                    if "payment" in skipped_reason.lower():
                        self.stats.setdefault("pages_skipped_payment", 0)
                        self.stats["pages_skipped_payment"] += 1
                        skip_category = "payment_required"
                    elif "login" in skipped_reason.lower() or "registration" in skipped_reason.lower():
                        self.stats["pages_skipped_login_only"] += 1
                        skip_category = "login_required"
                    elif "unwanted" in skipped_reason.lower():
                        self.stats["pages_skipped_no_form"] += 1
                        skip_category = "unwanted_page"
                    elif "no_form" in skipped_reason.lower() or "no signup" in skipped_reason.lower():
                        self.stats["pages_skipped_no_form"] += 1
                        skip_category = "no_form"
                    else:
                        self.stats["pages_skipped_no_form"] += 1

                    self._record_result(url, source, "skipped", [],
                                       error_message=f"Skipped by Agent: {skipped_reason}",
                                       error_category=skip_category,
                                       details=error_msg)
                    # Return "quick_skip" for no_form to avoid unnecessary delay
                    return "quick_skip" if skip_category == "no_form" else False

                # Record failure (only if not interrupted)
                errors = result.get("errors", [])
                error_msg = errors[0] if errors else "Form submission failed"  # Use first error as main message
                error_category = result.get("error_category", "unknown")  # Get category from agent
                fields = result.get("fields_filled", [])
                
                # Simple log: failure with reason
                if result.get("stuck_loop_detected"):
                    slog.url_failed("Stuck in error loop (validation rejected)")
                else:
                    short_error = error_msg[:60] if error_msg else "Unknown error"
                    slog.url_failed(short_error)
                
                # Build detailed failure info
                details_parts = [f"Category: {error_category}"]
                details_parts.append(f"Fields filled: {len(fields)}")
                field_types = result.get("field_types_filled", [])
                if field_types:
                    details_parts.append(f"Field types: {', '.join(field_types)}")
                if result.get("stuck_loop_detected"):
                    details_parts.append("Stuck in validation loop")
                if result.get("submit_attempts", 0) > 0:
                    details_parts.append(f"Submit attempts: {result.get('submit_attempts')}")
                if result.get("captcha_attempted"):
                    captcha_status = "solved" if result.get("captcha_solved") else "failed"
                    details_parts.append(f"CAPTCHA: {captcha_status}")
                if len(errors) > 1:
                    details_parts.append(f"Total errors: {len(errors)}")
                details = " | ".join(details_parts)
                
                self._record_result(url, source, "failed", fields, 
                                   error_message=error_msg, 
                                   error_category=error_category,
                                   details=details)
                return False
                
        except Exception as e:
            # Check if exception was due to stop request
            if self._stop_check():
                slog.detail("⏹ Processing interrupted by stop request - leaving URL in pending state")
                self.stats["total_attempts"] -= 1  # Don't count this as an attempt
                return None  # Don't mark as failed - leave in pending state
            
            logger.error(f"Error processing URL: {e}", exc_info=True)
            self._record_result(url, source, "failed", [], 
                               error_message=f"Exception: {str(e)[:150]}",
                               error_category="exception",
                               details=f"Exception type: {type(e).__name__}")
            return False
    
    def _record_result(self, url: str, source: str, status: str, fields_filled: list, 
                       error_message: str = None, error_category: str = None, details: str = None):
        """Record processing result in database."""
        self.db.add_processed_url(
            url=url,
            source=source,
            status=status,
            fields_filled=fields_filled,
            error_message=error_message,
            error_category=error_category,
            details=details
        )
        
        # Also mark as processed in scraped_urls if it was from database
        if source == "database":
            self.db.mark_url_processed(url)
        
        if status == "failed":
            self.stats["failed_attempts"] += 1
            self.stats["errors"].append(error_message or "Unknown error")
    
    def _print_summary(self, elapsed_time: float):
        """Print execution summary."""
        # Calculate totals
        successful = self.stats['successful_signups']
        failed = self.stats['failed_attempts']
        skipped = (self.stats['duplicates_skipped'] + 
                   self.stats['pages_skipped_no_form'] + 
                   self.stats['pages_skipped_login_only'] +
                   self.stats.get('pages_skipped_payment', 0) +
                   self.stats.get('pages_skipped_app_store', 0) +
                   self.stats.get('pages_skipped_load_error', 0))
        
        # Simple summary - always shown
        slog.summary(successful, failed, skipped, elapsed_time)
        
        # Detailed summary - only when detailed logs enabled
        slog.detail("\n" + "="*60)
        slog.detail("📊 EXECUTION SUMMARY")
        slog.detail("="*60)
        slog.detail(f"⏱️  Total time: {elapsed_time:.1f}s ({elapsed_time/60:.1f}m)")
        slog.detail(f"📋 Total attempts: {self.stats['total_attempts']}")
        slog.detail(f"✅ Successful: {successful}")
        slog.detail(f"❌ Failed: {failed}")
        slog.detail(f"⏭️  Duplicates skipped: {self.stats['duplicates_skipped']}")
        slog.detail(f"📄 Skipped (no form): {self.stats['pages_skipped_no_form']}")
        slog.detail(f"🔐 Skipped (login only): {self.stats['pages_skipped_login_only']}")
        slog.detail(f"💳 Skipped (payment): {self.stats.get('pages_skipped_payment', 0)}")
        slog.detail(f"📱 Skipped (app store): {self.stats.get('pages_skipped_app_store', 0)}")
        slog.detail(f"🌐 Skipped (load error): {self.stats.get('pages_skipped_load_error', 0)}")
        slog.detail(f"🔓 CAPTCHAs: {self.stats['captchas_solved']}")
        
        if self.stats['total_attempts'] > 0:
            rate = (successful / self.stats['total_attempts']) * 100
            slog.detail(f"📈 Success rate: {rate:.1f}%")

        # API Cost Summary
        cost_summary = LLMPageAnalyzer.get_cost_summary()
        if cost_summary['total_calls'] > 0:
            slog.detail("")
            slog.detail("💰 API COSTS")
            slog.detail("-" * 40)
            for model, stats in cost_summary['by_model'].items():
                tokens = stats['input_tokens'] + stats['output_tokens']
                slog.detail(f"   {model}: ${stats['cost']:.4f} ({tokens:,} tokens)")
            slog.detail(f"   Total: ${cost_summary['total_cost']:.4f} ({cost_summary['total_calls']} calls)")

            # Also show in simple log (always visible)
            logger.info(f"💰 API Cost: ${cost_summary['total_cost']:.4f} ({cost_summary['total_calls']} calls)")

            # Save costs to database for cumulative tracking
            try:
                # Add 'calls' key for each model (needed by save_api_session_costs)
                for model, stats in cost_summary['by_model'].items():
                    if 'calls' not in stats:
                        stats['calls'] = stats.get('api_calls', 0)
                self.db.save_api_session_costs(cost_summary)
                slog.detail("💾 Session costs saved to database")
            except Exception as e:
                logger.debug(f"Could not save costs to database: {e}")

        slog.detail("="*60)
    
    async def cleanup(self):
        """Cleanup resources."""
        slog.detail("🧹 Cleaning up...")
        if self.browser:
            await self.browser.close()
        slog.detail("👋 Bot stopped")

