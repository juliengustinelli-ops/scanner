"""
Unit test for proof capture functionality.
Tests that we can properly detect form submission completion using Playwright events
and capture screenshot AFTER the confirmation page appears.
"""

import asyncio
import base64
import sys
import io
from pathlib import Path
from playwright.async_api import async_playwright, Page, Response
from datetime import datetime

# Output directory for test artifacts
OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# Fix Windows console encoding for emojis
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


# Test URLs that we know have signup forms
TEST_URLS = [
    "https://www.scottscheper.com/penpreneur",  # Fast loading
    # "https://www.lobels.com/culinary-club",  # Slower
]

# Test credentials
TEST_EMAIL = "test_proof_capture@example.com"
TEST_NAME = "Test User"


async def capture_proof_after_submission(page: Page) -> dict:
    """
    Capture proof of submission using proper event detection.
    Returns dict with screenshot, confirmation data, and timing info.
    """
    proof = {
        "screenshot_base64": None,
        "page_title": None,
        "page_url": None,
        "confirmation_text": None,
        "captured_at": None,
    }

    try:
        # Wait for network to be idle (form submission completed)
        await page.wait_for_load_state("networkidle", timeout=10000)
        print("  ✅ Network idle - submission completed")
    except Exception as e:
        print(f"  ⚠️ Network still active: {e}")

    # Capture current page state
    proof["page_title"] = await page.title()
    proof["page_url"] = page.url
    proof["captured_at"] = datetime.now().isoformat()

    # Look for confirmation indicators
    try:
        confirmation_text = await page.evaluate("""
            () => {
                const successKeywords = ['thank', 'success', 'confirm', 'welcome', 'subscribed',
                                        'received', 'submitted', 'complete', 'done'];
                const elements = document.querySelectorAll('h1, h2, h3, p, div, span');
                const matches = [];

                for (const el of elements) {
                    const text = (el.innerText || '').toLowerCase();
                    if (successKeywords.some(kw => text.includes(kw)) && text.length < 200) {
                        matches.push(el.innerText.trim().substring(0, 100));
                    }
                }
                return matches.slice(0, 5);
            }
        """)
        proof["confirmation_text"] = confirmation_text
        print(f"  📝 Found {len(confirmation_text)} confirmation indicators")
    except Exception as e:
        print(f"  ⚠️ Could not extract confirmation text: {e}")

    # Capture screenshot
    try:
        screenshot_bytes = await page.screenshot(full_page=True)
        proof["screenshot_base64"] = base64.b64encode(screenshot_bytes).decode('utf-8')
        print(f"  📸 Screenshot captured: {len(proof['screenshot_base64'])} chars")
    except Exception as e:
        print(f"  ❌ Screenshot failed: {e}")

    return proof


async def test_form_submission_with_event_detection():
    """
    Test form submission with proper Playwright event detection.
    This demonstrates how to capture proof AFTER the form actually submits.
    """
    print("\n" + "="*60)
    print("PROOF CAPTURE TEST - Using Playwright Event Detection")
    print("="*60)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)  # Visible for debugging
        page = await browser.new_page()

        test_url = TEST_URLS[0]
        print(f"\n📍 Testing URL: {test_url}")

        # Navigate to page
        print("\n1. Navigating to page...")
        await page.goto(test_url, wait_until="domcontentloaded", timeout=60000)
        print(f"   Page title: {await page.title()}")

        # Find and fill the email field
        print("\n2. Finding and filling form...")
        email_filled = False

        # Try common email field selectors
        email_selectors = [
            'input[type="email"]',
            'input[name="email"]',
            'input[name="EMAIL"]',
            'input[placeholder*="email" i]',
            'input[id*="email" i]',
        ]

        for selector in email_selectors:
            try:
                email_input = await page.wait_for_selector(selector, timeout=2000)
                if email_input:
                    await email_input.fill(TEST_EMAIL)
                    print(f"   ✅ Filled email field: {selector}")
                    email_filled = True
                    break
            except:
                continue

        if not email_filled:
            print("   ❌ Could not find email field!")
            await browser.close()
            return

        # Find submit button
        print("\n3. Finding submit button...")
        submit_selectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("Submit")',
            'button:has-text("Subscribe")',
            'button:has-text("Sign Up")',
            'button:has-text("Join")',
            'input[value*="Get" i]',
            'input[value*="Submit" i]',
            'button:has-text("Get")',
            'a.button:has-text("Get")',
            '.submit-button',
            'form button',
            'form input[type="button"]',
        ]

        submit_button = None
        for selector in submit_selectors:
            try:
                submit_button = await page.wait_for_selector(selector, timeout=2000)
                if submit_button and await submit_button.is_visible():
                    print(f"   ✅ Found submit button: {selector}")
                    break
            except:
                continue

        if not submit_button:
            # Try to find ANY clickable element near the email field
            print("   Trying to find any button on page...")
            try:
                all_buttons = await page.query_selector_all('button, input[type="submit"], input[type="button"], a.button')
                print(f"   Found {len(all_buttons)} buttons on page")
                for i, btn in enumerate(all_buttons[:5]):
                    btn_text = await btn.inner_text() if await btn.is_visible() else "(hidden)"
                    print(f"     {i}: {btn_text[:50] if btn_text else '(no text)'}")
                if all_buttons:
                    submit_button = all_buttons[0]
                    print(f"   Using first button")
            except Exception as e:
                print(f"   Error finding buttons: {e}")

        if not submit_button:
            print("   Could not find submit button!")
            await browser.close()
            return

        # CRITICAL: Capture page state BEFORE clicking
        print("\n4. Capturing state BEFORE submission...")
        url_before = page.url
        content_before = await page.evaluate("document.body.innerText.substring(0, 500)")
        print(f"   URL before: {url_before}")
        print(f"   Content sample: {content_before[:100]}...")

        # Screenshot BEFORE (to compare later)
        screenshot_before = await page.screenshot()
        (OUTPUT_DIR / "test_before_submit.png").write_bytes(screenshot_before)
        print("   📸 Saved: output/test_before_submit.png")

        # PURE EVENT-BASED detection - no blocking timeouts
        print("\n5. Clicking submit with pure event-based detection...")
        print("   Method: Event listener + networkidle")

        submission_response = None
        navigation_occurred = False

        # Set up event listener BEFORE clicking
        captured_response = None

        def on_response(response):
            nonlocal captured_response
            if response.request.method in ["POST", "PUT"] and captured_response is None:
                captured_response = response

        page.on("response", on_response)

        try:
            # Click the button
            await submit_button.click()
            print("   🖱️ Clicked submit button")

            # Wait for network idle - EVENT-BASED (fires when network quiet for 500ms)
            print("\n6. Waiting for network idle (event-based)...")
            try:
                await page.wait_for_load_state("networkidle", timeout=10000)
                print("   ✅ Network idle")
            except:
                print("   ⏳ Network idle timeout")

            # Check what we captured
            if captured_response:
                submission_response = {
                    "url": captured_response.url,
                    "status": captured_response.status,
                    "method": captured_response.request.method,
                }
                print(f"   ✅ Captured response: {captured_response.request.method} {captured_response.status} {captured_response.url[:50]}...")

            # Check if navigation occurred
            if page.url != url_before:
                navigation_occurred = True
                print(f"   ✅ Navigation detected: {url_before} → {page.url}")

        finally:
            page.remove_listener("response", on_response)

        # Check if content changed (indicates something happened)
        content_after = await page.evaluate("document.body.innerText.substring(0, 500)")
        content_changed = content_before != content_after
        print(f"   Content changed: {content_changed}")

        # NOW capture proof (AFTER submission completed)
        print("\n7. Capturing proof AFTER submission...")
        proof = await capture_proof_after_submission(page)

        # Save screenshot AFTER
        if proof["screenshot_base64"]:
            screenshot_after = base64.b64decode(proof["screenshot_base64"])
            (OUTPUT_DIR / "test_after_submit.png").write_bytes(screenshot_after)
            print("   📸 Saved: output/test_after_submit.png")

        # Report results
        print("\n" + "="*60)
        print("TEST RESULTS")
        print("="*60)
        print(f"URL before: {url_before}")
        print(f"URL after:  {proof['page_url']}")
        print(f"URL changed: {url_before != proof['page_url']}")
        print(f"Content changed: {content_changed}")
        print(f"Response captured: {submission_response is not None}")
        print(f"Confirmation text found: {len(proof.get('confirmation_text', [])) > 0}")
        if proof.get('confirmation_text'):
            print(f"  Confirmations: {proof['confirmation_text']}")
        print(f"\n📁 Compare screenshots:")
        print(f"   BEFORE: output/test_before_submit.png")
        print(f"   AFTER:  output/test_after_submit.png")

        # Keep browser open briefly for manual inspection
        print("\n⏳ Keeping browser open for 5 seconds for inspection...")
        await asyncio.sleep(5)

        await browser.close()
        print("\n✅ Test complete!")


async def test_expect_navigation():
    """
    Alternative test using expect_navigation for forms that redirect.
    """
    print("\n" + "="*60)
    print("NAVIGATION TEST - Forms that redirect after submission")
    print("="*60)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        test_url = TEST_URLS[0]
        print(f"\n📍 Testing URL: {test_url}")

        await page.goto(test_url, wait_until="networkidle")

        # Fill form (simplified)
        try:
            await page.fill('input[type="email"], input[name="email"]', TEST_EMAIL, timeout=3000)
            print("✅ Filled email")
        except:
            print("❌ Could not fill email")
            await browser.close()
            return

        # Find submit button
        submit = await page.query_selector('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Subscribe")')
        if not submit:
            print("❌ No submit button found")
            await browser.close()
            return

        print("\n🔄 Using expect_navigation...")
        try:
            async with page.expect_navigation(timeout=15000) as nav_info:
                await submit.click()

            # Navigation completed
            print(f"✅ Navigation completed to: {page.url}")

            # Now capture proof
            screenshot = await page.screenshot(full_page=True)
            (OUTPUT_DIR / "test_after_navigation.png").write_bytes(screenshot)
            print("📸 Saved: output/test_after_navigation.png")

        except Exception as e:
            print(f"⚠️ No navigation occurred: {e}")
            print("   This form may use AJAX submission (no page redirect)")

        await asyncio.sleep(3)
        await browser.close()


if __name__ == "__main__":
    print("Running proof capture tests...\n")

    # Run main test
    asyncio.run(test_form_submission_with_event_detection())

    # Uncomment to run navigation test
    # asyncio.run(test_expect_navigation())
