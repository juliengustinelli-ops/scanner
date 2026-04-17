// screenshot-pages.js — captures each CBS page section-by-section and saves PDFs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = 'C:/Users/Julien/Desktop/March 2026';
const BASE_URL = 'http://localhost:3001';

const PAGES = [
  {
    name: 'CBS-Homepage-2026',
    url: '/',
    folder: 'homepage-sections',
    sections: ['#hero', '#services-strip', '#partners', '#about', '#services', '#servicenow', '#ai', '#team', '#global', '#cta'],
  },
  {
    name: 'CBS-AI-Page-2026',
    url: '/ai',
    folder: 'ai-sections',
    sections: ['section:nth-of-type(1)', 'section:nth-of-type(2)', 'section:nth-of-type(3)', 'section:nth-of-type(4)', 'section:nth-of-type(5)', 'section:nth-of-type(6)'],
  },
  {
    name: 'CBS-HR-Page-2026',
    url: '/hr',
    folder: 'hr-sections',
    sections: ['section:nth-of-type(1)', 'section:nth-of-type(2)', 'section:nth-of-type(3)', 'section:nth-of-type(4)', 'section:nth-of-type(5)', 'section:nth-of-type(6)'],
  },
  {
    name: 'CBS-Staffing-Page-2026',
    url: '/staffing',
    folder: 'staffing-sections',
    sections: ['section:nth-of-type(1)', 'section:nth-of-type(2)', 'section:nth-of-type(3)', 'section:nth-of-type(4)', 'section:nth-of-type(5)'],
  },
];

async function screenshotPage(page, cfg) {
  const folderPath = path.join(OUTPUT_DIR, cfg.folder);
  fs.mkdirSync(folderPath, { recursive: true });

  await page.goto(BASE_URL + cfg.url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Hide the fixed nav so it doesn't overlap sections
  await page.evaluate(() => {
    const nav = document.querySelector('nav');
    if (nav) nav.style.display = 'none';
  });

  // Full-page screenshot
  const fullPath = path.join(folderPath, '00-full-page.png');
  await page.screenshot({ path: fullPath, fullPage: true });
  console.log(`  ✓ full page`);

  // Section-by-section screenshots
  const sections = await page.$$('section');
  for (let i = 0; i < sections.length; i++) {
    const num = String(i + 1).padStart(2, '0');
    const filePath = path.join(folderPath, `${num}-section.png`);
    try {
      await sections[i].scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await sections[i].screenshot({ path: filePath });
      console.log(`  ✓ section ${num}`);
    } catch (e) {
      console.log(`  ✗ section ${num}: ${e.message}`);
    }
  }
}

async function makePdf(page, cfg) {
  await page.goto(BASE_URL + cfg.url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Inject print styles: remove fixed nav, ensure full width
  await page.evaluate(() => {
    const nav = document.querySelector('nav');
    if (nav) nav.style.display = 'none';
    document.body.style.paddingTop = '0';
    const firstSection = document.querySelector('section');
    if (firstSection) firstSection.style.paddingTop = '60px';
  });

  const pdfPath = path.join(OUTPUT_DIR, `${cfg.name}.pdf`);
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  console.log(`  ✓ PDF saved: ${cfg.name}.pdf`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const cfg of PAGES) {
    console.log(`\n── ${cfg.name} (${cfg.url}) ──`);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    try {
      await screenshotPage(page, cfg);
      await makePdf(page, cfg);
    } catch (e) {
      console.error(`  ✗ Error: ${e.message}`);
    }

    await context.close();
  }

  await browser.close();
  console.log('\nDone.');
})();
