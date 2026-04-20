# LionTree MVP — Project Notes

## Contact
- **Greg Gyumolcsos**, Investment Banker at LionTree (media/tech/comms/consumer M&A)
- Met through TLM outing, parishioner at Holy Innocents
- Discovery call: Sunday, April 5, 2026
- Greg checking with the firm on appetite for an AI consultancy

## The Core Pain
> "If a company sends us a PDF with their numbers, we need to extract the correct numbers and input them in the new Excel. That can eat up our time a lot."

Analysts waste bandwidth on repetitive, manual tasks (PDF → Excel). They never start from blank Excel — always from an existing template. AI takes first stab (80% correct), analyst reviews.

## Why Rogo/Hebbia Failed (Greg's Words)
- Rogo: couldn't fully replicate 1-page company profile template formatting
- Hebbia: indistinguishable from Rogo
- FactSet: handles public company data via Excel plugin — not a differentiator

## How to Run
- App: `C:\s\scanner\apps\liontree-mvp\`
- Start: `cd C:\s\scanner` then `npm run dev:liontree`
- URL: `http://localhost:3003`
- API key: OpenAI key in `apps/liontree-mvp/.env.local`

## Stack
- Next.js 16 frontend
- OpenAI GPT-4o for financial data extraction (~$0.01–0.05 per run)
- pdf-parse for PDF text extraction
- ExcelJS for .xlsx generation
- pptxgenjs for .pptx generation

---

## v1 — MVP (April 8, 2026)
1. User drops a financial PDF (10-K, CIM, earnings report)
2. GPT-4o extracts: Revenue, EBITDA, EBIT, D&A, CapEx, Net Debt, Cash, Share Count
3. Outputs formatted .xlsx with margins + growth % auto-calculated
4. Yellow cells = values GPT flagged as uncertain
5. ~30 seconds end to end

### Tested: Paramount Global 2024 Annual Report
Extracted 2021 / 2022 / 2023:
- Revenue: $28,885 / $30,154 / $29,652M
- EBITDA: $2,707 / $3,276 / $2,390M
- EBIT: $2,265 / $2,342 / -$451M
- D&A: $442 / $378 / $418M
- CapEx: $358 / $358 / $328M
- Net Debt: $12,141M | Cash: $2,460M | Diluted Shares: 1,541M

---

## v2 (April 13, 2026) — Live Excel Formulas + Editable Assumptions

### Greg's feedback that drove this
- Clicking a cell should show a formula in the formula bar (not static values)
- Analysts need to audit and trace calculations
- PPTX / branded outputs are the real differentiator over ChatGPT/Claude

### What changed
- 3-step UI: upload PDF → review assumptions → download Excel
- Live Excel formulas: projection columns reference assumption cells (e.g. `=C16*(1+$B$8)`)
- 7 editable assumptions in B5–B11 (WACC, Terminal Growth, Tax Rate, Rev Growth, EBITDA Margin, D&A %, CapEx %)
- Dark green = user inputs, light green = auto-set from historical averages (still editable)
- API split: `/api/extract` (JSON) + `/api/generate` (xlsx) + `/api/process` (one-shot fallback)

---

## v3 — PowerPoint Generation (April 14, 2026)

### What changed
- New `/api/pptx` endpoint — returns branded `.pptx`
- 5-slide deck: Cover, Historical Financials, Key Assumptions, Football Field, Valuation Summary
- Football field built with native shapes (not a chart object) — works in all viewers

### Honest assessment
The PPTX as built is **not meaningfully better than the Excel** for impressing Greg:
1. Football field is wrong format — built as 5 WACC-scenario bars, but a real IB football field = one MIN-TO-MAX range band per methodology (DCF, Public Comps, Precedent Transactions, 52-Week Range)
2. Deck is thin without comps/precedent data
3. **Conclusion:** don't lead with PPTX until brand specs arrive from Greg or we add comps data. Excel is the demo.

---

## v4 — Redesigned Flow (April 20, 2026)

### The problem with v2/v3 UX
- Two separate assumption editors (review step + done step) confused the user
- Edits on the done screen didn't flow back into the Excel download
- The "file watcher" (File System Access API polling) was Chrome-only and fragile

### New flow — 3 explicit steps
1. **Upload PDF** → extracts financials + auto-generates Excel in one shot (~30s)
2. **Download Excel** → open in Excel, edit whatever you want (assumptions in B5–B11) → save
3. **Upload edited Excel** → app reads your changes → builds pitch deck → **Download .pptx**

### Key principle
Excel is the editor. The web app handles before (PDF extraction) and after (deck generation). No web-based assumption editor — analysts already know Excel.

### New files / endpoints
- `/api/read-excel` — POST accepts `.xlsx`, returns `{ financialData, assumptions }` parsed via ExcelJS
- `/addin/page.tsx` — Excel task pane add-in (Office.js) that reads the active workbook and generates the deck from inside Excel
- `page.tsx` — fully rewritten around the 3-step flow with step indicators

### Step indicators in UI
Shows which step the user is on: Upload PDF → Edit in Excel → Download Deck

---

## Pitch Line
> "We built the first draft of your model before your analyst opens their laptop. They spend their time reviewing — not formatting."

## Pitching LionTree Leadership
- IT needs buy-in from senior bankers first
- Case studies from other companies are critical
- Answer "What can you do that we can't do with Claude Enterprise?" → bespoke pipeline + their templates + continuous dev
- Offer: suite of tools aligned to their specific use cases, end-to-end, continuous improvement

---

## v5 — LionTree AI Tools Platform (April 20, 2026)

### What was built
Full multi-tool platform with LionTree branding extracted from liontree.com.

**Brand**
- Colors: near-black `#0d0d0d` background, sidebar `#111111`, gold accent `#A07828` / `#C9A84C`
- Logo pulled from `https://liontree.com/wp-content/uploads/2023/07/LT_logo.svg`
- "AI TOOLS" label in gold under the logo

**Platform shell**
- Fixed left sidebar with LionTree logo, 3 tool nav links, Settings at bottom
- Active state highlights in gold
- Root `/` redirects to `/dcf`
- All tools share one layout

**Tools**
1. `/dcf` — DCF Populator (ported from v4, LionTree-branded)
2. `/meeting-prep` — Meeting Prep Brief: enter company name + meeting type (new pitch, due diligence, follow-up, management presentation) + optional context + optional PDF attachment → GPT-4o generates structured brief with company overview, financials, recent developments, strategic context, deal angles, suggested questions
3. `/cim` — CIM Analyzer: drop a CIM/IM PDF → GPT-4o extracts company overview, key financials, investment highlights, risks, management team, deal structure, LionTree angle
4. `/settings` — API key page: user pastes their OpenAI key, stored in localStorage, used by all tools

**API key flow**
- Key stored in browser localStorage
- Each tool reads from localStorage and passes as `apiKey` in FormData to the API route
- API routes use the passed key, fall back to `process.env.OPENAI_API_KEY` if none provided

**New files**
- `src/components/Sidebar.tsx`
- `src/app/dcf/page.tsx` (moved from root)
- `src/app/meeting-prep/page.tsx`
- `src/app/cim/page.tsx`
- `src/app/settings/page.tsx`
- `src/app/api/meeting-prep/route.ts`
- `src/app/api/cim/route.ts`

### What's next

| Priority | Feature | Notes |
|---|---|---|
| 1 | Get Greg to test it | Need his OpenAI key or use the .env.local one for the demo |
| 2 | Fix football field format | Build true min-to-max range bars per methodology. Requires comps + precedent data. |
| 3 | Real LionTree brand spec | Need from Greg: exact hex codes, fonts, logo file. Currently using scraped colors from site. |
| 4 | FactSet API integration | For public company forecast data. Requires FactSet credentials from LionTree. |
| 5 | Export Meeting Prep / CIM as formatted PDF | Currently downloads as plain text. |
