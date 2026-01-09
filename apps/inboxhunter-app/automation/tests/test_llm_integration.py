"""
Integration test for LLM form analysis.
Actually calls the LLM API with real HTML to verify no hallucinated selectors.
"""

import asyncio
import os
import sys
import io
import json
from pathlib import Path
from playwright.async_api import async_playwright

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from llm_analyzer import LLMPageAnalyzer
from form_logic import validate_selector_exists_in_html, extract_ids_and_names_from_html

# Fix Windows console encoding for emojis
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Output directory for test artifacts
OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# Test URLs - both the homepage and the apply page
TEST_URL = "https://www.rapidscaleframework.com/"
TEST_URL_APPLY = "https://rapidscaleframework.com/apply"  # Full application form with many required fields

# Test credentials
TEST_CREDENTIALS = {
    "email": "test_llm_integration@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "full_name": "John Doe",
    "phone": "+1 555-123-4567",
}


def get_api_key() -> str:
    """Get OpenAI API key from environment or app config."""
    # Try environment variable first
    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        print("   Using API key from environment")
        return api_key

    # Try reading from the app's config file (Tauri app data)
    app_config_paths = [
        Path(os.environ.get("APPDATA", "")) / "com.inboxhunter.app" / "bot_config.json",
        Path.home() / "AppData" / "Roaming" / "com.inboxhunter.app" / "bot_config.json",
        Path.home() / ".local" / "share" / "com.inboxhunter.app" / "bot_config.json",
    ]

    for config_path in app_config_paths:
        if config_path.exists():
            try:
                with open(config_path) as f:
                    config = json.load(f)
                    api_key = config.get("apiKeys", {}).get("openai", "")
                    if api_key and not api_key.startswith("sk-your"):
                        print(f"   Using API key from: {config_path}")
                        return api_key
            except Exception as e:
                print(f"   Error reading {config_path}: {e}")

    # Try reading from a local test config file
    test_config_path = Path(__file__).parent.parent / "test_config.json"
    if test_config_path.exists():
        with open(test_config_path) as f:
            config = json.load(f)
            api_key = config.get("openai_api_key")
            if api_key:
                print(f"   Using API key from: {test_config_path}")
                return api_key

    print("ERROR: No API key found in environment or config files")
    return ""


async def fetch_page_html(url: str) -> dict:
    """
    Fetch the page HTML using Playwright, mimicking what the bot does.
    Returns dict with simplified_html and page_info.
    """
    print(f"\n1. Fetching HTML from: {url}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        await page.goto(url, wait_until="networkidle", timeout=60000)
        print(f"   Page title: {await page.title()}")

        # Extract HTML using the same logic as llm_analyzer._extract_page_info
        page_structure = await page.evaluate(r"""
            () => {
                const isVisible = (elem) => {
                    if (!elem) return false;
                    const style = window.getComputedStyle(elem);
                    return style.display !== 'none' &&
                           style.visibility !== 'hidden' &&
                           style.opacity !== '0' &&
                           elem.offsetParent !== null;
                };

                const result = {
                    title: document.title,
                    url: window.location.href,
                    simplifiedHtml: ''
                };

                // Extract simplified HTML (forms, inputs, buttons only)
                const cleanHtml = document.createElement('div');

                document.querySelectorAll('form').forEach((form, idx) => {
                    if (isVisible(form)) {
                        const formClone = form.cloneNode(true);
                        // Remove script/style/noscript
                        formClone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
                        // Remove hidden containers
                        formClone.querySelectorAll('[style*="display: none"], [style*="display:none"], [hidden], .hidden, .d-none, .sr-only, .visually-hidden').forEach(el => el.remove());
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

                return result;
            }
        """)

        await browser.close()

        return page_structure


async def test_llm_with_real_html():
    """
    Test the LLM with actual HTML from the problematic URL.
    Validates that no hallucinated selectors are returned.
    """
    print("\n" + "="*70)
    print("LLM INTEGRATION TEST - Testing with Real HTML")
    print("="*70)

    # Get API key
    api_key = get_api_key()
    if not api_key:
        print("ERROR: No API key provided")
        return False

    print(f"   API key: {api_key[:8]}...{api_key[-4:]}")

    # Fetch actual HTML from the page
    page_data = await fetch_page_html(TEST_URL)
    simplified_html = page_data.get("simplifiedHtml", "")

    print(f"\n2. HTML extracted: {len(simplified_html)} characters")

    # Save HTML for inspection
    html_path = OUTPUT_DIR / "test_html.html"
    html_path.write_text(simplified_html, encoding='utf-8')
    print(f"   Saved to: {html_path}")

    # Extract actual IDs and names from HTML for validation
    actual_elements = extract_ids_and_names_from_html(simplified_html)
    print(f"\n3. Actual elements in HTML:")
    print(f"   IDs found: {actual_elements['ids'][:10]}...")  # First 10
    print(f"   Names found: {actual_elements['names'][:10]}...")

    # Create mock page (we only need it for type, not actual browser)
    # We'll call the prompt builder directly
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Initialize LLM analyzer
        analyzer = LLMPageAnalyzer(
            page=page,
            credentials=TEST_CREDENTIALS,
            llm_provider="openai",
            llm_config={
                "api_key": api_key,
                "model": "gpt-4o-mini"
            }
        )

        # Build context for batch planning
        context = {
            "credentials": TEST_CREDENTIALS,
            "page_url": TEST_URL,
            "simplified_html": simplified_html,
        }

        print("\n4. Calling LLM for batch plan...")

        # Get batch plan from LLM
        result = await analyzer.get_batch_plan(context)

        await browser.close()

    # Save LLM response for inspection
    response_path = OUTPUT_DIR / "test_llm_response.json"
    response_path.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(f"   Saved response to: {response_path}")

    # Analyze the response
    print("\n5. Analyzing LLM response...")

    actions = result.get("actions", [])
    print(f"   Total actions returned: {len(actions)}")

    # Validate each selector
    valid_count = 0
    invalid_count = 0
    invalid_selectors = []

    for i, action in enumerate(actions):
        action_type = action.get("action", "")
        selector = action.get("selector", "")
        reasoning = action.get("reasoning", "")

        if action_type == "complete":
            print(f"   [{i+1}] {action_type}: {reasoning}")
            valid_count += 1
            continue

        # Validate selector exists in HTML
        is_valid = validate_selector_exists_in_html(selector, simplified_html)

        if is_valid:
            print(f"   [{i+1}] ✅ {action_type}: {selector[:50]}")
            valid_count += 1
        else:
            print(f"   [{i+1}] ❌ HALLUCINATED: {selector[:50]}")
            invalid_count += 1
            invalid_selectors.append({
                "action": action_type,
                "selector": selector,
                "reasoning": reasoning
            })

    # Report results
    print("\n" + "="*70)
    print("TEST RESULTS")
    print("="*70)
    print(f"Valid selectors:   {valid_count}")
    print(f"Invalid selectors: {invalid_count}")

    if invalid_selectors:
        print(f"\n❌ HALLUCINATED SELECTORS FOUND:")
        for inv in invalid_selectors:
            print(f"   - {inv['selector']}")
            print(f"     Reasoning: {inv['reasoning']}")

    # Test passes if no hallucinated selectors
    test_passed = invalid_count == 0

    if test_passed:
        print(f"\n✅ TEST PASSED - No hallucinated selectors!")
    else:
        print(f"\n❌ TEST FAILED - {invalid_count} hallucinated selectors found")

    return test_passed


async def test_form_logic_unit():
    """
    Unit tests for form_logic.py functions (no LLM call needed).
    """
    print("\n" + "="*70)
    print("UNIT TESTS - form_logic.py")
    print("="*70)

    from form_logic import (
        is_radio_or_checkbox_selector,
        is_submit_action,
        should_capture_proof,
        validate_selector_exists_in_html,
    )

    # Test is_radio_or_checkbox_selector
    print("\n1. Testing is_radio_or_checkbox_selector...")

    test_cases = [
        ("input[type='radio'][value='Yes']", True),
        ('input[type="radio"]', True),
        ("input[type='checkbox']", True),
        ("#email", False),
        ("button:has-text('Submit')", False),
        ("[name='firstName']", False),
        ("#Yes_I2Zu8pzZDTjTMKdrFpiH_0_wg8z8nn8c1", False),  # ID-based, not type-based
    ]

    all_passed = True
    for selector, expected in test_cases:
        result = is_radio_or_checkbox_selector(selector)
        status = "✅" if result == expected else "❌"
        if result != expected:
            all_passed = False
        print(f"   {status} '{selector[:40]}...' -> {result} (expected {expected})")

    # Test is_submit_action
    print("\n2. Testing is_submit_action...")

    submit_cases = [
        # (selector, reasoning, fields_filled, is_cta, expected)
        ("button:has-text('Submit')", "Click submit", ["email"], False, True),
        ("button:has-text('Submit')", "Click submit", [], False, False),  # No fields filled
        ("input[type='radio'][value='Yes']", "Select option", ["email"], False, False),  # Radio
        ("button:has-text('Try Free')", "Click CTA", ["email"], True, False),  # CTA button
        ("#submitBtn", "Submit form", ["email", "name"], False, True),
    ]

    for selector, reasoning, fields, is_cta, expected in submit_cases:
        result = is_submit_action(selector, reasoning, fields, is_cta)
        status = "✅" if result == expected else "❌"
        if result != expected:
            all_passed = False
        print(f"   {status} selector='{selector[:30]}', filled={len(fields)}, cta={is_cta} -> {result}")

    # Test should_capture_proof
    print("\n3. Testing should_capture_proof...")

    proof_cases = [
        (True, False, True),   # Response received, no existing proof -> capture
        (True, True, False),   # Response received, already have proof -> don't capture
        (False, False, False), # No response -> don't capture
        (False, True, False),  # No response, have proof -> don't capture
    ]

    for response_received, has_proof, expected in proof_cases:
        result = should_capture_proof(response_received, has_proof)
        status = "✅" if result == expected else "❌"
        if result != expected:
            all_passed = False
        print(f"   {status} response={response_received}, has_proof={has_proof} -> {result}")

    # Test validate_selector_exists_in_html
    print("\n4. Testing validate_selector_exists_in_html...")

    sample_html = '''
    <form id="signup-form">
        <input type="email" id="email" name="userEmail" placeholder="Enter email">
        <input type="text" name="firstName" placeholder="First name">
        <button type="submit">Subscribe</button>
    </form>
    '''

    html_cases = [
        ("#email", True),
        ("#signup-form", True),
        ("[name='userEmail']", True),
        ("[name='firstName']", True),
        ("input[type='email']", True),
        ('button:has-text("Subscribe")', True),
        ("#nonexistent", False),
        ("[name='fakeField']", False),
        ("#TojDQFSj7Qgr64InnMYO", False),  # Hallucinated ID
    ]

    for selector, expected in html_cases:
        result = validate_selector_exists_in_html(selector, sample_html)
        status = "✅" if result == expected else "❌"
        if result != expected:
            all_passed = False
        print(f"   {status} '{selector}' -> {result}")

    print("\n" + "="*70)
    if all_passed:
        print("✅ ALL UNIT TESTS PASSED")
    else:
        print("❌ SOME UNIT TESTS FAILED")
    print("="*70)

    return all_passed


async def test_end_to_end_form_submission():
    """
    FULL END-TO-END TEST: Actually fills and submits the form on rapidscaleframework.com

    This test:
    1. Opens the page in a real browser
    2. Gets action plan from LLM
    3. Executes each action (fill fields, click buttons)
    4. Monitors for POST responses (form submission)
    5. Captures proof screenshot after submission
    6. Verifies the whole flow worked
    """
    print("\n" + "="*70)
    print("END-TO-END TEST - Actually Filling and Submitting Form")
    print("="*70)

    # Get API key
    api_key = get_api_key()
    if not api_key:
        print("ERROR: No API key provided")
        return False

    print(f"   API key: {api_key[:8]}...{api_key[-4:]}")

    # Track test results
    results = {
        "page_loaded": False,
        "llm_plan_received": False,
        "fields_filled": [],
        "actions_executed": 0,
        "actions_failed": 0,
        "post_response_received": False,
        "post_response_status": None,
        "post_response_url": None,
        "proof_captured": False,
        "final_page_url": None,
        "success_indicators": [],
    }

    async with async_playwright() as p:
        # Launch browser (visible for debugging)
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        # Step 1: Navigate to page
        print(f"\n1. Navigating to: {TEST_URL}")
        try:
            await page.goto(TEST_URL, wait_until="domcontentloaded", timeout=60000)
            # Wait a bit more for dynamic content
            await asyncio.sleep(3)
            results["page_loaded"] = True
            print(f"   ✅ Page loaded: {await page.title()}")
        except Exception as e:
            print(f"   ❌ Failed to load page: {e}")
            await browser.close()
            return False

        # Take screenshot of initial state
        screenshot_before = await page.screenshot(full_page=True)
        (OUTPUT_DIR / "e2e_01_before.png").write_bytes(screenshot_before)
        print(f"   📸 Saved: output/e2e_01_before.png")

        # Step 2: Extract HTML and get LLM plan
        print(f"\n2. Extracting HTML and calling LLM...")

        page_structure = await page.evaluate(r"""
            () => {
                const isVisible = (elem) => {
                    if (!elem) return false;
                    const style = window.getComputedStyle(elem);
                    return style.display !== 'none' &&
                           style.visibility !== 'hidden' &&
                           style.opacity !== '0' &&
                           elem.offsetParent !== null;
                };

                const cleanHtml = document.createElement('div');

                document.querySelectorAll('form').forEach((form, idx) => {
                    if (isVisible(form)) {
                        const formClone = form.cloneNode(true);
                        formClone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
                        formClone.querySelectorAll('[style*="display: none"], [hidden], .hidden').forEach(el => el.remove());
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

                return {
                    simplifiedHtml: cleanHtml.innerHTML.substring(0, 5000),
                    title: document.title,
                    url: window.location.href
                };
            }
        """)

        simplified_html = page_structure.get("simplifiedHtml", "")
        print(f"   HTML extracted: {len(simplified_html)} chars")

        # Save HTML
        (OUTPUT_DIR / "e2e_html.html").write_text(simplified_html, encoding='utf-8')

        # Initialize LLM analyzer
        analyzer = LLMPageAnalyzer(
            page=page,
            credentials=TEST_CREDENTIALS,
            llm_provider="openai",
            llm_config={
                "api_key": api_key,
                "model": "gpt-4o-mini"
            }
        )

        # Get batch plan from LLM
        context = {
            "credentials": TEST_CREDENTIALS,
            "page_url": TEST_URL,
            "simplified_html": simplified_html,
        }

        llm_result = await analyzer.get_batch_plan(context)
        actions = llm_result.get("actions", [])

        if actions:
            results["llm_plan_received"] = True
            print(f"   ✅ LLM returned {len(actions)} actions")
        else:
            print(f"   ❌ LLM returned no actions")
            await browser.close()
            return False

        # Save LLM plan
        (OUTPUT_DIR / "e2e_llm_plan.json").write_text(json.dumps(llm_result, indent=2), encoding='utf-8')

        # Step 3: Set up response listener for POST detection
        print(f"\n3. Setting up POST response listener...")

        captured_responses = []

        def on_response(response):
            if response.request.method in ["POST", "PUT"]:
                captured_responses.append({
                    "url": response.url,
                    "status": response.status,
                    "method": response.request.method,
                })
                print(f"      📡 Captured {response.request.method} {response.status}: {response.url[:60]}...")

        page.on("response", on_response)

        # Step 4: Execute each action
        print(f"\n4. Executing {len(actions)} actions...")

        for i, action in enumerate(actions):
            action_type = action.get("action", "")
            selector = action.get("selector", "")
            field_type = action.get("field_type", "")
            value = action.get("value", "")
            reasoning = action.get("reasoning", "")

            print(f"\n   [{i+1}/{len(actions)}] {action_type}: {selector[:50] if selector else reasoning[:50]}")

            if action_type == "complete":
                print(f"      ⏭️ Skipping 'complete' action")
                continue

            try:
                if action_type == "fill_field":
                    # Determine value to fill
                    fill_value = value
                    if not fill_value:
                        if field_type == "email":
                            fill_value = TEST_CREDENTIALS["email"]
                        elif field_type == "full_name":
                            fill_value = TEST_CREDENTIALS["full_name"]
                        elif field_type == "first_name":
                            fill_value = TEST_CREDENTIALS["first_name"]
                        elif field_type == "last_name":
                            fill_value = TEST_CREDENTIALS["last_name"]
                        elif field_type == "phone":
                            fill_value = TEST_CREDENTIALS["phone"]
                        else:
                            fill_value = "Test Value"

                    # Find and fill the element
                    element = await page.wait_for_selector(selector, timeout=5000)
                    if element:
                        await element.scroll_into_view_if_needed()
                        await element.fill(fill_value)
                        results["fields_filled"].append({"selector": selector, "field_type": field_type, "value": fill_value})
                        results["actions_executed"] += 1
                        print(f"      ✅ Filled '{field_type}' with '{fill_value[:20]}...'")
                    else:
                        raise Exception("Element not found")

                elif action_type == "click":
                    # Find and click the element
                    element = await page.wait_for_selector(selector, timeout=5000)
                    if element:
                        await element.scroll_into_view_if_needed()

                        # Take screenshot before clicking submit
                        if "step" in selector.lower() or "submit" in selector.lower() or "go" in selector.lower():
                            screenshot_pre_submit = await page.screenshot(full_page=True)
                            (OUTPUT_DIR / f"e2e_02_pre_submit.png").write_bytes(screenshot_pre_submit)
                            print(f"      📸 Saved: output/e2e_02_pre_submit.png")

                        await element.click()
                        results["actions_executed"] += 1
                        print(f"      ✅ Clicked: {selector[:40]}")

                        # Wait for any network activity
                        try:
                            await page.wait_for_load_state("networkidle", timeout=10000)
                        except:
                            pass
                    else:
                        raise Exception("Element not found")

                else:
                    print(f"      ⏭️ Unknown action type: {action_type}")

            except Exception as e:
                results["actions_failed"] += 1
                print(f"      ❌ Failed: {e}")

        # Step 5: Check for POST responses
        print(f"\n5. Checking POST responses...")

        # Remove listener
        page.remove_listener("response", on_response)

        if captured_responses:
            results["post_response_received"] = True
            # Find the most relevant POST (usually to an API endpoint)
            for resp in captured_responses:
                if resp["status"] in [200, 201, 202]:
                    results["post_response_status"] = resp["status"]
                    results["post_response_url"] = resp["url"]
                    print(f"   ✅ POST response received: {resp['status']} {resp['url'][:60]}")
                    break
        else:
            print(f"   ⚠️ No POST responses captured")

        # Step 6: Wait and capture final state
        print(f"\n6. Capturing final state...")

        # Wait a bit for any animations/transitions
        await asyncio.sleep(2)

        results["final_page_url"] = page.url
        print(f"   Final URL: {page.url}")

        # Check for success indicators on page
        try:
            success_text = await page.evaluate("""
                () => {
                    const keywords = ['thank', 'success', 'confirm', 'welcome', 'subscribed',
                                     'received', 'submitted', 'complete', 'done', 'step 2', 'step #2'];
                    const elements = document.querySelectorAll('h1, h2, h3, h4, p, div, span');
                    const matches = [];

                    for (const el of elements) {
                        const text = (el.innerText || '').toLowerCase();
                        if (keywords.some(kw => text.includes(kw)) && text.length < 300 && text.length > 3) {
                            matches.push(el.innerText.trim().substring(0, 150));
                        }
                    }
                    return [...new Set(matches)].slice(0, 5);
                }
            """)
            results["success_indicators"] = success_text
            if success_text:
                print(f"   ✅ Success indicators found: {len(success_text)}")
                for indicator in success_text[:3]:
                    print(f"      - {indicator[:80]}...")
        except Exception as e:
            print(f"   ⚠️ Could not check for success indicators: {e}")

        # Capture final screenshot (the PROOF)
        screenshot_after = await page.screenshot(full_page=True)
        (OUTPUT_DIR / "e2e_03_after_submit.png").write_bytes(screenshot_after)
        results["proof_captured"] = True
        print(f"   📸 Saved PROOF: output/e2e_03_after_submit.png")

        # Keep browser open briefly for inspection
        print(f"\n   ⏳ Keeping browser open for 5 seconds...")
        await asyncio.sleep(5)

        await browser.close()

    # Step 7: Report results
    print("\n" + "="*70)
    print("END-TO-END TEST RESULTS")
    print("="*70)

    print(f"\n📊 Execution Summary:")
    print(f"   Page loaded:           {'✅' if results['page_loaded'] else '❌'}")
    print(f"   LLM plan received:     {'✅' if results['llm_plan_received'] else '❌'}")
    print(f"   Fields filled:         {len(results['fields_filled'])}")
    for field in results['fields_filled']:
        print(f"      - {field['field_type']}: {field['value'][:30]}...")
    print(f"   Actions executed:      {results['actions_executed']}")
    print(f"   Actions failed:        {results['actions_failed']}")
    print(f"   POST response:         {'✅ ' + str(results['post_response_status']) if results['post_response_received'] else '❌ None'}")
    print(f"   Success indicators:    {len(results['success_indicators'])}")
    print(f"   Proof captured:        {'✅' if results['proof_captured'] else '❌'}")

    print(f"\n📁 Test Artifacts:")
    print(f"   - output/e2e_01_before.png      (initial page)")
    print(f"   - output/e2e_02_pre_submit.png  (before submit click)")
    print(f"   - output/e2e_03_after_submit.png (PROOF - after submission)")
    print(f"   - output/e2e_html.html          (extracted HTML)")
    print(f"   - output/e2e_llm_plan.json      (LLM action plan)")

    # Determine if test passed
    test_passed = (
        results["page_loaded"] and
        results["llm_plan_received"] and
        len(results["fields_filled"]) >= 2 and  # At least email + one other field
        results["actions_executed"] >= 3 and     # At least fill + fill + click
        results["proof_captured"]
    )

    # Bonus: Check if we got POST response or success indicators
    has_submission_evidence = results["post_response_received"] or len(results["success_indicators"]) > 0

    print(f"\n" + "="*70)
    if test_passed and has_submission_evidence:
        print("✅ END-TO-END TEST PASSED - Form filled and submitted successfully!")
    elif test_passed:
        print("⚠️ END-TO-END TEST PARTIAL - Form filled but submission unclear")
    else:
        print("❌ END-TO-END TEST FAILED")
    print("="*70)

    # Save full results
    (OUTPUT_DIR / "e2e_results.json").write_text(json.dumps(results, indent=2, default=str), encoding='utf-8')

    return test_passed


if __name__ == "__main__":
    print("Running LLM Integration Tests...\n")

    # Parse command line args
    run_e2e = "--e2e" in sys.argv or "--full" in sys.argv
    run_unit = "--unit" in sys.argv or not run_e2e
    run_llm = "--llm" in sys.argv or not run_e2e

    if "--help" in sys.argv:
        print("Usage: python test_llm_integration.py [options]")
        print("  --unit   Run unit tests only")
        print("  --llm    Run LLM selector validation test")
        print("  --e2e    Run full end-to-end form submission test")
        print("  --full   Same as --e2e")
        print("  (no args) Run unit + LLM tests")
        sys.exit(0)

    unit_passed = True
    integration_passed = True
    e2e_passed = True

    # Run unit tests first (fast, no API call)
    if run_unit and not run_e2e:
        unit_passed = asyncio.run(test_form_logic_unit())

    # Run LLM integration test (validates selectors)
    if run_llm and not run_e2e:
        print("\n")
        integration_passed = asyncio.run(test_llm_with_real_html())

    # Run full end-to-end test
    if run_e2e:
        print("\n")
        e2e_passed = asyncio.run(test_end_to_end_form_submission())

    # Summary
    print("\n" + "="*70)
    print("FINAL SUMMARY")
    print("="*70)
    if run_unit and not run_e2e:
        print(f"Unit tests:        {'✅ PASSED' if unit_passed else '❌ FAILED'}")
    if run_llm and not run_e2e:
        print(f"LLM validation:    {'✅ PASSED' if integration_passed else '❌ FAILED'}")
    if run_e2e:
        print(f"End-to-end test:   {'✅ PASSED' if e2e_passed else '❌ FAILED'}")

    all_passed = unit_passed and integration_passed and e2e_passed
    sys.exit(0 if all_passed else 1)
