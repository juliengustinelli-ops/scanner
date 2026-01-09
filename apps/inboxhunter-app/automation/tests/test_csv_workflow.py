"""
CSV Workflow Integration Test.

Tests the full form submission workflow using URLs from the user's actual CSV file.
This test validates:
1. Form detection and filling
2. LLM verification of submission success
3. Proof screenshot quality (shows confirmation, not errors)

Usage:
    python test_csv_workflow.py                    # Test first 5 URLs (quick test)
    python test_csv_workflow.py --count 10         # Test first 10 URLs
    python test_csv_workflow.py --url "https://..."  # Test specific URL
    python test_csv_workflow.py --all              # Test all URLs (slow)
"""

import asyncio
import csv
import json
import os
import sys
import io
import base64
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field, asdict

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Fix Windows console encoding for emojis
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from playwright.async_api import async_playwright, Page
from llm_analyzer import LLMPageAnalyzer

# Output directory
OUTPUT_DIR = Path(__file__).parent / "output" / "csv_workflow"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# CSV file path
DEFAULT_CSV_PATH = Path.home() / "Downloads" / "inboxhunter-scraped-urls-2026-01-02.csv"

# Test credentials
TEST_CREDENTIALS = {
    "email": "csvtest@example.com",
    "first_name": "Test",
    "last_name": "User",
    "full_name": "Test User",
    "phone": "+1 555-987-6543",
}

# Error indicators that indicate proof screenshot is NOT a success
ERROR_INDICATORS = [
    "is required",
    "required field",
    "invalid email",
    "invalid phone",
    "invalid address",
    "please enter a valid",
    "please enter",
    "please fill",
    "please provide",
    "error",
    "failed",
    "incorrect",
    "different address needed",
    "already registered",
    "already subscribed",
    "cannot subscribe",
    "try again",
    "oops",
    "something went wrong",
]

# CAPTCHA/bot detection indicators
CAPTCHA_INDICATORS = [
    "captcha",
    "verify you are human",
    "confirm you are a human",
    "not a robot",
    "i'm not a robot",
    "press & hold",
    "press and hold",
    "human verification",
    "security check",
    "bot detection",
]

# Success indicators that indicate form submission worked
SUCCESS_INDICATORS = [
    "thank you",
    "thanks",
    "success",
    "confirmed",
    "welcome",
    "subscribed",
    "signed up",
    "registered",
    "submitted",
    "received",
    "check your email",
    "verify your email",
    "confirmation",
]


@dataclass
class URLTestResult:
    """Result of testing a single URL."""
    url: str
    status: str = "pending"  # pending, success, failed, skipped, error, captcha
    fields_filled: List[str] = field(default_factory=list)
    actions_executed: int = 0
    actions_failed: int = 0
    verification_status: str = ""  # success, validation_error, needs_more_actions, failed
    verification_confidence: float = 0.0
    verification_reasoning: str = ""
    proof_captured: bool = False
    proof_shows_success: bool = False
    proof_shows_error: bool = False
    proof_shows_captcha: bool = False
    proof_error_indicators: List[str] = field(default_factory=list)
    proof_success_indicators: List[str] = field(default_factory=list)
    proof_captcha_indicators: List[str] = field(default_factory=list)
    error_message: str = ""
    duration_seconds: float = 0.0
    screenshot_path: str = ""


def get_api_key() -> str:
    """Get OpenAI API key from environment or app config."""
    # Try environment variable first
    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        return api_key

    # Try reading from the app's config file (Tauri app data)
    app_config_paths = [
        Path(os.environ.get("APPDATA", "")) / "com.inboxhunter.app" / "bot_config.json",
        Path.home() / "AppData" / "Roaming" / "com.inboxhunter.app" / "bot_config.json",
    ]

    for config_path in app_config_paths:
        if config_path.exists():
            try:
                with open(config_path) as f:
                    config = json.load(f)
                    api_key = config.get("apiKeys", {}).get("openai", "")
                    if api_key and not api_key.startswith("sk-your"):
                        return api_key
            except Exception:
                pass

    return ""


def load_urls_from_csv(csv_path: Path, count: Optional[int] = None) -> List[Dict[str, Any]]:
    """Load URLs from CSV file."""
    urls = []

    if not csv_path.exists():
        print(f"ERROR: CSV file not found: {csv_path}")
        return urls

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            url = row.get('url', '').strip()
            if url and url.startswith('http'):
                urls.append({
                    'id': row.get('id', ''),
                    'url': url,
                })

    # Filter to count if specified
    if count and count > 0:
        urls = urls[:count]

    return urls


async def extract_page_html(page: Page) -> str:
    """Extract simplified HTML from page for LLM analysis."""
    try:
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

                return cleanHtml.innerHTML.substring(0, 5000);
            }
        """)
        return page_structure
    except Exception:
        return ""


async def get_visible_text(page: Page) -> str:
    """Get visible text from page for verification."""
    try:
        return await page.evaluate('() => document.body.innerText.substring(0, 3000)')
    except Exception:
        return ""


def analyze_proof_text(visible_text: str) -> Dict[str, Any]:
    """Analyze visible text for success/error/captcha indicators."""
    text_lower = visible_text.lower()

    found_errors = []
    found_success = []
    found_captcha = []

    for indicator in ERROR_INDICATORS:
        if indicator in text_lower:
            found_errors.append(indicator)

    for indicator in SUCCESS_INDICATORS:
        if indicator in text_lower:
            found_success.append(indicator)

    for indicator in CAPTCHA_INDICATORS:
        if indicator in text_lower:
            found_captcha.append(indicator)

    # Determine overall result
    # CAPTCHA takes precedence - indicates bot detection
    shows_captcha = len(found_captcha) > 0
    # Errors override success (if both present, it's likely a validation error)
    shows_error = len(found_errors) > 0 and not shows_captcha
    shows_success = len(found_success) > 0 and not shows_error and not shows_captcha

    return {
        "shows_error": shows_error,
        "shows_success": shows_success,
        "shows_captcha": shows_captcha,
        "error_indicators": found_errors,
        "success_indicators": found_success,
        "captcha_indicators": found_captcha,
    }


async def test_single_url(
    url: str,
    api_key: str,
    browser,
    test_id: int = 0,
    headless: bool = True
) -> URLTestResult:
    """Test a single URL through the full workflow."""
    result = URLTestResult(url=url)
    start_time = datetime.now()

    # Create safe filename from URL - remove ALL special characters
    import re
    safe_name = url.replace('https://', '').replace('http://', '')
    safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', safe_name)[:50]

    try:
        # Create new page
        page = await browser.new_page()

        # Step 1: Navigate to page
        print(f"\n   1. Loading page...")
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await asyncio.sleep(2)  # Wait for dynamic content
        except Exception as e:
            result.status = "error"
            result.error_message = f"Failed to load: {str(e)[:100]}"
            await page.close()
            return result

        # Step 2: Extract HTML and get LLM plan
        print(f"   2. Getting LLM action plan...")
        simplified_html = await extract_page_html(page)

        if len(simplified_html) < 50:
            result.status = "skipped"
            result.error_message = "No form elements found"
            await page.close()
            return result

        # Initialize LLM analyzer
        analyzer = LLMPageAnalyzer(
            page=page,
            credentials=TEST_CREDENTIALS,
            llm_provider="openai",
            llm_config={"api_key": api_key, "model": "gpt-4o-mini"}
        )

        context = {
            "credentials": TEST_CREDENTIALS,
            "page_url": url,
            "simplified_html": simplified_html,
        }

        llm_result = await analyzer.get_batch_plan(context)
        actions = llm_result.get("actions", [])

        if not actions or (len(actions) == 1 and actions[0].get("action") == "complete"):
            result.status = "skipped"
            result.error_message = llm_result.get("reasoning", "No actions returned")
            await page.close()
            return result

        print(f"   3. Executing {len(actions)} actions...")

        # Step 3: Execute actions
        for i, action in enumerate(actions):
            action_type = action.get("action", "")
            selector = action.get("selector", "")
            field_type = action.get("field_type", "")
            value = action.get("value", "")

            if action_type == "complete":
                continue

            try:
                if action_type == "fill_field":
                    # Determine value
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

                    element = await page.wait_for_selector(selector, timeout=5000)
                    if element:
                        await element.scroll_into_view_if_needed()
                        await element.fill(fill_value)
                        result.fields_filled.append(field_type or selector)
                        result.actions_executed += 1
                    else:
                        result.actions_failed += 1

                elif action_type == "click":
                    element = await page.wait_for_selector(selector, timeout=5000)
                    if element:
                        await element.scroll_into_view_if_needed()
                        await element.click()
                        result.actions_executed += 1

                        # Wait for network after click
                        try:
                            await page.wait_for_load_state("networkidle", timeout=5000)
                        except:
                            pass
                    else:
                        result.actions_failed += 1

            except Exception as e:
                result.actions_failed += 1

        # Step 4: Verify submission with LLM
        print(f"   4. Verifying submission...")
        await asyncio.sleep(1)  # Wait for page to settle

        final_html = await extract_page_html(page)
        visible_text = await get_visible_text(page)

        verification_context = {
            "fields_filled": result.fields_filled,
            "actions_taken": [f"fill/click {len(result.fields_filled)} fields"],
            "simplified_html": final_html,
            "page_url": page.url,
            "visible_text": visible_text,
        }

        verification_result = await analyzer.verify_submission(verification_context)

        result.verification_status = verification_result.get("status", "failed")
        result.verification_confidence = verification_result.get("confidence", 0)
        result.verification_reasoning = verification_result.get("reasoning", "")[:200]

        # Step 5: Capture and analyze proof screenshot
        print(f"   5. Capturing proof...")

        screenshot_bytes = await page.screenshot(full_page=True)
        screenshot_path = OUTPUT_DIR / f"proof_{test_id:03d}_{safe_name}.png"
        screenshot_path.write_bytes(screenshot_bytes)
        result.proof_captured = True
        result.screenshot_path = str(screenshot_path)

        # Analyze the visible text for error/success/captcha indicators
        proof_analysis = analyze_proof_text(visible_text)
        result.proof_shows_error = proof_analysis["shows_error"]
        result.proof_shows_success = proof_analysis["shows_success"]
        result.proof_shows_captcha = proof_analysis.get("shows_captcha", False)
        result.proof_error_indicators = proof_analysis["error_indicators"]
        result.proof_success_indicators = proof_analysis["success_indicators"]
        result.proof_captcha_indicators = proof_analysis.get("captcha_indicators", [])

        # Determine final status - STRICT validation
        # Only mark as SUCCESS if we have strong evidence of actual submission confirmation
        if result.proof_shows_captcha:
            result.status = "captcha"
            result.error_message = f"CAPTCHA detected: {', '.join(result.proof_captcha_indicators[:2])}"
        elif result.verification_status == "validation_error" or result.proof_shows_error:
            result.status = "failed"
            if result.proof_error_indicators:
                result.error_message = f"Errors found: {', '.join(result.proof_error_indicators[:3])}"
            else:
                result.error_message = result.verification_reasoning
        elif result.verification_status == "needs_more_actions":
            # Multi-step form - not complete, mark as incomplete
            result.status = "failed"
            result.error_message = f"Incomplete: {result.verification_reasoning[:100]}"
        elif result.proof_shows_success:
            # Strong indicator - visible text shows success
            result.status = "success"
        elif result.verification_status == "success" and result.verification_confidence >= 0.9:
            # LLM says success with high confidence - trust it
            result.status = "success"
        else:
            # Uncertain - mark as failed rather than false positive
            result.status = "failed"
            result.error_message = f"Uncertain: {result.verification_reasoning[:100] if result.verification_reasoning else 'No confirmation found'}"

        await page.close()

    except Exception as e:
        result.status = "error"
        result.error_message = str(e)[:200]

    result.duration_seconds = (datetime.now() - start_time).total_seconds()
    return result


async def run_csv_workflow_test(
    csv_path: Path = DEFAULT_CSV_PATH,
    count: Optional[int] = 5,
    specific_url: Optional[str] = None,
    headless: bool = True
) -> Dict[str, Any]:
    """Run the full CSV workflow test."""
    print("=" * 70)
    print("CSV WORKFLOW INTEGRATION TEST")
    print("=" * 70)

    # Get API key
    api_key = get_api_key()
    if not api_key:
        print("ERROR: No OpenAI API key found")
        return {"error": "No API key"}

    print(f"\nAPI Key: {api_key[:8]}...{api_key[-4:]}")

    # Load URLs
    if specific_url:
        urls = [{"id": "0", "url": specific_url}]
        print(f"Testing specific URL: {specific_url}")
    else:
        urls = load_urls_from_csv(csv_path, count)
        print(f"Loaded {len(urls)} URLs from: {csv_path}")

    if not urls:
        print("ERROR: No URLs to test")
        return {"error": "No URLs"}

    # Run tests
    results: List[URLTestResult] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)

        for i, url_data in enumerate(urls):
            url = url_data["url"]
            print(f"\n{'=' * 70}")
            print(f"[{i + 1}/{len(urls)}] Testing: {url[:70]}...")
            print(f"{'=' * 70}")

            result = await test_single_url(
                url=url,
                api_key=api_key,
                browser=browser,
                test_id=i + 1,
                headless=headless
            )
            results.append(result)

            # Print result summary
            status_icon = {
                "success": "✅",
                "failed": "❌",
                "skipped": "⏭️",
                "error": "💥",
                "captcha": "🤖",
                "pending": "⏳"
            }.get(result.status, "?")

            print(f"\n   Result: {status_icon} {result.status.upper()}")
            if result.fields_filled:
                print(f"   Fields: {', '.join(result.fields_filled[:5])}")
            if result.verification_status:
                print(f"   Verification: {result.verification_status} ({result.verification_confidence:.0%})")
            if result.proof_shows_error:
                print(f"   ⚠️ Proof shows errors: {', '.join(result.proof_error_indicators[:3])}")
            if result.proof_shows_success:
                print(f"   ✅ Proof shows success: {', '.join(result.proof_success_indicators[:3])}")
            if result.error_message:
                print(f"   Error: {result.error_message[:100]}")
            print(f"   Duration: {result.duration_seconds:.1f}s")

        await browser.close()

    # Generate summary report
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)

    success_count = sum(1 for r in results if r.status == "success")
    failed_count = sum(1 for r in results if r.status == "failed")
    skipped_count = sum(1 for r in results if r.status == "skipped")
    error_count = sum(1 for r in results if r.status == "error")
    captcha_count = sum(1 for r in results if r.status == "captcha")

    print(f"\nResults:")
    print(f"   ✅ Success: {success_count}/{len(results)}")
    print(f"   ❌ Failed:  {failed_count}/{len(results)}")
    print(f"   ⏭️ Skipped: {skipped_count}/{len(results)}")
    print(f"   🤖 CAPTCHA: {captcha_count}/{len(results)}")
    print(f"   💥 Errors:  {error_count}/{len(results)}")

    success_rate = (success_count / len(results) * 100) if results else 0
    print(f"\n   Success Rate: {success_rate:.1f}%")

    # Show failed URLs
    if failed_count > 0:
        print(f"\n❌ Failed URLs:")
        for r in results:
            if r.status == "failed":
                print(f"   - {r.url[:60]}")
                print(f"     Reason: {r.error_message[:80]}")

    # Show CAPTCHA URLs
    if captcha_count > 0:
        print(f"\n🤖 CAPTCHA URLs (bot detection):")
        for r in results:
            if r.status == "captcha":
                print(f"   - {r.url[:60]}")

    # Show error URLs
    if error_count > 0:
        print(f"\n💥 Error URLs:")
        for r in results:
            if r.status == "error":
                print(f"   - {r.url[:60]}")
                print(f"     Error: {r.error_message[:80]}")

    # Save detailed report
    report_path = OUTPUT_DIR / f"test_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    report_data = {
        "timestamp": datetime.now().isoformat(),
        "csv_path": str(csv_path),
        "total_urls": len(urls),
        "summary": {
            "success": success_count,
            "failed": failed_count,
            "skipped": skipped_count,
            "captcha": captcha_count,
            "error": error_count,
            "success_rate": success_rate,
        },
        "results": [asdict(r) for r in results],
    }
    report_path.write_text(json.dumps(report_data, indent=2, default=str), encoding='utf-8')
    print(f"\n📁 Detailed report saved: {report_path}")
    print(f"📁 Screenshots saved in: {OUTPUT_DIR}")

    # Overall test result
    print("\n" + "=" * 70)
    if success_rate >= 70:
        print("✅ TEST SUITE PASSED (70%+ success rate)")
    elif success_rate >= 50:
        print("⚠️ TEST SUITE PARTIAL (50-70% success rate)")
    else:
        print("❌ TEST SUITE FAILED (<50% success rate)")
    print("=" * 70)

    return report_data


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Test CSV workflow with actual URLs")
    parser.add_argument("--count", type=int, default=5, help="Number of URLs to test (default: 5)")
    parser.add_argument("--url", type=str, help="Test specific URL instead of CSV")
    parser.add_argument("--all", action="store_true", help="Test all URLs in CSV")
    parser.add_argument("--csv", type=str, help="Path to CSV file")
    parser.add_argument("--visible", action="store_true", help="Show browser (not headless)")

    args = parser.parse_args()

    csv_path = Path(args.csv) if args.csv else DEFAULT_CSV_PATH
    count = None if args.all else args.count

    report = asyncio.run(run_csv_workflow_test(
        csv_path=csv_path,
        count=count,
        specific_url=args.url,
        headless=not args.visible
    ))

    # Exit with appropriate code
    if report.get("error"):
        sys.exit(1)
    success_rate = report.get("summary", {}).get("success_rate", 0)
    sys.exit(0 if success_rate >= 50 else 1)
