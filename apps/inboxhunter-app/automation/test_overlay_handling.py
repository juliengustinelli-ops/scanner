#!/usr/bin/env python3
"""
Test script for overlay handling logic.
Tests the _dismiss_blocking_overlay_before_click functionality in isolation.

Run with: python test_overlay_handling.py
"""

import asyncio
import sys
import io

# Fix Windows encoding issues
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from playwright.async_api import async_playwright

# HTML test page with various overlay scenarios
TEST_HTML = """
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .form-container { margin: 20px 0; }
        input { padding: 10px; margin: 5px; width: 300px; }
        button { padding: 10px 20px; margin: 5px; cursor: pointer; }

        /* Overlay styles - similar to the real "popup-free-course-overlay shown" */
        .popup-free-course-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7);
            z-index: 1000;
            justify-content: center;
            align-items: center;
        }
        .popup-free-course-overlay.shown {
            display: flex;
        }
        .popup-content {
            background: white;
            padding: 30px;
            border-radius: 10px;
            max-width: 400px;
            text-align: center;
        }
        .close-btn {
            position: absolute;
            top: 10px; right: 15px;
            font-size: 24px;
            cursor: pointer;
            background: none;
            border: none;
        }

        /* Status display */
        #status {
            margin-top: 20px;
            padding: 15px;
            background: #f0f0f0;
            border-radius: 5px;
            white-space: pre-wrap;
        }
    </style>
</head>
<body>
    <h1>Overlay Handling Test Page</h1>

    <div class="form-container">
        <h3>Newsletter Signup Form</h3>
        <input type="email" id="email" placeholder="Enter your email">
        <button id="submit-btn">Subscribe</button>
    </div>

    <button id="show-overlay">Show Blocking Overlay</button>
    <button id="show-success-overlay">Show Success Overlay</button>

    <!-- Blocking overlay (similar to integrativehealthcare.org) -->
    <div class="popup-free-course-overlay" id="blocking-overlay">
        <div class="popup-content" style="position: relative;">
            <button class="close-btn" id="overlay-close">&times;</button>
            <h2>Get Our Free Course!</h2>
            <p>Enter your email to receive exclusive content.</p>
            <input type="email" id="popup-email" placeholder="Your email">
            <button id="popup-submit">Get My Free Course</button>
        </div>
    </div>

    <!-- Success overlay -->
    <div class="popup-free-course-overlay" id="success-overlay">
        <div class="popup-content">
            <h2>Thank You!</h2>
            <p>You have successfully subscribed to our newsletter.</p>
            <button onclick="document.getElementById('success-overlay').classList.remove('shown')">Close</button>
        </div>
    </div>

    <div id="status">Status: Ready</div>

    <script>
        // Show blocking overlay when typing in email (simulates real behavior)
        document.getElementById('email').addEventListener('focus', () => {
            setTimeout(() => {
                document.getElementById('blocking-overlay').classList.add('shown');
                updateStatus('Blocking overlay shown (triggered by email focus)');
            }, 500);
        });

        document.getElementById('show-overlay').addEventListener('click', () => {
            document.getElementById('blocking-overlay').classList.add('shown');
            updateStatus('Blocking overlay shown manually');
        });

        document.getElementById('show-success-overlay').addEventListener('click', () => {
            document.getElementById('success-overlay').classList.add('shown');
            updateStatus('Success overlay shown');
        });

        document.getElementById('overlay-close').addEventListener('click', () => {
            document.getElementById('blocking-overlay').classList.remove('shown');
            updateStatus('Overlay closed via close button');
        });

        // Close on click outside
        document.getElementById('blocking-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'blocking-overlay') {
                document.getElementById('blocking-overlay').classList.remove('shown');
                updateStatus('Overlay closed by clicking outside');
            }
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.getElementById('blocking-overlay').classList.remove('shown');
                document.getElementById('success-overlay').classList.remove('shown');
                updateStatus('Overlay closed via Escape key');
            }
        });

        function updateStatus(msg) {
            const status = document.getElementById('status');
            status.textContent = new Date().toISOString() + ': ' + msg + '\\n' + status.textContent;
        }
    </script>
</body>
</html>
"""


async def test_overlay_detection():
    """Test that we can detect various overlay patterns."""

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)  # headless=False to see what's happening
        page = await browser.new_page()

        # Load test page
        await page.set_content(TEST_HTML)
        print("=" * 60)
        print("OVERLAY HANDLING TEST")
        print("=" * 60)

        # Test 1: Detect overlay with 'shown' class
        print("\n[TEST 1] Testing overlay detection with 'shown' class...")
        await page.click("#show-overlay")
        await asyncio.sleep(0.5)

        overlay_info = await page.evaluate("""
            () => {
                const overlaySelectors = [
                    '[class*="overlay"][class*="shown"]',
                    '[class*="overlay"][class*="show"]',
                    '[class*="popup"][class*="shown"]',
                    '[class*="popup"][class*="show"]',
                ];

                for (const selector of overlaySelectors) {
                    const overlay = document.querySelector(selector);
                    if (overlay) {
                        const style = window.getComputedStyle(overlay);
                        // Note: offsetParent is null for position:fixed elements!
                        // So we check display/visibility/opacity instead
                        if (style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0) {
                            return {
                                found: true,
                                selector: selector,
                                className: overlay.className,
                                position: style.position
                            };
                        }
                    }
                }
                return { found: false };
            }
        """)

        if overlay_info.get("found"):
            print(f"  ✅ PASS: Overlay detected!")
            print(f"     Selector: {overlay_info.get('selector')}")
            print(f"     Class: {overlay_info.get('className')}")
        else:
            print("  ❌ FAIL: Overlay NOT detected!")

        # Test 2: Find close button
        print("\n[TEST 2] Testing close button detection...")
        close_info = await page.evaluate("""
            () => {
                const overlay = document.querySelector('[class*="overlay"][class*="shown"]');
                if (!overlay) return { found: false };

                const closeSelectors = [
                    '[class*="close"]',
                    'button.close-btn',
                    '[aria-label*="close"]',
                ];

                for (const sel of closeSelectors) {
                    const btn = overlay.querySelector(sel);
                    if (btn) {
                        return {
                            found: true,
                            selector: sel,
                            text: btn.innerText
                        };
                    }
                }
                return { found: false };
            }
        """)

        if close_info.get("found"):
            print(f"  ✅ PASS: Close button found!")
            print(f"     Selector: {close_info.get('selector')}")
        else:
            print("  ❌ FAIL: Close button NOT found!")

        # Test 3: Actually dismiss the overlay
        print("\n[TEST 3] Testing overlay dismissal via close button...")
        try:
            close_btn = await page.wait_for_selector(".close-btn", timeout=2000)
            await close_btn.click()
            await asyncio.sleep(0.3)

            still_visible = await page.evaluate("""
                () => {
                    const overlay = document.querySelector('#blocking-overlay');
                    return overlay.classList.contains('shown');
                }
            """)

            if not still_visible:
                print("  ✅ PASS: Overlay dismissed via close button!")
            else:
                print("  ❌ FAIL: Overlay still visible after clicking close!")
        except Exception as e:
            print(f"  ❌ FAIL: Error dismissing overlay: {e}")

        # Test 4: Dismiss via Escape key
        print("\n[TEST 4] Testing overlay dismissal via Escape key...")
        await page.click("#show-overlay")
        await asyncio.sleep(0.3)
        await page.keyboard.press("Escape")
        await asyncio.sleep(0.3)

        still_visible = await page.evaluate("""
            () => {
                const overlay = document.querySelector('#blocking-overlay');
                return overlay.classList.contains('shown');
            }
        """)

        if not still_visible:
            print("  ✅ PASS: Overlay dismissed via Escape key!")
        else:
            print("  ❌ FAIL: Overlay still visible after Escape!")

        # Test 5: Dismiss by clicking outside
        print("\n[TEST 5] Testing overlay dismissal by clicking outside...")
        await page.click("#show-overlay")
        await asyncio.sleep(0.3)
        await page.mouse.click(10, 10)  # Click outside
        await asyncio.sleep(0.3)

        still_visible = await page.evaluate("""
            () => {
                const overlay = document.querySelector('#blocking-overlay');
                return overlay.classList.contains('shown');
            }
        """)

        if not still_visible:
            print("  ✅ PASS: Overlay dismissed by clicking outside!")
        else:
            print("  ❌ FAIL: Overlay still visible after clicking outside!")

        # Test 6: Success overlay should NOT be dismissed
        print("\n[TEST 6] Testing that success overlays are detected as success...")
        await page.click("#show-success-overlay")
        await asyncio.sleep(0.3)

        success_info = await page.evaluate("""
            () => {
                const overlay = document.querySelector('[class*="overlay"][class*="shown"]');
                if (!overlay) return { found: false };

                const text = overlay.innerText.toLowerCase();
                const successIndicators = ['thank you', 'success', 'confirmed', 'subscribed'];
                const isSuccess = successIndicators.some(s => text.includes(s));

                return {
                    found: true,
                    isSuccess: isSuccess,
                    text: text.substring(0, 100)
                };
            }
        """)

        if success_info.get("isSuccess"):
            print("  ✅ PASS: Success overlay correctly identified!")
            print(f"     Text: {success_info.get('text')[:50]}...")
        else:
            print("  ❌ FAIL: Success overlay NOT identified as success!")

        print("\n" + "=" * 60)
        print("TEST COMPLETE - Check results above")
        print("=" * 60)

        # Keep browser open for manual inspection
        print("\nBrowser will stay open for 10 seconds for manual inspection...")
        await asyncio.sleep(10)

        await browser.close()


if __name__ == "__main__":
    asyncio.run(test_overlay_detection())
