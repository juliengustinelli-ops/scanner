"""
Meta Ads Library Scraper
Scrapes landing pages from Facebook/Instagram ads.

Enhanced with:
- Smart URL filtering to exclude invalid/tracking URLs
- Pagination support to navigate through multiple pages
- Equal distribution of URLs across keywords
- Target threshold (~80% of max) to ensure good coverage
- Configurable keyword suffixes (e.g., "newsletter", "signup") - user can enable/disable
- Filters out e-commerce, blogs, product pages
"""

import asyncio
import urllib.parse
import re
from typing import List, Dict, Any, Optional, Set
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from loguru import logger


# Domains to skip - not valid landing pages
SKIP_DOMAINS = [
    # Meta/Facebook ecosystem
    "facebook.com", "fb.com", "fb.me", "fbcdn.net", "fbsbx.com",
    "messenger.com", "instagram.com", "threads.net", "meta.com",
    "whatsapp.com", "oculus.com",
    # Meta/Ad transparency and status pages
    "metastatus.com", "transparency.meta.com", "about.meta.com",
    "transparency.fb.com", "about.fb.com",
    # Other social media
    "twitter.com", "x.com", "tiktok.com", "linkedin.com", 
    "pinterest.com", "snapchat.com", "reddit.com", "tumblr.com",
    # Video platforms
    "youtube.com", "youtu.be", "vimeo.com", "dailymotion.com",
    # App stores
    "play.google.com", "apps.apple.com", "itunes.apple.com",
    "microsoft.com/store", "amazon.com/dp/",
    # URL shorteners (often redirect to social media)
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", 
    "buff.ly", "lnkd.in", "rebrand.ly", "short.io",
    # Google services
    "google.com", "googleapis.com", "gstatic.com", "googlesyndication.com",
    # Tracking/Analytics domains
    "doubleclick.net", "googleadservices.com", "facebook.net",
    "fbcdn.com", "connect.facebook.net", "pixel.facebook.com",
    # Ad networks
    "adsrvr.org", "criteo.com", "taboola.com", "outbrain.com",
    # CDNs and infrastructure
    "cloudfront.net", "amazonaws.com", "akamaihd.net",
    # Apple services
    "apple.com", "icloud.com",
    # Document/file hosts
    "docs.google.com", "drive.google.com", "dropbox.com",
    # Status/monitoring pages (not landing pages)
    "status.", "statuspage.io", "atlassian.net/status",
    # News/media sites (not lead gen pages)
    "news.google.com", "news.yahoo.com",
    
    # E-commerce platforms (product pages, not newsletter signups)
    "amazon.com", "ebay.com", "etsy.com", "aliexpress.com", "alibaba.com",
    "walmart.com", "target.com", "bestbuy.com", "costco.com",
    "shopee.com", "lazada.com", "flipkart.com", "myntra.com",
    "wayfair.com", "overstock.com", "homedepot.com", "lowes.com",
    
    # Book/Novel/Reading platforms
    "wattpad.com", "webnovel.com", "royalroad.com", "scribblehub.com",
    "fanfiction.net", "archiveofourown.org", "goodreads.com",
    "kindle.amazon.com", "books.google.com", "audible.com",
    "novelupdates.com", "lightnovelworld.com", "readlightnovel.me",
    
    # Blog platforms (typically not lead gen pages)
    "medium.com", "substack.com", "wordpress.com", "blogger.com",
    "ghost.io", "tumblr.com", "hashnode.dev", "dev.to",
    
    # News sites
    "cnn.com", "bbc.com", "nytimes.com", "washingtonpost.com",
    "theguardian.com", "reuters.com", "forbes.com", "bloomberg.com",
    "huffpost.com", "buzzfeed.com", "vice.com", "vox.com",
    
    # Entertainment/streaming
    "netflix.com", "hulu.com", "disneyplus.com", "hbomax.com",
    "spotify.com", "soundcloud.com", "twitch.tv", "crunchyroll.com",
]

# URL path patterns to skip
SKIP_URL_PATTERNS = [
    r"/login", r"/signin", r"/auth/", r"/oauth",
    r"/share\?", r"/sharer\?", r"/intent/",  # Social sharing URLs
    r"/ads/library", r"/ad_library", r"/ads-library",  # Meta Ads Library itself
    r"/ads-transparency", r"/ad-transparency", r"/transparency",  # Transparency pages
    r"/policies", r"/privacy", r"/terms", r"/legal",
    r"/help/", r"/support/", r"/faq",
    r"/status", r"/uptime", r"/incidents",  # Status pages
    r"/about-ads", r"/about-advertising", r"/advertising-policies",
    r"^https?://[^/]+/?$",  # Just domain with no path (often redirects)
    
    # E-commerce/product page patterns
    r"/product/", r"/products/", r"/item/", r"/items/",
    r"/shop/", r"/store/", r"/buy/", r"/purchase/",
    r"/cart", r"/checkout", r"/basket", r"/bag",
    r"/add-to-cart", r"/add_to_cart",
    r"/order/", r"/orders/", r"/payment",
    r"/wishlist", r"/favorites",
    r"/category/", r"/categories/", r"/collection/", r"/collections/",
    r"/dp/", r"/gp/",  # Amazon product patterns
    r"/p/\d+", r"/sku/",  # Product ID patterns
    
    # Blog/article patterns (not lead gen)
    r"/blog/", r"/article/", r"/post/", r"/news/",
    r"/story/", r"/stories/", r"/read/", r"/chapter/",
    r"/novel/", r"/book/", r"/ebook/",
    r"/\d{4}/\d{2}/",  # Date-based blog URLs like /2024/01/
    
    # Media/entertainment patterns
    r"/watch", r"/video/", r"/videos/", r"/movie/",
    r"/episode/", r"/season/", r"/series/",
    r"/music/", r"/album/", r"/playlist/",
    r"/game/", r"/games/", r"/play/",
]


class MetaAdsScraper:
    """
    Scrapes ad landing pages from Meta Ads Library.

    Features:
    - Stealth browser to avoid detection
    - Smart URL filtering to exclude invalid pages
    - Pagination to get more results
    - Equal distribution across keywords
    - Target threshold (~80% of max) for good coverage
    - Configurable keyword suffixes (user can enable/disable each)
    - Filters out e-commerce, blogs, and product pages
    """

    # Target percentage of max_ads to aim for
    TARGET_PERCENTAGE = 0.80

    # Maximum pages to navigate per keyword
    MAX_PAGES_PER_KEYWORD = 5

    # Scroll iterations per page
    SCROLLS_PER_PAGE = 8

    def __init__(self, keywords: List[str], max_ads: int = 100, headless: bool = False, keyword_suffixes: List[Dict] = None):
        # Clean keywords
        raw_keywords = [k.strip() for k in keywords if k.strip()]

        # Store enabled suffixes from config (default to empty if not provided)
        self.enabled_suffixes = []
        if keyword_suffixes:
            self.enabled_suffixes = [s.get('suffix', '') for s in keyword_suffixes if s.get('enabled', False)]

        # Transform keywords using enabled suffixes
        # e.g., with "newsletter" enabled: "makeup" -> "makeup newsletter"
        self.keywords = self._enhance_keywords_with_suffixes(raw_keywords)
        self.original_keywords = raw_keywords  # Keep originals for reference
        
        self.max_ads = max_ads
        self.target_ads = int(max_ads * self.TARGET_PERCENTAGE)  # Target ~80%
        self.headless = headless
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.seen_urls: Set[str] = set()  # Track URLs across all keywords
    
    def _enhance_keywords_with_suffixes(self, keywords: List[str]) -> List[str]:
        """
        Enhance keywords with user-configured suffixes.

        Strategy:
        1. For each enabled suffix, append it to keywords that don't already contain it
        2. Only applies enabled suffixes from user configuration

        Example with "newsletter" enabled:
        - "makeup" -> "makeup newsletter"
        - "marketing tips" -> "marketing tips newsletter"

        If no suffixes are enabled, keywords are used as-is.
        """
        # If no suffixes enabled, return keywords unchanged
        if not self.enabled_suffixes:
            logger.info("   📝 No keyword suffixes enabled - using keywords as-is")
            return keywords

        enhanced = []
        suffix_str = ", ".join(self.enabled_suffixes)
        logger.info(f"   📧 Enabled suffixes: {suffix_str}")

        for keyword in keywords:
            keyword_lower = keyword.lower()

            # Check if keyword already contains any of the enabled suffixes
            already_has_suffix = any(suffix.lower() in keyword_lower for suffix in self.enabled_suffixes)

            if already_has_suffix:
                enhanced.append(keyword)
                logger.info(f"   📝 Keyword '{keyword}' already contains a suffix")
            else:
                # Apply all enabled suffixes (join them)
                # For simplicity, we add all enabled suffixes to the keyword
                # e.g., with ["newsletter", "signup"] enabled: "makeup" -> "makeup newsletter signup"
                suffix_combined = " ".join(self.enabled_suffixes)
                enhanced_keyword = f"{keyword} {suffix_combined}"
                enhanced.append(enhanced_keyword)
                logger.info(f"   📧 Enhanced: '{keyword}' → '{enhanced_keyword}'")

        return enhanced
    
    async def initialize(self):
        """Initialize browser for scraping with stealth features."""
        logger.info("🌐 Initializing Meta Ads scraper...")
        
        self.playwright = await async_playwright().start()
        
        # Launch with stealth args
        launch_args = [
            "--disable-blink-features=AutomationControlled",
            "--disable-features=IsolateOrigins,site-per-process",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--window-size=1920,1080",
        ]
        
        try:
            self.browser = await self.playwright.chromium.launch(
                headless=self.headless,
                args=launch_args
            )
        except Exception as e:
            logger.warning(f"⚠️ Bundled browser not found, trying system Chrome: {e}")
            self.browser = await self.playwright.chromium.launch(
                headless=self.headless,
                channel="chrome",
                args=launch_args
            )
        
        # Create context with realistic settings
        self.context = await self.browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="en-US",
            timezone_id="America/New_York",
        )
        
        # Add stealth script
        await self.context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            window.chrome = { runtime: {} };
        """)
        
        self.page = await self.context.new_page()
        
        # Set default timeout
        self.page.set_default_timeout(60000)
        
        logger.success("✅ Meta Ads scraper ready")
    
    async def scrape(self) -> List[Dict[str, Any]]:
        """
        Scrape landing pages from Meta Ads Library.
        
        Features:
        - Equal distribution of URLs across keywords
        - Target ~80% of max_ads for good coverage
        - Pagination to get more results
        - Newsletter focus: Keywords enhanced with "newsletter" suffix
        
        Returns:
            List of URL dictionaries
        """
        all_ads = []
        
        if not self.keywords:
            logger.warning("⚠️ No keywords provided for Meta Ads scraping")
            return []
        
        # Calculate URLs per keyword for equal distribution
        num_keywords = len(self.keywords)
        urls_per_keyword = max(5, self.target_ads // num_keywords)  # At least 5 per keyword
        
        logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        logger.info("📧 Newsletter-Focused Meta Ads Scraping")
        logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        logger.info(f"📝 Original keywords: {', '.join(self.original_keywords)}")
        logger.info(f"🔍 Enhanced keywords: {', '.join(self.keywords)}")
        logger.info(f"🎯 Target: {self.target_ads} URLs (~{int(self.TARGET_PERCENTAGE*100)}% of {self.max_ads})")
        logger.info(f"📊 Distribution: ~{urls_per_keyword} URLs per keyword")
        logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        for keyword_idx, keyword in enumerate(self.keywords):
            logger.info(f"🔍 [{keyword_idx+1}/{num_keywords}] Searching for: '{keyword}'")
            
            try:
                # Calculate remaining URLs needed for equal distribution
                remaining_keywords = num_keywords - keyword_idx
                remaining_target = self.target_ads - len(all_ads)
                keyword_target = max(5, remaining_target // remaining_keywords)
                
                ads = await self._scrape_keyword(keyword, target_count=keyword_target)
                all_ads.extend(ads)
                logger.info(f"   ✅ Found {len(ads)} valid landing page URLs for '{keyword}'")
                logger.info(f"   📊 Total collected: {len(all_ads)}/{self.target_ads} target")
                
                # Check if we've reached the overall target
                if len(all_ads) >= self.target_ads:
                    logger.success(f"🎯 Reached target ({self.target_ads} URLs)")
                    break
                
                # Small delay between keywords
                if keyword != self.keywords[-1]:
                    await asyncio.sleep(2)
                    
            except Exception as e:
                logger.error(f"❌ Error scraping '{keyword}': {e}")
                continue
        
        # Final deduplication (should already be unique due to seen_urls tracking)
        unique_ads = []
        final_seen = set()
        for ad in all_ads:
            url = self._normalize_url(ad.get("url", ""))
            if url and url not in final_seen:
                final_seen.add(url)
                unique_ads.append(ad)
        
        final_count = len(unique_ads)
        coverage = (final_count / self.max_ads) * 100 if self.max_ads > 0 else 0
        
        logger.info(f"📊 Total unique URLs found: {final_count}")
        logger.info(f"📈 Coverage: {coverage:.0f}% of max ({final_count}/{self.max_ads})")
        
        return unique_ads[:self.max_ads]
    
    async def _scrape_keyword(self, keyword: str, target_count: int = 20) -> List[Dict[str, Any]]:
        """
        Scrape ads for a single keyword with pagination support.
        
        Args:
            keyword: Search keyword
            target_count: Target number of URLs to collect for this keyword
            
        Returns:
            List of ad dictionaries with URLs
        """
        ads = []
        page_num = 1
        
        # URL encode the keyword
        encoded_keyword = urllib.parse.quote(keyword)
        
        # Navigate to Meta Ads Library
        search_url = f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q={encoded_keyword}&search_type=keyword_unordered&media_type=all"
        
        logger.info(f"📡 Navigating to: {search_url}")
        
        try:
            # Navigate with longer timeout
            response = await self.page.goto(search_url, wait_until="domcontentloaded", timeout=60000)
            
            if response:
                logger.info(f"   Response status: {response.status}")
            
            # Wait for page to stabilize
            await asyncio.sleep(5)
            
            # Check if we hit a login/cookie wall
            current_url = self.page.url
            logger.info(f"   Current URL: {current_url}")
            
            if "login" in current_url.lower() or "checkpoint" in current_url.lower():
                logger.warning("⚠️ Hit login wall - Meta Ads Library may require authentication")
                return ads
            
            # Try to close any cookie dialogs
            await self._close_cookie_dialogs()
            
            # Pagination loop - keep scrolling/loading until we have enough URLs
            while len(ads) < target_count and page_num <= self.MAX_PAGES_PER_KEYWORD:
                logger.info(f"   📄 Scanning page section {page_num}/{self.MAX_PAGES_PER_KEYWORD}...")
                
                # Wait for ads to load
                await asyncio.sleep(2)
                
                # Extract links from current view
                new_links = await self._extract_landing_page_links()
                
                # Filter, score, and add new valid URLs
                scored_links = []
                for link in new_links:
                    normalized = self._normalize_url(link)
                    if normalized and normalized not in self.seen_urls:
                        if self._is_valid_landing_page(link):
                            score = self._score_url_for_newsletter(link)
                            scored_links.append((link, normalized, score))
                
                # Sort by score (highest first) - prioritize newsletter-like URLs
                scored_links.sort(key=lambda x: x[2], reverse=True)
                
                new_count = 0
                skipped_low_score = 0
                for link, normalized, score in scored_links:
                    # Skip URLs with very negative scores (likely product/blog pages)
                    if score < -3:
                        skipped_low_score += 1
                        logger.debug(f"   ⏭️ Skipped (score={score}): {link[:60]}...")
                        continue
                    
                    self.seen_urls.add(normalized)
                    ads.append({
                        "url": link,
                        "source": "meta_ads",
                        "keyword": keyword,
                        "newsletter_score": score
                    })
                    new_count += 1
                    
                    if score >= 2:
                        logger.debug(f"   ⭐ Good match (score={score}): {link[:60]}...")
                    
                    if len(ads) >= target_count:
                        break
                
                logger.info(f"   Found {new_count} new valid URLs (skipped {skipped_low_score} low-score)")
                logger.info(f"   Total collected: {len(ads)}/{target_count} target")
                
                # If we found enough or no new URLs, stop
                if len(ads) >= target_count:
                    break
                
                if new_count == 0 and page_num > 1:
                    logger.info(f"   No new URLs found, stopping pagination")
                    break
                
                # Scroll down to load more ads (pagination via infinite scroll)
                await self._scroll_for_more_ads()
                page_num += 1
            
            logger.info(f"   ✅ Collected {len(ads)} URLs for '{keyword}'")
            
        except Exception as e:
            logger.error(f"❌ Scrape error for '{keyword}': {e}")
            try:
                await self.page.screenshot(path=f"error_meta_{keyword[:20]}.png")
                logger.info(f"   Screenshot saved for debugging")
            except:
                pass
        
        return ads
    
    async def _close_cookie_dialogs(self):
        """Try to close any cookie consent dialogs."""
        try:
            cookie_selectors = [
                'button[data-cookiebanner="accept_button"]',
                'button:has-text("Accept All")',
                'button:has-text("Accept")',
                'button:has-text("Allow")',
                'button:has-text("Allow All")',
                'button:has-text("OK")',
                '[aria-label="Allow all cookies"]',
                '[aria-label="Accept all"]',
            ]
            
            for selector in cookie_selectors:
                try:
                    btn = await self.page.query_selector(selector)
                    if btn and await btn.is_visible():
                        await btn.click()
                        logger.info("   🍪 Closed cookie dialog")
                        await asyncio.sleep(1)
                        break
                except:
                    continue
        except Exception:
            pass
    
    async def _scroll_for_more_ads(self):
        """Scroll down to trigger loading more ads."""
        for i in range(self.SCROLLS_PER_PAGE):
            await self.page.evaluate("window.scrollBy(0, 800)")
            await asyncio.sleep(0.8)
        
        # Brief pause to let content load
        await asyncio.sleep(2)
    
    async def _extract_landing_page_links(self) -> List[str]:
        """
        Extract landing page URLs from the current page state.
        Uses multiple extraction methods for better coverage.
        """
        links = await self.page.evaluate("""
            () => {
                const links = new Set();
                
                // ===== METHOD 1: Facebook redirect links (l.facebook.com/l.php) =====
                // These are the most reliable - they contain the actual destination
                document.querySelectorAll('a[href*="l.facebook.com/l.php"]').forEach(a => {
                    try {
                        const url = new URL(a.href);
                        const destination = url.searchParams.get('u');
                        if (destination) {
                            links.add(decodeURIComponent(destination));
                        }
                    } catch (e) {}
                });
                
                // ===== METHOD 2: External links with target="_blank" =====
                document.querySelectorAll('a[target="_blank"]').forEach(a => {
                    const href = a.href;
                    if (href && href.startsWith('http')) {
                        // Skip Meta/Facebook domains
                        if (!href.includes('facebook.com') && 
                            !href.includes('fb.com') && 
                            !href.includes('instagram.com') &&
                            !href.includes('fb.me') &&
                            !href.includes('meta.com')) {
                            links.add(href);
                        }
                    }
                });
                
                // ===== METHOD 3: Links inside ad cards =====
                // Look for ad containers and extract their CTAs
                const adCardSelectors = [
                    '[data-pagelet*="AdLibrary"]',
                    '[class*="ad_library"]',
                    '[class*="AdLibrary"]',
                    '[role="article"]',
                ];
                
                adCardSelectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(card => {
                        card.querySelectorAll('a[href]').forEach(a => {
                            const href = a.href;
                            if (href && href.startsWith('http') &&
                                !href.includes('facebook.com') &&
                                !href.includes('fb.com') &&
                                !href.includes('instagram.com')) {
                                links.add(href);
                            }
                        });
                    });
                });
                
                // ===== METHOD 4: CTA buttons with external links =====
                // Prioritize newsletter/signup related CTAs
                const ctaTexts = [
                    // Newsletter-focused CTAs (highest priority)
                    'subscribe', 'sign up', 'signup', 'join', 'join now',
                    'get updates', 'stay updated', 'get newsletter', 
                    'join newsletter', 'email updates', 'get free',
                    'free guide', 'free ebook', 'free download', 'free access',
                    'claim free', 'get instant access', 'unlock', 'access now',
                    // Lead magnet CTAs
                    'get started', 'start free', 'try free', 'get your copy',
                    'download now', 'download free', 'claim now', 'claim yours',
                    // General signup CTAs
                    'learn more', 'get offer', 'register', 'register now',
                    'apply now', 'get quote', 'contact us', 'book now',
                ];
                
                document.querySelectorAll('a[role="link"], a.btn, a[class*="button"]').forEach(a => {
                    const text = (a.innerText || '').toLowerCase();
                    const href = a.href;
                    
                    if (href && href.startsWith('http') &&
                        !href.includes('facebook.com') &&
                        !href.includes('fb.com')) {
                        // Check if it looks like a CTA
                        if (ctaTexts.some(cta => text.includes(cta))) {
                            links.add(href);
                        }
                    }
                });
                
                // ===== METHOD 5: Look for sponsored content links =====
                document.querySelectorAll('[data-tracking], [data-ad], [data-sponsored]').forEach(elem => {
                    const a = elem.closest('a') || elem.querySelector('a');
                    if (a && a.href && a.href.startsWith('http') &&
                        !a.href.includes('facebook.com')) {
                        links.add(a.href);
                    }
                });
                
                return Array.from(links);
            }
        """)
        
        logger.debug(f"   Extracted {len(links)} raw links from page")
        return links
    
    def _is_valid_landing_page(self, url: str) -> bool:
        """
        Check if URL is a valid landing page worth processing.
        
        Filters out:
        - Social media domains
        - App stores
        - Tracking/redirect URLs
        - Short URLs that often redirect to social media
        - Login/authentication pages
        - Policy/legal pages
        """
        if not url or not url.startswith("http"):
            return False
        
        url_lower = url.lower()
        
        # 1. Check against skip domains
        for domain in SKIP_DOMAINS:
            if domain in url_lower:
                return False
        
        # 2. Check against skip URL patterns
        for pattern in SKIP_URL_PATTERNS:
            if re.search(pattern, url_lower):
                return False
        
        # 3. Additional validation
        try:
            parsed = urllib.parse.urlparse(url)
            
            # Must have a valid domain
            if not parsed.netloc or len(parsed.netloc) < 4:
                return False
            
            # Skip if no path (just domain - often redirect pages)
            # Exception: allow if it looks like a real website
            if not parsed.path or parsed.path == "/":
                # Allow if domain looks legitimate (has subdomain or TLD)
                domain_parts = parsed.netloc.split(".")
                if len(domain_parts) < 2:
                    return False
            
            # Skip if URL is just tracking parameters
            if len(parsed.path) < 2 and len(parsed.query) > 100:
                return False
            
            # Skip data URLs
            if parsed.scheme in ["data", "javascript", "mailto", "tel"]:
                return False
            
        except Exception:
            return False
        
        # 4. Skip URLs that look like tracking/redirect URLs
        tracking_indicators = [
            "utm_redirect", "redirect_url", "goto=", "redir=",
            "click?", "track?", "tracking/", "click/",
            "/r/", "/redirect/", "/go/", "/out/",
            "clickserver", "adclick", "adsredirect",
        ]
        for indicator in tracking_indicators:
            if indicator in url_lower:
                return False
        
        # 5. Must have a reasonable domain (not just numbers/IPs)
        try:
            domain = urllib.parse.urlparse(url).netloc
            # Skip IP addresses
            if re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}", domain):
                return False
            # Skip localhost
            if domain.startswith("localhost") or domain.startswith("127."):
                return False
        except:
            pass
        
        return True
    
    def _score_url_for_newsletter(self, url: str) -> int:
        """
        Score a URL based on how likely it is to be a newsletter signup page.
        Higher score = more likely to be a good newsletter/signup page.
        
        Returns:
            Score from -10 to +10
        """
        if not url:
            return -10
        
        url_lower = url.lower()
        score = 0
        
        # Positive signals (newsletter/signup related)
        positive_patterns = [
            (r"newsletter", 3),
            (r"subscribe", 3),
            (r"signup|sign-up|sign_up", 3),
            (r"join", 2),
            (r"optin|opt-in|opt_in", 3),
            (r"lead|leadmagnet|lead-magnet", 2),
            (r"free[-_]?(guide|ebook|download|report|course|training)", 3),
            (r"get[-_]?(started|access|updates)", 2),
            (r"register", 2),
            (r"landing", 1),
            (r"lp/|/lp", 1),  # Landing page abbreviation
            (r"email", 1),
            (r"list", 1),
            (r"webinar", 2),
            (r"masterclass", 2),
            (r"challenge", 1),
        ]
        
        for pattern, points in positive_patterns:
            if re.search(pattern, url_lower):
                score += points
        
        # Negative signals (e-commerce/blog related)
        negative_patterns = [
            (r"/product", -3),
            (r"/shop", -2),
            (r"/store", -2),
            (r"/buy", -3),
            (r"/cart", -4),
            (r"/checkout", -4),
            (r"/blog", -2),
            (r"/article", -2),
            (r"/post/", -2),
            (r"/news/", -2),
            (r"/\d{4}/\d{2}/", -3),  # Date-based blog URLs
            (r"/category", -1),
            (r"/tag/", -1),
            (r"/novel", -4),
            (r"/book", -2),
            (r"/chapter", -4),
            (r"/read/", -3),
            (r"/watch", -3),
            (r"/video", -2),
        ]
        
        for pattern, points in negative_patterns:
            if re.search(pattern, url_lower):
                score += points  # points are already negative
        
        return max(-10, min(10, score))
    
    def _normalize_url(self, url: str) -> str:
        """
        Normalize URL for deduplication.
        Removes tracking parameters and normalizes format.
        """
        if not url:
            return ""
        
        try:
            parsed = urllib.parse.urlparse(url)
            
            # Remove common tracking parameters
            tracking_params = [
                'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
                'fbclid', 'gclid', 'msclkid', 'dclid',
                'ref', 'source', 'campaign_id', 'ad_id', 'adset_id',
                'mc_cid', 'mc_eid', '_ga', '_gl',
            ]
            
            if parsed.query:
                params = urllib.parse.parse_qs(parsed.query)
                # Remove tracking params
                filtered_params = {k: v for k, v in params.items() 
                                  if k.lower() not in tracking_params}
                new_query = urllib.parse.urlencode(filtered_params, doseq=True)
            else:
                new_query = ""
            
            # Rebuild URL without tracking params
            normalized = urllib.parse.urlunparse((
                parsed.scheme,
                parsed.netloc.lower(),  # Lowercase domain
                parsed.path.rstrip('/'),  # Remove trailing slash
                parsed.params,
                new_query,
                ''  # Remove fragment
            ))
            
            return normalized
            
        except Exception:
            return url.lower().rstrip('/')
    
    async def close(self):
        """Close browser."""
        try:
            if self.context:
                await self.context.close()
            if self.browser:
                await self.browser.close()
            if self.playwright:
                await self.playwright.stop()
            logger.info("Meta Ads scraper closed")
        except Exception as e:
            logger.warning(f"Error closing scraper: {e}")
