"""Check what step 2 of rapidscaleframework form looks like."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUTPUT_DIR = Path(__file__).parent / "output"

async def check_step2():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        print('1. Loading page...')
        await page.goto('https://www.rapidscaleframework.com/', wait_until='domcontentloaded')
        await asyncio.sleep(2)

        print('2. Filling step 1...')
        await page.fill('[name="name"]', 'Test User')
        await page.fill('[name="email"]', 'test@example.com')
        await page.fill('[name="phone"]', '+15551234567')

        print('3. Clicking Go To Step #2...')
        await page.click('button:has-text("Go To Step #2")')
        await asyncio.sleep(3)

        print('4. Extracting Step 2 HTML...')
        html = await page.evaluate(r"""
            () => {
                const isVisible = (elem) => {
                    if (!elem) return false;
                    const style = window.getComputedStyle(elem);
                    return style.display !== 'none' &&
                           style.visibility !== 'hidden' &&
                           elem.offsetParent !== null;
                };

                const elements = [];
                document.querySelectorAll('input, select, textarea, button').forEach(elem => {
                    if (isVisible(elem)) {
                        elements.push({
                            tag: elem.tagName,
                            type: elem.type || '',
                            name: elem.name || '',
                            id: elem.id || '',
                            placeholder: elem.placeholder || '',
                            text: (elem.innerText || elem.value || '').substring(0, 50)
                        });
                    }
                });
                return elements;
            }
        """)

        print('\n=== STEP 2 FORM ELEMENTS ===')
        for elem in html:
            placeholder = elem['placeholder'][:30] if elem['placeholder'] else ''
            text = elem['text'][:30] if elem['text'] else ''
            print(f"{elem['tag']} type={elem['type']} name={elem['name']} placeholder='{placeholder}' text='{text}'")

        # Take screenshot
        screenshot_path = OUTPUT_DIR / "step2_form.png"
        await page.screenshot(path=str(screenshot_path), full_page=True)
        print(f'\nScreenshot saved: {screenshot_path}')

        # Also get the simplified HTML
        simplified = await page.evaluate(r"""
            () => {
                const forms = document.querySelectorAll('form');
                let html = '';
                forms.forEach(f => {
                    html += f.outerHTML.substring(0, 3000) + '\n\n';
                });
                if (!html) {
                    html = document.body.innerHTML.substring(0, 5000);
                }
                return html;
            }
        """)

        html_path = OUTPUT_DIR / "step2_html.html"
        html_path.write_text(simplified, encoding='utf-8')
        print(f'HTML saved: {html_path}')

        await asyncio.sleep(5)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(check_step2())
