"""screenshot-pages.py — full-page screenshots converted to pixel-perfect PDFs"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

OUTPUT_DIR = Path("C:/Users/Julien/Desktop/March 2026")
BASE_URL = "http://localhost:3001"

PAGES = [
    {"name": "CBS-Homepage-2026",      "url": "/"},
    {"name": "CBS-AI-Page-2026",       "url": "/ai"},
    {"name": "CBS-HR-Page-2026",       "url": "/hr"},
    {"name": "CBS-Staffing-Page-2026", "url": "/staffing"},
]

def page_to_pdf(page, cfg):
    png_path = OUTPUT_DIR / f"{cfg['name']}.png"
    pdf_path = OUTPUT_DIR / f"{cfg['name']}.pdf"

    page.goto(BASE_URL + cfg["url"], wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(2000)

    # Scroll to bottom and back to trigger all animations/lazy loads
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(800)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(600)

    # Hide fixed nav so it doesn't appear floating mid-page in the screenshot
    page.evaluate("""() => {
        const nav = document.querySelector('nav');
        if (nav) { nav.style.position = 'relative'; nav.style.top = '0'; }
    }""")

    page.screenshot(path=str(png_path), full_page=True)
    print(f"  OK screenshot saved ({png_path.name})")

    # Convert PNG -> PDF using Pillow (pixel-perfect, no print CSS)
    img = Image.open(png_path)
    if img.mode == "RGBA":
        img = img.convert("RGB")

    # A4 at 96dpi: 794 x 1123px. We keep full width and paginate by height.
    page_w = img.width
    page_h = int(img.width * 1.414)  # A4 aspect ratio

    pages = []
    y = 0
    while y < img.height:
        crop = img.crop((0, y, page_w, min(y + page_h, img.height)))
        if crop.height < page_h:
            # Pad the last page with white
            padded = Image.new("RGB", (page_w, page_h), (255, 255, 255))
            padded.paste(crop, (0, 0))
            pages.append(padded)
        else:
            pages.append(crop.copy())
        y += page_h

    pages[0].save(
        str(pdf_path),
        save_all=True,
        append_images=pages[1:],
        resolution=96,
    )
    print(f"  OK PDF saved ({len(pages)} pages): {pdf_path.name}")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    for cfg in PAGES:
        print(f"\n-- {cfg['name']} --")
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        try:
            page_to_pdf(page, cfg)
        except Exception as e:
            print(f"  ERR: {e}")
        context.close()

    browser.close()
    print("\nDone.")
