"""
Deterministic local form test for proof capture functionality.
Creates a controlled local form that we can test repeatedly with predictable behavior.

This test:
1. Starts a local HTTP server with a signup form
2. Submits the form using Playwright
3. Captures proof BEFORE and AFTER submission
4. Verifies the confirmation page is captured correctly
"""

import asyncio
import base64
import sys
import io
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs
from playwright.async_api import async_playwright

# Output directory for test artifacts
OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# Fix Windows console encoding for emojis
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


# HTML for the signup form page
FORM_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Newsletter Signup - Test Form</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            padding: 48px;
            max-width: 450px;
            width: 100%;
        }
        h1 {
            color: #1a202c;
            font-size: 28px;
            margin-bottom: 8px;
            text-align: center;
        }
        .subtitle {
            color: #718096;
            text-align: center;
            margin-bottom: 32px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            color: #4a5568;
            font-weight: 500;
            margin-bottom: 8px;
        }
        input[type="text"],
        input[type="email"] {
            width: 100%;
            padding: 14px 16px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.2s;
        }
        input:focus {
            outline: none;
            border-color: #667eea;
        }
        button[type="submit"] {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        button[type="submit"]:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }
        .privacy {
            text-align: center;
            color: #a0aec0;
            font-size: 12px;
            margin-top: 16px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Join Our Newsletter</h1>
        <p class="subtitle">Get weekly tips delivered to your inbox</p>

        <form action="/submit" method="POST" id="signup-form">
            <div class="form-group">
                <label for="name">Full Name</label>
                <input type="text" id="name" name="name" placeholder="John Doe" required>
            </div>

            <div class="form-group">
                <label for="email">Email Address</label>
                <input type="email" id="email" name="email" placeholder="john@example.com" required>
            </div>

            <button type="submit">Subscribe Now</button>
        </form>

        <p class="privacy">We respect your privacy. Unsubscribe at any time.</p>
    </div>
</body>
</html>
"""

# HTML for the confirmation/thank you page
CONFIRMATION_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Thank You! - Subscription Confirmed</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            padding: 48px;
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        .checkmark {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
        }
        .checkmark svg {
            width: 40px;
            height: 40px;
            stroke: white;
            stroke-width: 3;
        }
        h1 {
            color: #1a202c;
            font-size: 32px;
            margin-bottom: 12px;
        }
        .message {
            color: #4a5568;
            font-size: 18px;
            line-height: 1.6;
            margin-bottom: 24px;
        }
        .email-display {
            background: #f7fafc;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
        }
        .email-display label {
            color: #718096;
            font-size: 14px;
            display: block;
            margin-bottom: 4px;
        }
        .email-display .email {
            color: #2d3748;
            font-size: 18px;
            font-weight: 600;
        }
        .timestamp {
            color: #a0aec0;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="checkmark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        </div>

        <h1>Thank You!</h1>
        <p class="message">
            Your subscription has been confirmed successfully.
            You'll start receiving our newsletter soon!
        </p>

        <div class="email-display">
            <label>Subscribed email:</label>
            <span class="email">{email}</span>
        </div>

        <p class="timestamp">Subscribed on: {timestamp}</p>
    </div>
</body>
</html>
"""


class FormTestHandler(BaseHTTPRequestHandler):
    """HTTP request handler for our test form server."""

    def log_message(self, format, *args):
        """Suppress default logging."""
        pass

    def do_GET(self):
        """Serve the signup form."""
        if self.path == "/" or self.path == "/form":
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(FORM_HTML.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        """Handle form submission and show confirmation."""
        if self.path == "/submit":
            # Read form data
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length).decode('utf-8')

            # Parse form fields
            fields = parse_qs(post_data)
            email = fields.get('email', ['unknown@example.com'])[0]

            # Get current timestamp
            from datetime import datetime
            timestamp = datetime.now().strftime("%B %d, %Y at %I:%M %p")

            # Send confirmation page
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()

            confirmation = CONFIRMATION_HTML.replace("{email}", email).replace("{timestamp}", timestamp)
            self.wfile.write(confirmation.encode())
        else:
            self.send_response(404)
            self.end_headers()


def start_server(port=8765):
    """Start the local HTTP server in a background thread."""
    server = HTTPServer(('localhost', port), FormTestHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


async def run_proof_capture_test():
    """
    Main test: Submit form and capture proof using Playwright events.
    """
    print("\n" + "="*70)
    print("DETERMINISTIC LOCAL FORM TEST - Proof Capture Verification")
    print("="*70)

    # Start local server
    port = 8765
    print(f"\n1. Starting local server on http://localhost:{port}")
    server = start_server(port)
    time.sleep(0.5)  # Give server time to start
    print("   Server started successfully")

    test_email = "test_user@example.com"
    test_name = "Test User"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)  # Visible for debugging
        page = await browser.new_page()

        # Navigate to form
        print(f"\n2. Navigating to form...")
        await page.goto(f"http://localhost:{port}/form", wait_until="networkidle")
        print(f"   Page title: {await page.title()}")

        # Fill the form
        print(f"\n3. Filling form fields...")
        await page.fill('input[name="name"]', test_name)
        print(f"   Filled name: {test_name}")
        await page.fill('input[name="email"]', test_email)
        print(f"   Filled email: {test_email}")

        # Capture BEFORE state
        print(f"\n4. Capturing state BEFORE submission...")
        url_before = page.url
        title_before = await page.title()
        screenshot_before = await page.screenshot(full_page=True)
        (OUTPUT_DIR / "local_test_before_submit.png").write_bytes(screenshot_before)
        print(f"   URL: {url_before}")
        print(f"   Title: {title_before}")
        print(f"   Screenshot size: {len(screenshot_before):,} bytes")
        print(f"   Saved: output/local_test_before_submit.png")

        # Find submit button
        print(f"\n5. Finding submit button...")
        submit_button = await page.query_selector('button[type="submit"]')
        if not submit_button:
            print("   ERROR: Submit button not found!")
            await browser.close()
            server.shutdown()
            return False
        print(f"   Found submit button")

        # Click with PURE EVENT-BASED detection
        print(f"\n6. Clicking submit with pure event-based detection...")
        submission_result = {
            "response_received": False,
            "response_status": None,
            "response_url": None,
        }

        # Set up event listener BEFORE clicking
        captured_response = None

        def on_response(response):
            nonlocal captured_response
            if response.request.method == "POST" and captured_response is None:
                captured_response = response

        page.on("response", on_response)

        try:
            # Click the button
            await submit_button.click()
            print("   Click sent")

            # Wait for network idle - EVENT-BASED (fires when network quiet for 500ms)
            print(f"\n7. Waiting for network idle (event-based)...")
            try:
                await page.wait_for_load_state("networkidle", timeout=10000)
                print("   Network idle")
            except:
                print("   Timeout waiting for network idle")

            # Check what we captured
            if captured_response:
                submission_result["response_received"] = True
                submission_result["response_status"] = captured_response.status
                submission_result["response_url"] = captured_response.url
                print(f"   Captured POST response: {captured_response.status} {captured_response.url}")
            else:
                print("   No POST response captured (form may use different method)")

        finally:
            page.remove_listener("response", on_response)

        # Capture AFTER state
        print(f"\n8. Capturing state AFTER submission...")
        url_after = page.url
        title_after = await page.title()
        screenshot_after = await page.screenshot(full_page=True)
        (OUTPUT_DIR / "local_test_after_submit.png").write_bytes(screenshot_after)
        print(f"   URL: {url_after}")
        print(f"   Title: {title_after}")
        print(f"   Screenshot size: {len(screenshot_after):,} bytes")
        print(f"   Saved: output/local_test_after_submit.png")

        # Look for confirmation indicators
        print(f"\n9. Checking for confirmation indicators...")
        confirmation_text = await page.evaluate("""
            () => {
                const successKeywords = ['thank', 'success', 'confirm', 'welcome', 'subscribed'];
                const elements = document.querySelectorAll('h1, h2, h3, p, div');
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
        print(f"   Found {len(confirmation_text)} confirmation indicators:")
        for text in confirmation_text:
            print(f"      - {text[:60]}...")

        # Check if submitted email is visible
        email_visible = await page.evaluate(f"""
            () => document.body.innerText.includes('{test_email}')
        """)
        print(f"   Submitted email visible on page: {email_visible}")

        # Summary
        print("\n" + "="*70)
        print("TEST RESULTS SUMMARY")
        print("="*70)

        results = {
            "post_response_captured": submission_result["response_received"],
            "response_status": submission_result["response_status"],
            "title_changed": title_before != title_after,
            "confirmation_found": len(confirmation_text) > 0,
            "email_displayed": email_visible,
            "screenshot_size_before": len(screenshot_before),
            "screenshot_size_after": len(screenshot_after),
        }

        print(f"POST response captured:    {results['post_response_captured']}")
        print(f"Response status:           {results['response_status']}")
        print(f"Title changed:             {results['title_changed']} ({title_before} -> {title_after})")
        print(f"Confirmation text found:   {results['confirmation_found']}")
        print(f"Email displayed on page:   {results['email_displayed']}")
        print(f"Screenshot size BEFORE:    {results['screenshot_size_before']:,} bytes")
        print(f"Screenshot size AFTER:     {results['screenshot_size_after']:,} bytes")

        # Determine pass/fail
        all_passed = all([
            results["post_response_captured"],
            results["response_status"] == 200,
            results["title_changed"],
            results["confirmation_found"],
            results["email_displayed"],
        ])

        print("\n" + "-"*70)
        if all_passed:
            print("TEST PASSED - All checks successful!")
            print("The proof capture mechanism correctly detects form submission")
            print("and captures the confirmation page AFTER submission.")
        else:
            print("TEST FAILED - Some checks did not pass")
            print("Review the results above to identify issues.")
        print("-"*70)

        print(f"\nScreenshots saved:")
        print(f"   BEFORE: output/local_test_before_submit.png")
        print(f"   AFTER:  output/local_test_after_submit.png")

        # Keep browser open briefly
        print("\nKeeping browser open for 3 seconds for inspection...")
        await asyncio.sleep(3)

        await browser.close()

    # Shutdown server
    server.shutdown()
    print("\nServer shutdown. Test complete!")

    return all_passed


async def run_ajax_form_test():
    """
    Test form that uses AJAX submission (no page reload).
    This tests our ability to capture proof for SPA-style forms.
    """
    print("\n" + "="*70)
    print("AJAX FORM TEST - No Page Reload")
    print("="*70)

    # AJAX form HTML that doesn't reload the page
    ajax_form_html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>AJAX Form Test</title>
        <style>
            body { font-family: sans-serif; padding: 40px; background: #f0f0f0; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
            h1 { color: #333; margin-bottom: 20px; }
            input { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px; }
            button { width: 100%; padding: 14px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
            #result { margin-top: 20px; padding: 20px; border-radius: 8px; display: none; }
            #result.success { display: block; background: #e8f5e9; color: #2e7d32; }
            #result h2 { margin: 0 0 10px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>AJAX Newsletter Signup</h1>
            <form id="ajax-form">
                <input type="email" name="email" id="email" placeholder="Enter your email" required>
                <button type="submit">Subscribe via AJAX</button>
            </form>
            <div id="result">
                <h2>Success!</h2>
                <p>Thank you for subscribing!</p>
                <p>Email: <strong id="submitted-email"></strong></p>
            </div>
        </div>
        <script>
            document.getElementById('ajax-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('email').value;

                // Simulate AJAX request
                await fetch('/ajax-submit', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                    body: 'email=' + encodeURIComponent(email)
                });

                // Show success message without page reload
                document.getElementById('submitted-email').textContent = email;
                document.getElementById('result').className = 'success';
                document.getElementById('ajax-form').style.display = 'none';
            });
        </script>
    </body>
    </html>
    """

    print("(AJAX form test not implemented in this version)")
    print("The standard form test above validates the core proof capture mechanism.")


if __name__ == "__main__":
    print("Running deterministic local form test...\n")

    success = asyncio.run(run_proof_capture_test())

    sys.exit(0 if success else 1)
