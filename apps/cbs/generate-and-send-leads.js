/**
 * CBS Lead Gift Generator + OpenClaw Delivery
 * ─────────────────────────────────────────────
 * 1. Takes lead data as input (JSON or hardcoded)
 * 2. Generates a branded HTML lead gift document
 * 3. Converts to PDF with Puppeteer
 * 4. Saves to output folder
 * 5. POSTs a webhook notification to Patrick's OpenClaw agent
 *
 * Usage:
 *   node generate-and-send-leads.js
 *   node generate-and-send-leads.js --practice "ServiceNow" --count 10
 *
 * Setup:
 *   cp .env.example .env
 *   Fill in OPENCLAW_WEBHOOK_URL and OPENCLAW_TOKEN
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ─── CONFIG — copy to .env and fill in ───────────────────────────
const CONFIG = {
  // Patrick's OpenClaw webhook — get this from his OpenClaw Gateway settings
  OPENCLAW_WEBHOOK_URL: process.env.OPENCLAW_WEBHOOK_URL || 'http://YOUR_OPENCLAW_HOST:PORT/hooks/agent',
  OPENCLAW_TOKEN:       process.env.OPENCLAW_TOKEN       || 'YOUR_OPENCLAW_TOKEN',

  // Where to save the PDF locally
  OUTPUT_DIR: process.env.OUTPUT_DIR || 'C:/Users/Julien/Desktop/CBS-Leads-Output',

  // Optional: a URL where Patrick can download the file
  // If you share a folder via Dropbox/Google Drive, put the public link base here
  FILE_BASE_URL: process.env.FILE_BASE_URL || null,

  // Which messaging channel Patrick's OpenClaw should deliver the notification to
  // Options: 'last', 'whatsapp', 'telegram', 'discord', 'slack', 'signal'
  DELIVERY_CHANNEL: process.env.DELIVERY_CHANNEL || 'whatsapp',
};
// ─────────────────────────────────────────────────────────────────


// ─── LEAD DATA ───────────────────────────────────────────────────
// Replace this with your real lead data each run.
// Or wire this up to Claude API to generate leads dynamically (see bottom of file).

const LEAD_DATA = {
  client:   'Cloud Base Solutions',
  practice: 'ServiceNow, HR Tech & Agentic AI',
  date:     new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  leads: [
    {
      num: 1,
      name: 'Deepa Murthy',
      title: 'VP IT Transformation',
      company: 'Horizon Healthcare',
      industry: 'Healthcare',
      tags: ['sn', 'ai'],
      signal: 'Announced $40M digital transformation initiative Q1 2026',
      why: 'Actively modernizing IT infrastructure — perfect ServiceNow + Agentic AI fit'
    },
    {
      num: 2,
      name: 'James Whitfield',
      title: 'Chief HR Officer',
      company: 'Apex Manufacturing',
      industry: 'Manufacturing',
      tags: ['hr'],
      signal: 'Posted 3 HR Tech roles in last 30 days',
      why: 'Scaling HR ops — Darwinbox implementation opportunity'
    },
    {
      num: 3,
      name: 'Sandra Okonkwo',
      title: 'Director of Enterprise IT',
      company: 'Vantage Financial Group',
      industry: 'Finance',
      tags: ['sn', 'ai'],
      signal: 'LinkedIn post about legacy system modernization pain',
      why: 'ServiceNow ITSM + AI automation — dual practice fit'
    },
    // Add more leads here...
  ]
};
// ─────────────────────────────────────────────────────────────────


// ─── HTML TEMPLATE ───────────────────────────────────────────────
function buildHTML(data) {
  const tagHTML = {
    sn:  '<span class="tag sn">ServiceNow</span>',
    hr:  '<span class="tag hr">HR Tech</span>',
    ai:  '<span class="tag ai">Agentic AI</span>',
  };

  const rows = data.leads.map(l => `
    <tr>
      <td class="num">${l.num}</td>
      <td class="name">${l.name}</td>
      <td class="title-col">${l.title}</td>
      <td class="company">${l.company}</td>
      <td class="industry">${l.industry}</td>
      <td>${l.tags.map(t => tagHTML[t] || '').join(' ')}</td>
      <td class="signal">${l.signal}</td>
      <td class="why">${l.why}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Enterprise Prospect List — ${data.client}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #fff; color: #111; font-size: 12px; }
  .page { max-width: 960px; margin: 0 auto; padding: 44px 50px; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
  .brand { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #e91e8c; }
  .date { font-size: 11px; color: #888; }
  .title { font-size: 21px; font-weight: 700; color: #1a1a3e; margin-bottom: 5px; }
  .subtitle { font-size: 12.5px; color: #555; }
  .divider { height: 3px; background: linear-gradient(90deg, #e91e8c, #1a1a3e); margin: 14px 0 22px; border-radius: 2px; }
  .intro { font-size: 12px; color: #333; line-height: 1.7; margin-bottom: 22px; background: #fdf0f7; border-left: 4px solid #e91e8c; padding: 12px 16px; border-radius: 0 6px 6px 0; }
  .intro strong { color: #1a1a3e; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
  thead tr { background: #1a1a3e; }
  thead th { color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 9px 11px; text-align: left; }
  tbody tr { border-bottom: 1px solid #eee; }
  tbody tr:nth-child(even) { background: #fafafa; }
  td { padding: 9px 11px; vertical-align: top; font-size: 11px; line-height: 1.45; }
  td.num { color: #e91e8c; font-weight: 700; font-size: 13px; width: 26px; }
  td.name { font-weight: 700; color: #1a1a3e; }
  td.title-col { color: #444; }
  td.company { font-weight: 600; color: #1a1a3e; }
  td.signal { color: #333; }
  td.why { color: #b5177a; font-style: italic; }
  .tag { display: inline-block; border-radius: 3px; padding: 1px 7px; font-size: 10px; font-weight: 700; margin-bottom: 2px; }
  .tag.sn { background: #e8f0fe; color: #1a73e8; }
  .tag.hr { background: #e8f5e9; color: #2e7d32; }
  .tag.ai { background: #fff3e0; color: #e65100; }
  .footer { margin-top: 10px; display: flex; justify-content: space-between; padding-top: 14px; border-top: 1px solid #eee; }
  .footer-left { font-size: 10px; color: #aaa; }
  .footer-brand { font-size: 11px; font-weight: 700; color: #e91e8c; }
</style>
</head>
<body>
<div class="page">
  <div class="header-top">
    <div class="brand">LexAi — AI-Powered Lead Intelligence</div>
    <div class="date">${data.date}</div>
  </div>
  <div class="title">Enterprise Prospect List — ${data.practice}</div>
  <div class="subtitle">Prepared for ${data.client} — GTM & Business Development</div>
  <div class="divider"></div>
  <div class="intro">
    This list was generated by running LexAi's lead qualification engine on the US enterprise market,
    filtering for companies actively signaling digital transformation, IT modernization, or HR tech initiatives.
    Each prospect was scored for fit with <strong>CBS's core practices: ${data.practice}</strong>.
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Name</th><th>Title</th><th>Company</th>
        <th>Industry</th><th>Practice Fit</th><th>Active Signal</th><th>Why Relevant for CBS</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    <div class="footer-left">Confidential — Prepared exclusively for ${data.client}</div>
    <div class="footer-brand">LexAi</div>
  </div>
</div>
</body>
</html>`;
}
// ─────────────────────────────────────────────────────────────────


// ─── STEP 1: GENERATE PDF ─────────────────────────────────────────
async function generatePDF(html, outputPath) {
  console.log('📄 Generating PDF...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: outputPath,
    format: 'A4',
    landscape: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    printBackground: true
  });
  await browser.close();
  console.log(`✅ PDF saved: ${outputPath}`);
}
// ─────────────────────────────────────────────────────────────────


// ─── STEP 2: SEND TO OPENCLAW ─────────────────────────────────────
async function sendToOpenClaw(pdfPath, fileUrl) {
  console.log('🦞 Sending to OpenClaw...');

  const filename = path.basename(pdfPath);
  const fileSize = (fs.statSync(pdfPath).size / 1024).toFixed(1);

  // Build the message Patrick's agent will receive
  const message = fileUrl
    ? `📊 New CBS Lead Gift ready!\n\nFile: ${filename} (${fileSize} KB)\nDownload: ${fileUrl}\n\nThis is a freshly generated enterprise prospect list for Cloud Base Solutions. The PDF is ready to review and send to Patrick.`
    : `📊 New CBS Lead Gift generated!\n\nFile: ${filename} (${fileSize} KB)\nLocal path: ${pdfPath}\n\nFreshly generated enterprise prospect list for Cloud Base Solutions — ${LEAD_DATA.leads.length} qualified leads, practice-tagged and signal-scored.`;

  const payload = JSON.stringify({
    message,
    deliver: true,
    channel: CONFIG.DELIVERY_CHANNEL,
  });

  const url = new URL(CONFIG.OPENCLAW_WEBHOOK_URL.replace('/hooks', '') + '/hooks/agent');

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'Authorization': `Bearer ${CONFIG.OPENCLAW_TOKEN}`,
    }
  };

  return new Promise((resolve, reject) => {
    const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ OpenClaw notified — delivered to ${CONFIG.DELIVERY_CHANNEL}`);
          resolve(body);
        } else {
          console.error(`❌ OpenClaw returned ${res.statusCode}: ${body}`);
          reject(new Error(`OpenClaw webhook failed: ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
// ─────────────────────────────────────────────────────────────────


// ─── MAIN ─────────────────────────────────────────────────────────
async function main() {
  // Ensure output directory exists
  if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
  }

  // Build filename with date
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `CBS-Enterprise-Leads-${dateStr}.pdf`;
  const outputPath = path.join(CONFIG.OUTPUT_DIR, filename);

  // Step 1 — Generate HTML
  const html = buildHTML(LEAD_DATA);

  // Step 2 — Generate PDF
  await generatePDF(html, outputPath);

  // Step 3 — Send to OpenClaw
  // If you have a shared file URL (Dropbox public link, Google Drive, etc.), pass it here
  const fileUrl = CONFIG.FILE_BASE_URL ? `${CONFIG.FILE_BASE_URL}/${filename}` : null;
  await sendToOpenClaw(outputPath, fileUrl);

  console.log('\n🎉 Done! Patrick\'s OpenClaw agent has been notified.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});


// ─── OPTIONAL: AUTO-GENERATE LEADS WITH CLAUDE ───────────────────
// Uncomment this to use Claude API to generate fresh leads each run
// instead of hardcoding them above.
//
// const Anthropic = require('@anthropic-ai/sdk');
// async function generateLeadsWithClaude(practice, count) {
//   const client = new Anthropic();
//   const msg = await client.messages.create({
//     model: 'claude-opus-4-6',
//     max_tokens: 2000,
//     messages: [{
//       role: 'user',
//       content: `Generate ${count} enterprise prospects for a company selling ${practice} services.
//       Return JSON array with fields: name, title, company, industry, tags (array of 'sn'/'hr'/'ai'),
//       signal (one sentence of buying signal), why (one sentence why relevant). Real-sounding data only.`
//     }]
//   });
//   return JSON.parse(msg.content[0].text);
// }
