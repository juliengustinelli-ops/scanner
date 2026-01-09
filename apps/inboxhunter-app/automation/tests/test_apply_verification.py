"""Quick test for /apply page verification with improved prompt."""
import asyncio
import sys
import io
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from playwright.async_api import async_playwright
from llm_analyzer import LLMPageAnalyzer

async def test_apply_page():
    print('Testing /apply page with verification...')

    # Get API key
    config_path = Path.home() / 'AppData' / 'Roaming' / 'com.inboxhunter.app' / 'bot_config.json'
    with open(config_path) as f:
        config = json.load(f)
    api_key = config.get('apiKeys', {}).get('openai', '')

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Go to apply page
        await page.goto('https://rapidscaleframework.com/apply', wait_until='domcontentloaded')
        await asyncio.sleep(3)
        print(f'Page loaded: {await page.title()}')

        # Fill just the basic fields (leaving required ones empty)
        try:
            name_field = await page.query_selector('[name="name"]')
            if name_field:
                await name_field.fill('Test User')
            email_field = await page.query_selector('[name="email"]')
            if email_field:
                await email_field.fill('test@example.com')
            phone_field = await page.query_selector('[name="phone"]')
            if phone_field:
                await phone_field.fill('+15551234567')
            print('Filled basic fields')
        except Exception as e:
            print(f'Fill error: {e}')

        # Click submit to trigger validation errors
        try:
            submit_btn = await page.query_selector('button:has-text("Submit")')
            if submit_btn:
                await submit_btn.click()
                await asyncio.sleep(2)
                print('Clicked submit')
        except Exception as e:
            print(f'Click error: {e}')

        # Extract page state
        page_html = await page.evaluate(r'''() => {
            const elements = [];
            document.querySelectorAll("input, textarea, button, select").forEach(el => {
                if (el.offsetParent !== null) elements.push(el.outerHTML.substring(0, 200));
            });
            return elements.join("\n").substring(0, 5000);
        }''')

        visible_text = await page.evaluate('() => document.body.innerText.substring(0, 3000)')

        print(f'\nVisible text excerpt: {visible_text[:500]}...')

        # Initialize analyzer
        analyzer = LLMPageAnalyzer(
            page=page,
            credentials={'email': 'test@example.com'},
            llm_provider='openai',
            llm_config={'api_key': api_key, 'model': 'gpt-4o-mini'}
        )

        # Test verification
        verification_context = {
            'fields_filled': ['name', 'email', 'phone'],
            'actions_taken': ['fill name', 'fill email', 'fill phone', 'click submit'],
            'simplified_html': page_html,
            'page_url': page.url,
            'visible_text': visible_text,
        }

        print('\nCalling verification...')
        result = await analyzer.verify_submission(verification_context)

        print(f'\n{"="*60}')
        print(f'VERIFICATION RESULT:')
        print(f'{"="*60}')
        print(f'  Status: {result.get("status")}')
        print(f'  Confidence: {result.get("confidence")}')
        print(f'  Reasoning: {result.get("reasoning")}')
        print(f'  Error indicators: {result.get("error_indicators", [])}')

        # Check if it correctly detected validation errors
        if result.get('status') == 'validation_error':
            print('\n[PASS] Correctly detected validation errors!')
            success = True
        else:
            print(f'\n[FAIL] Expected validation_error but got {result.get("status")}')
            success = False

        await browser.close()
        return success

if __name__ == "__main__":
    success = asyncio.run(test_apply_page())
    sys.exit(0 if success else 1)
