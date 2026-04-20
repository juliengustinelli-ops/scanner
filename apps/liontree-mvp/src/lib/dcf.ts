import ExcelJS from "exceljs";
import OpenAI from "openai";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse");

// ── Types ────────────────────────────────────────────────────────────────────

export interface FinancialData {
  company: string;
  currency: string;
  unit: string;
  years: string[];
  revenue: (number | null)[];
  ebitda: (number | null)[];
  ebit: (number | null)[];
  da: (number | null)[];
  capex: (number | null)[];
  net_debt: number | null;
  cash: number | null;
  share_count: number | null;
  tax_rate: number | null;
  uncertain_cells: string[];
}

export interface ProjectionAssumptions {
  wacc: number;
  termGrowth: number;
  taxRate: number;
  revGrowth: number;
  ebitdaMargin: number;
  daRevPct: number;
  capexRevPct: number;
}

// ── Extraction prompt ────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a financial data extractor for investment banking. Extract key financial metrics from the provided PDF document.

Return ONLY a valid JSON object with EXACTLY this structure (no markdown, no explanation):

{
  "company": "Full company name",
  "currency": "USD",
  "unit": "millions",
  "years": ["2020", "2021", "2022", "2023", "2024"],
  "revenue": [1000, 1100, 1200, 1300, 1400],
  "ebitda": [200, 220, 240, 260, 280],
  "ebit": [150, 165, 180, 195, 210],
  "da": [50, 55, 60, 65, 70],
  "capex": [80, 85, 90, 95, 100],
  "net_debt": 500,
  "cash": 200,
  "share_count": 150,
  "tax_rate": 0.25,
  "uncertain_cells": ["ebit_2020", "da_2021"]
}

Rules:
- Include the actual fiscal years found in the document (typically 3–5 years)
- All monetary values in millions USD (convert if needed)
- share_count in millions
- tax_rate: effective tax rate as a decimal (e.g. 0.25 for 25%). Look for "effective tax rate", "income tax expense / pretax income". Default to null if not found.
- Use null ONLY if the value truly cannot be found anywhere in the text — search thoroughly
- Revenue may appear as "Total revenues", "Net revenues", "Total net revenues"
- EBITDA may not be stated directly — calculate as EBIT + D&A if needed
- EBIT may appear as "Operating income", "Income from operations"
- D&A may appear as "Depreciation and amortization" in cash flow or income statement
- CapEx may appear as "Capital expenditures", "Purchases of property and equipment"
- Net Debt = Total Debt - Cash; or may be stated directly
- Cash may appear as "Cash and cash equivalents"
- Share count: look for "diluted weighted average shares", "diluted shares outstanding"
- uncertain_cells format: "{metric}_{year}" — list cells where you extracted a value but are not fully confident
- net_debt, cash, share_count, tax_rate are single values (most recent period)
- Numbers in the text may appear as (28,058) meaning negative 28,058 or as 28,058 meaning positive

Return ONLY the JSON. No other text.`;

// ── Row extraction patterns ───────────────────────────────────────────────────

const ROW_PATTERNS: { label: string; patterns: RegExp[] }[] = [
  {
    label: "REVENUES",
    patterns: [
      /total\s+revenues?/i,
      /net\s+revenues?/i,
      /^revenues?\s/i,
      /total\s+net\s+revenues?/i,
    ],
  },
  { label: "EBITDA", patterns: [/\bebitda\b/i] },
  {
    label: "OPERATING_INCOME",
    patterns: [
      /operating\s+income/i,
      /income\s+from\s+operations/i,
      /\bebit\b(?!\s*da)/i,
    ],
  },
  {
    label: "DA",
    patterns: [
      /depreciation\s+and\s+amortization/i,
      /depreciation\s*&\s*amortization/i,
      /^d\s*[&\/]\s*a\b/i,
    ],
  },
  {
    label: "CAPEX",
    patterns: [
      /capital\s+expenditures?/i,
      /purchases?\s+of\s+property/i,
      /purchase\s+of\s+(?:property|equipment)/i,
    ],
  },
  { label: "NET_DEBT", patterns: [/net\s+debt/i] },
  { label: "CASH", patterns: [/cash\s+and\s+cash\s+equivalents/i] },
  {
    label: "SHARES",
    patterns: [
      /diluted\s+(?:weighted[\s-]average\s+)?shares/i,
      /shares\s+outstanding/i,
    ],
  },
  {
    label: "TAX_RATE",
    patterns: [
      /effective\s+tax\s+rate/i,
      /income\s+tax\s+(?:expense|provision)/i,
    ],
  },
];

const HAS_NUMBERS = /\$?\s*\d{1,3}(?:,\d{3})+|\d{4,}/;

function extractRelevantRows(fullText: string): string {
  const lines = fullText.split("\n");
  const collected: Map<string, string[]> = new Map();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || !HAS_NUMBERS.test(trimmed)) continue;

    for (const { label, patterns } of ROW_PATTERNS) {
      if (patterns.some((p) => p.test(trimmed))) {
        if (!collected.has(label)) collected.set(label, []);
        const ctx = lines.slice(Math.max(0, i - 2), i + 1).join("\n");
        collected.get(label)!.push(ctx);
        break;
      }
    }
  }

  const parts: string[] = [];
  for (const [label, rows] of collected) {
    parts.push(`--- ${label} ---`);
    parts.push(...rows.slice(0, 3));
  }
  return parts.join("\n");
}

export async function extractFinancialData(pdfBuffer: Buffer, apiKey?: string): Promise<FinancialData> {
  const parsed = await pdfParse(pdfBuffer);
  const fullText = parsed.text;
  const coverText = fullText.slice(0, 3_000);
  const financialRows = extractRelevantRows(fullText);

  const pdfText =
    financialRows.length > 500
      ? `--- COVER / CONTEXT ---\n${coverText}\n\n--- FINANCIAL ROWS ---\n${financialRows}`
      : fullText.slice(0, 40_000) + "\n\n...\n\n" + fullText.slice(-80_000);

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2048,
    messages: [
      {
        role: "system",
        content:
          "You are a financial data extractor for investment banking. The rows below were pulled directly from a financial PDF. Each row shows the exact text as it appears in the document. Read the numbers precisely — do not estimate or interpolate. Return only valid JSON.",
      },
      {
        role: "user",
        content: `Here are the extracted financial rows from the PDF:\n\n${pdfText}\n\n${EXTRACTION_PROMPT}`,
      },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse financial data from document");

  const data = JSON.parse(jsonMatch[0]) as FinancialData;
  data.years   = Array.isArray(data.years)   ? data.years   : [];
  data.revenue = Array.isArray(data.revenue) ? data.revenue : [];
  data.ebitda  = Array.isArray(data.ebitda)  ? data.ebitda  : [];
  data.ebit    = Array.isArray(data.ebit)    ? data.ebit    : [];
  data.da      = Array.isArray(data.da)      ? data.da      : [];
  data.capex   = Array.isArray(data.capex)   ? data.capex   : [];

  if (data.years.length === 0) {
    throw new Error(
      "Could not extract year data from document. The PDF may be scanned/image-based or lacks structured financial tables."
    );
  }
  return data;
}

// ── Math helpers ─────────────────────────────────────────────────────────────

function nonNull(arr: (number | null)[]): number[] {
  return arr.filter((v): v is number => v !== null);
}

function avgGrowthRate(arr: (number | null)[]): number {
  const vals = nonNull(arr);
  if (vals.length < 2) return 0.05;
  let sum = 0, count = 0;
  for (let i = 1; i < vals.length; i++) {
    if (vals[i - 1] !== 0) {
      sum += (vals[i] - vals[i - 1]) / Math.abs(vals[i - 1]);
      count++;
    }
  }
  const avg = count ? sum / count : 0.05;
  return Math.min(Math.max(avg, -0.1), 0.3);
}

function avgMargin(num: (number | null)[], den: (number | null)[]): number {
  let sum = 0, count = 0;
  for (let i = 0; i < Math.min(num.length, den.length); i++) {
    if (num[i] !== null && den[i] !== null && (den[i] as number) !== 0) {
      sum += (num[i] as number) / (den[i] as number);
      count++;
    }
  }
  return count ? sum / count : 0;
}

export function computeDefaultAssumptions(data: FinancialData): ProjectionAssumptions {
  return {
    wacc: 0.10,
    termGrowth: 0.025,
    taxRate: data.tax_rate ?? 0.25,
    revGrowth: avgGrowthRate(data.revenue),
    ebitdaMargin: avgMargin(data.ebitda, data.revenue),
    daRevPct: avgMargin(data.da, data.revenue),
    capexRevPct: avgMargin(data.capex, data.revenue),
  };
}

// ── Column letter helper ──────────────────────────────────────────────────────

function colLetter(n: number): string {
  let s = "";
  let m = n;
  while (m > 0) {
    m--;
    s = String.fromCharCode(65 + (m % 26)) + s;
    m = Math.floor(m / 26);
  }
  return s;
}

// ── Excel generator ───────────────────────────────────────────────────────────

export async function generateExcel(
  data: FinancialData,
  assumptions: ProjectionAssumptions
): Promise<Buffer> {
  const { wacc, termGrowth, taxRate, revGrowth, ebitdaMargin, daRevPct, capexRevPct } = assumptions;

  // Colors (ARGB)
  const C_HIST_HDR  = "FF8B1A22";
  const C_PROJ_HDR  = "FF1F4E79";
  const C_HIST_DATA = "FFFFFFFF";
  const C_PROJ_DATA = "FFDCE6F1";
  const C_GREEN_IN  = "FFE2EFD9";
  const C_GREEN_DRV = "FFF0FAF0"; // lighter green — derived assumption (editable but auto-set)
  const C_SECTION   = "FF2F5496";
  const C_LBL_BG    = "FFF2F2F2";
  const C_CALC_BG   = "FFFAFAFA";
  const C_PROJ_CALC = "FFE8F0F8";
  const C_YELLOW    = "FFFFFFCC";
  const C_WHITE     = "FFFFFFFF";
  const C_BLACK     = "FF000000";
  const C_BORDER    = "FFBFBFBF";
  const C_NAVY      = "FF1F4E79";

  const HIST_N      = data.years.length;
  const PROJ_N      = 5;
  const TOTAL_Y     = HIST_N + PROJ_N;
  const LABEL_COL   = 1;
  const FIRST_Y_COL = 2;
  const LAST_COL    = 1 + TOTAL_Y;

  // Absolute and relative cell reference helpers
  const A = (row: number, col: number) => `$${colLetter(col)}$${row}`;
  const R = (row: number, col: number) => `${colLetter(col)}${row}`;

  // Fixed row numbers (independent of HIST_N)
  const ROWS = {
    WACC: 5, TERM_GROWTH: 6, TAX: 7, REV_GROWTH: 8,
    EBITDA_MARGIN: 9, DA_PCT: 10, CAPEX_PCT: 11,
    YEAR_INDEX: 13, FY_HDR: 14,
    INC_HDR: 15,
    REV: 16, REV_GRW: 17,
    EBITDA: 18, EBITDA_MGN: 19, EBITDA_GRW: 20,
    DA: 21, DA_MGN: 22,
    EBIT: 23, EBIT_MGN: 24,
    TAXES: 25,
    NOPLAT: 26, NOPLAT_MGN: 27, NOPLAT_GRW: 28,
    FCF_HDR: 30,
    GCF: 31,
    CAPEX: 32, CAPEX_MGN: 33,
    FCF: 34, FCF_MGN: 35, FCF_GRW: 36,
    TV: 37, PV_FCF: 38,
    VAL_HDR: 40,
    EV: 41, NET_DEBT: 42, EQ_VAL: 43, SHARES: 44, IV: 45,
    SENS_HDR: 47,
  };

  // Assumption cell references (value always in col B = FIRST_Y_COL)
  const waccRef    = A(ROWS.WACC, FIRST_Y_COL);
  const tgRef      = A(ROWS.TERM_GROWTH, FIRST_Y_COL);
  const taxRef     = A(ROWS.TAX, FIRST_Y_COL);
  const rgRef      = A(ROWS.REV_GROWTH, FIRST_Y_COL);
  const emRef      = A(ROWS.EBITDA_MARGIN, FIRST_Y_COL);
  const daPctRef   = A(ROWS.DA_PCT, FIRST_Y_COL);
  const cxPctRef   = A(ROWS.CAPEX_PCT, FIRST_Y_COL);

  // Projected year labels
  const lastHistYr = parseInt(data.years[data.years.length - 1]);
  const projYears  = Array.from({ length: PROJ_N }, (_, i) => String(lastHistYr + i + 1));
  const allYears   = [...data.years, ...projYears];

  // ── Pre-compute projections for sensitivity table only ────────────────────
  let lastRev = nonNull(data.revenue).slice(-1)[0] ?? 0;
  const projRevSens: number[]    = [];
  const projEbitdaSens: number[] = [];
  const projDaSens: number[]     = [];
  const projFcfSens: number[]    = [];

  for (let i = 0; i < PROJ_N; i++) {
    const rev    = lastRev * (1 + revGrowth);
    const ebitda = rev * ebitdaMargin;
    const da     = rev * daRevPct;
    const ebit   = ebitda - da;
    const capex  = rev * capexRevPct;
    const noplat = ebit * (1 - taxRate);
    projRevSens.push(rev);
    projEbitdaSens.push(ebitda);
    projDaSens.push(da);
    projFcfSens.push(noplat + da - capex);
    lastRev = rev;
  }

  const terminalValue = projFcfSens[PROJ_N - 1] * (1 + termGrowth) / (wacc - termGrowth);
  const pvFcfs        = projFcfSens.map((fcf, i) => fcf / Math.pow(1 + wacc, i + 1));
  const pvTerminal    = terminalValue / Math.pow(1 + wacc, PROJ_N);
  const sumPvFcf      = pvFcfs.reduce((a, b) => a + b, 0);
  const enterpriseVal = sumPvFcf + pvTerminal;
  const equityVal     = enterpriseVal - (data.net_debt ?? 0);
  const intrinsicVal  = data.share_count && data.share_count > 0
    ? equityVal / data.share_count
    : null;

  // ── Workbook ──────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = "LexAi";
  wb.created = new Date();

  const ws = wb.addWorksheet("DCF Model", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  ws.getColumn(LABEL_COL).width = 34;
  for (let c = FIRST_Y_COL; c <= LAST_COL; c++) ws.getColumn(c).width = 13;

  const allBorder: Partial<ExcelJS.Borders> = {
    top:    { style: "thin",   color: { argb: C_BORDER } },
    bottom: { style: "thin",   color: { argb: C_BORDER } },
    left:   { style: "thin",   color: { argb: C_BORDER } },
    right:  { style: "thin",   color: { argb: C_BORDER } },
  };
  const topMedBorder: Partial<ExcelJS.Borders> = {
    top:    { style: "medium", color: { argb: C_NAVY } },
    bottom: { style: "thin",   color: { argb: C_BORDER } },
    left:   { style: "thin",   color: { argb: C_BORDER } },
    right:  { style: "thin",   color: { argb: C_BORDER } },
  };

  let r = 1;

  // ── Title ──────────────────────────────────────────────────────────────────
  ws.mergeCells(r, LABEL_COL, r, LAST_COL);
  const tc = ws.getCell(r, LABEL_COL);
  tc.value = `${(data.company ?? "COMPANY").toUpperCase()} — DCF VALUATION MODEL`;
  tc.font  = { name: "Calibri", bold: true, size: 14, color: { argb: C_WHITE } };
  tc.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C_NAVY } };
  tc.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(r).height = 30;
  r++; // r=2

  // ── Subtitle ───────────────────────────────────────────────────────────────
  ws.mergeCells(r, LABEL_COL, r, LAST_COL);
  const sc2 = ws.getCell(r, LABEL_COL);
  sc2.value = `${data.currency} in ${data.unit}  ·  Generated by LexAi  ·  ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
  sc2.font  = { name: "Calibri", size: 9, color: { argb: "FFB0C4DE" } };
  sc2.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C_NAVY } };
  sc2.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(r).height = 16;
  r++; // r=3

  ws.getRow(r).height = 6;
  r++; // r=4 (spacer consumed)

  // ── Assumptions header ─────────────────────────────────────────────────────
  ws.mergeCells(r, LABEL_COL, r, LAST_COL);
  const ah = ws.getCell(r, LABEL_COL);
  ah.value = "MODEL ASSUMPTIONS  (dark-green cells are editable; light-green cells are derived from historical data)";
  ah.font  = { name: "Calibri", bold: true, size: 9, color: { argb: C_WHITE } };
  ah.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C_SECTION } };
  ah.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws.getRow(r).height = 15;
  r++; // r=5

  // ── Assumption rows ────────────────────────────────────────────────────────
  // Order matches ROWS constants: WACC=5, TERM_GROWTH=6, TAX=7, REV_GROWTH=8,
  // EBITDA_MARGIN=9, DA_PCT=10, CAPEX_PCT=11
  const assumData: { label: string; val: number; isInput: boolean; fmt: string }[] = [
    { label: "WACC",                     val: wacc,         isInput: true,  fmt: "0.0%" },
    { label: "Terminal Growth Rate",      val: termGrowth,   isInput: true,  fmt: "0.0%" },
    { label: "Tax Rate",                  val: taxRate,      isInput: true,  fmt: "0.0%" },
    { label: "Projected Revenue Growth",  val: revGrowth,    isInput: false, fmt: "0.0%" },
    { label: "Projected EBITDA Margin",   val: ebitdaMargin, isInput: false, fmt: "0.0%" },
    { label: "D&A as % of Revenue",       val: daRevPct,     isInput: false, fmt: "0.0%" },
    { label: "CapEx as % of Revenue",     val: capexRevPct,  isInput: false, fmt: "0.0%" },
  ];

  for (const { label, val, isInput, fmt } of assumData) {
    ws.getRow(r).height = 16;
    const lc = ws.getCell(r, LABEL_COL);
    lc.value = label;
    lc.font  = { name: "Calibri", size: 9 };
    lc.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C_LBL_BG } };
    lc.alignment = { horizontal: "left", vertical: "middle", indent: 2 };
    lc.border = allBorder;

    const vc = ws.getCell(r, FIRST_Y_COL);
    vc.value  = val;
    vc.numFmt = fmt;
    vc.font   = { name: "Calibri", size: 9, bold: isInput, color: { argb: isInput ? "FF375623" : "FF1F5C2E" } };
    vc.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: isInput ? C_GREEN_IN : C_GREEN_DRV } };
    vc.alignment = { horizontal: "right", vertical: "middle" };
    vc.border = allBorder;

    for (let c = FIRST_Y_COL + 1; c <= LAST_COL; c++) {
      const ec = ws.getCell(r, c);
      ec.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C_LBL_BG } };
      ec.border = allBorder;
    }
    r++;
  }
  // After loop r=12

  ws.getRow(r).height = 8;
  r++; // r=13

  // ── Year index row (r=13) ─────────────────────────────────────────────────
  ws.getRow(r).height = 13;
  ws.getCell(r, LABEL_COL).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_LBL_BG } };
  for (let i = 0; i < TOTAL_Y; i++) {
    const c = ws.getCell(r, FIRST_Y_COL + i);
    c.value = i < HIST_N ? "" : i - HIST_N + 1;
    c.font  = { name: "Calibri", size: 8, color: { argb: "FFAAAAAA" } };
    c.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: i < HIST_N ? C_LBL_BG : C_PROJ_CALC } };
    c.alignment = { horizontal: "center", vertical: "middle" };
  }
  r++; // r=14

  // ── Fiscal Year header row (r=14) ──────────────────────────────────────────
  ws.getRow(r).height = 20;
  const fyLbl = ws.getCell(r, LABEL_COL);
  fyLbl.value = `Fiscal Year  (${data.currency} in ${data.unit})`;
  fyLbl.font  = { name: "Calibri", bold: true, size: 9, color: { argb: C_WHITE } };
  fyLbl.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF404040" } };
  fyLbl.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  fyLbl.border = allBorder;

  for (let i = 0; i < TOTAL_Y; i++) {
    const c = ws.getCell(r, FIRST_Y_COL + i);
    c.value = allYears[i];
    c.font  = { name: "Calibri", bold: true, size: 9, color: { argb: C_WHITE } };
    c.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: i < HIST_N ? C_HIST_HDR : C_PROJ_HDR } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = allBorder;
  }
  r++; // r=15

  // ── Row helpers ────────────────────────────────────────────────────────────

  type DataRowOpts = {
    bold?: boolean;
    italic?: boolean;
    indent?: number;
    numFmt?: string;
    histBg?: string;
    projBg?: string;
    labelBg?: string;
    uncertain?: boolean[];
    topMed?: boolean;
  };

  const uncertainFor = (metric: string): boolean[] =>
    data.years.map((yr) => data.uncertain_cells.includes(`${metric}_${yr}`));

  // Writes historical values as static numbers, projection columns as Excel formulas
  const addDataRow = (
    label: string,
    histVals: (number | null)[],
    projFormulas: string[],
    opts: DataRowOpts = {}
  ) => {
    ws.getRow(r).height = 16;
    const bdr = opts.topMed ? topMedBorder : allBorder;

    const lc = ws.getCell(r, LABEL_COL);
    lc.value = label;
    lc.font  = { name: "Calibri", size: 9, bold: opts.bold, italic: opts.italic };
    lc.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: opts.labelBg ?? C_LBL_BG } };
    lc.alignment = {
      horizontal: "left", vertical: "middle",
      indent: opts.indent ?? (opts.bold ? 1 : opts.italic ? 3 : 2),
    };
    lc.border = bdr;

    for (let i = 0; i < HIST_N; i++) {
      const c = ws.getCell(r, FIRST_Y_COL + i);
      c.value = histVals[i] ?? null;
      c.font  = { name: "Calibri", size: 9, bold: opts.bold, italic: opts.italic };
      c.fill  = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: opts.uncertain?.[i] ? "FFFFF3CD" : (opts.histBg ?? C_HIST_DATA) },
      };
      c.alignment = { horizontal: "right", vertical: "middle" };
      c.border = bdr;
      if (opts.numFmt) c.numFmt = opts.numFmt;
    }

    for (let i = 0; i < PROJ_N; i++) {
      const c = ws.getCell(r, FIRST_Y_COL + HIST_N + i);
      c.value = { formula: projFormulas[i] ?? "" };
      c.font  = { name: "Calibri", size: 9, bold: opts.bold, italic: opts.italic, color: { argb: C_NAVY } };
      c.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: opts.projBg ?? C_PROJ_DATA } };
      c.alignment = { horizontal: "right", vertical: "middle" };
      c.border = bdr;
      if (opts.numFmt) c.numFmt = opts.numFmt;
    }
    r++;
  };

  // Writes ALL year columns (hist + proj) as Excel formulas
  const addFormulaRow = (
    label: string,
    formulas: string[], // TOTAL_Y entries
    opts: DataRowOpts = {}
  ) => {
    ws.getRow(r).height = 16;
    const bdr = opts.topMed ? topMedBorder : allBorder;

    const lc = ws.getCell(r, LABEL_COL);
    lc.value = label;
    lc.font  = { name: "Calibri", size: 9, bold: opts.bold, italic: opts.italic };
    lc.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: opts.labelBg ?? C_LBL_BG } };
    lc.alignment = {
      horizontal: "left", vertical: "middle",
      indent: opts.indent ?? (opts.bold ? 1 : opts.italic ? 3 : 2),
    };
    lc.border = bdr;

    for (let i = 0; i < TOTAL_Y; i++) {
      const c = ws.getCell(r, FIRST_Y_COL + i);
      c.value = { formula: formulas[i] ?? '""' };
      c.font  = {
        name: "Calibri", size: 9, bold: opts.bold, italic: opts.italic,
        color: { argb: i < HIST_N ? C_BLACK : C_NAVY },
      };
      c.fill  = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: i < HIST_N ? (opts.histBg ?? C_CALC_BG) : (opts.projBg ?? C_PROJ_CALC) },
      };
      c.alignment = { horizontal: "right", vertical: "middle" };
      c.border = bdr;
      if (opts.numFmt) c.numFmt = opts.numFmt;
    }
    r++;
  };

  // Margin formula row: numRow / denRow for all year columns
  const addMarginRow = (label: string, numRow: number, denRow: number) => {
    const formulas = Array.from({ length: TOTAL_Y }, (_, i) => {
      const col = FIRST_Y_COL + i;
      return `=IFERROR(${R(numRow, col)}/${R(denRow, col)},"")`;
    });
    addFormulaRow(label, formulas, { italic: true, numFmt: "0.0%", histBg: C_CALC_BG, projBg: C_PROJ_CALC });
  };

  // Growth formula row: YoY growth for all year columns
  const addGrowthRow = (label: string, dataRow: number) => {
    const formulas = Array.from({ length: TOTAL_Y }, (_, i) => {
      if (i === 0) return '""';
      const prevCol = FIRST_Y_COL + i - 1;
      const curCol  = FIRST_Y_COL + i;
      return `=IFERROR((${R(dataRow, curCol)}-${R(dataRow, prevCol)})/ABS(${R(dataRow, prevCol)}),"")`;
    });
    addFormulaRow(label, formulas, { italic: true, numFmt: "0.0%", histBg: C_CALC_BG, projBg: C_PROJ_CALC });
  };

  const addSectionHdr = (label: string) => {
    ws.mergeCells(r, LABEL_COL, r, LAST_COL);
    const c = ws.getCell(r, LABEL_COL);
    c.value = label;
    c.font  = { name: "Calibri", bold: true, size: 9, color: { argb: C_WHITE } };
    c.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C_SECTION } };
    c.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    ws.getRow(r).height = 15;
    r++;
  };

  // ── Revenue proj formula builder ──────────────────────────────────────────
  // Year 0: lastHistRev * (1 + revGrowth)
  // Year i: prevProjRev * (1 + revGrowth)
  const revProjFormulas = Array.from({ length: PROJ_N }, (_, i) => {
    // prevCol: for i=0 → last hist col; for i>0 → previous proj col
    const prevCol = FIRST_Y_COL + HIST_N - 1 + i;
    return `=${R(ROWS.REV, prevCol)}*(1+${rgRef})`;
  });

  // Generic proj formula for "rev * pct" metrics (EBITDA, D&A, CapEx)
  const revPctProjFormulas = (pctRef: string) =>
    Array.from({ length: PROJ_N }, (_, i) => {
      const projCol = FIRST_Y_COL + HIST_N + i;
      return `=${R(ROWS.REV, projCol)}*${pctRef}`;
    });

  // EBIT proj: EBITDA - D&A  (same col)
  const ebitProjFormulas = Array.from({ length: PROJ_N }, (_, i) => {
    const projCol = FIRST_Y_COL + HIST_N + i;
    return `=${R(ROWS.EBITDA, projCol)}-${R(ROWS.DA, projCol)}`;
  });

  // Formula rows for ALL columns (hist + proj)
  const allColFormula = (fn: (col: number) => string) =>
    Array.from({ length: TOTAL_Y }, (_, i) => fn(FIRST_Y_COL + i));

  // ── INCOME STATEMENT (section header at r=15) ─────────────────────────────
  addSectionHdr("INCOME STATEMENT");
  // r=16

  addDataRow("Revenue", data.revenue, revProjFormulas, {
    bold: true, numFmt: "#,##0", uncertain: uncertainFor("revenue"),
  });
  // r=17
  addGrowthRow("  % Growth", ROWS.REV);
  // r=18
  addDataRow("EBITDA", data.ebitda, revPctProjFormulas(emRef), {
    bold: true, numFmt: "#,##0", uncertain: uncertainFor("ebitda"),
  });
  // r=19
  addMarginRow("  % of Revenues", ROWS.EBITDA, ROWS.REV);
  // r=20
  addGrowthRow("  % Growth", ROWS.EBITDA);
  // r=21
  addDataRow("Depreciation & Amortization", data.da, revPctProjFormulas(daPctRef), {
    numFmt: "#,##0", uncertain: uncertainFor("da"),
  });
  // r=22
  addMarginRow("  % of Revenues", ROWS.DA, ROWS.REV);
  // r=23
  addDataRow("EBIT (Operating Income)", data.ebit, ebitProjFormulas, {
    bold: true, numFmt: "#,##0", uncertain: uncertainFor("ebit"), topMed: true,
  });
  // r=24
  addMarginRow("  EBIT Margin", ROWS.EBIT, ROWS.REV);
  // r=25
  addFormulaRow(
    "Taxes on EBIT",
    allColFormula((col) => `=IFERROR(-${R(ROWS.EBIT, col)}*${taxRef},"")`),
    { numFmt: "#,##0" }
  );
  // r=26
  addFormulaRow(
    "NOPLAT",
    allColFormula((col) => `=IFERROR(${R(ROWS.EBIT, col)}*(1-${taxRef}),"")`),
    { bold: true, numFmt: "#,##0", topMed: true, histBg: C_HIST_DATA, projBg: C_PROJ_DATA }
  );
  // r=27
  addMarginRow("  % of Revenues", ROWS.NOPLAT, ROWS.REV);
  // r=28
  addGrowthRow("  % Growth", ROWS.NOPLAT);
  // r=29

  ws.getRow(r).height = 6;
  r++; // r=30

  // ── FREE CASH FLOW (section header at r=30) ───────────────────────────────
  addSectionHdr("FREE CASH FLOW");
  // r=31

  addFormulaRow(
    "Gross Cash Flow  (NOPLAT + D&A)",
    allColFormula((col) => `=IFERROR(${R(ROWS.NOPLAT, col)}+${R(ROWS.DA, col)},"")`),
    { bold: true, numFmt: "#,##0", histBg: C_HIST_DATA, projBg: C_PROJ_DATA }
  );
  // r=32

  // CapEx: historical stored as positive in data.capex, displayed negated
  const capexHistVals = data.capex.map((v) => (v !== null ? v * -1 : null));
  const capexProjFormulas = Array.from({ length: PROJ_N }, (_, i) => {
    const projCol = FIRST_Y_COL + HIST_N + i;
    return `=-${R(ROWS.REV, projCol)}*${cxPctRef}`;
  });
  addDataRow("Capital Expenditures", capexHistVals, capexProjFormulas, {
    numFmt: "#,##0", uncertain: uncertainFor("capex"),
  });
  // r=33
  // CapEx margin: use abs(capex)/revenue — show as positive %
  addMarginRow("  % of Revenues", ROWS.CAPEX, ROWS.REV);
  // r=34

  // FCF = GCF + CapEx_row (capex row is already negative)
  addFormulaRow(
    "Free Cash Flow",
    allColFormula((col) => `=IFERROR(${R(ROWS.GCF, col)}+${R(ROWS.CAPEX, col)},"")`),
    { bold: true, numFmt: "#,##0", topMed: true, histBg: C_HIST_DATA, projBg: C_PROJ_DATA }
  );
  // r=35
  addMarginRow("  % of Revenues", ROWS.FCF, ROWS.REV);
  // r=36
  addGrowthRow("  % Growth", ROWS.FCF);
  // r=37

  // Terminal Value — last proj col only
  const tvFormulas = Array.from({ length: PROJ_N }, (_, i) => {
    if (i < PROJ_N - 1) return '""';
    const lastProjCol = LAST_COL;
    return `=IFERROR(${R(ROWS.FCF, lastProjCol)}*(1+${tgRef})/(${waccRef}-${tgRef}),"")`;
  });
  addDataRow("Terminal Value", Array(HIST_N).fill(null), tvFormulas, {
    italic: true, numFmt: "#,##0",
  });
  // r=38

  // PV of FCF — proj cols only
  const pvFcfFormulas = Array.from({ length: PROJ_N }, (_, i) => {
    const projCol = FIRST_Y_COL + HIST_N + i;
    const period  = i + 1;
    if (i < PROJ_N - 1) {
      return `=IFERROR(${R(ROWS.FCF, projCol)}/(1+${waccRef})^${period},"")`;
    } else {
      return `=IFERROR((${R(ROWS.FCF, projCol)}+${R(ROWS.TV, projCol)})/(1+${waccRef})^${period},"")`;
    }
  });
  addDataRow("Present Value of FCF", Array(HIST_N).fill(null), pvFcfFormulas, {
    italic: true, numFmt: "#,##0",
  });
  // r=39

  ws.getRow(r).height = 10;
  r++; // r=40

  // ── VALUATION BRIDGE (section header at r=40) ─────────────────────────────
  addSectionHdr("VALUATION BRIDGE");
  // r=41

  const writeValRow = (
    label: string,
    value: number | null,
    numFmt: string,
    highlight = false,
    formula?: string
  ) => {
    ws.getRow(r).height = 17;
    const bg = highlight ? C_YELLOW : C_LBL_BG;

    const lc = ws.getCell(r, LABEL_COL);
    lc.value = label;
    lc.font  = { name: "Calibri", size: 9, bold: highlight, color: { argb: highlight ? C_NAVY : C_BLACK } };
    lc.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    lc.alignment = { horizontal: "left", vertical: "middle", indent: highlight ? 1 : 2 };
    lc.border = highlight ? topMedBorder : allBorder;

    const vc = ws.getCell(r, FIRST_Y_COL);
    if (formula) {
      vc.value = { formula };
    } else {
      vc.value = value;
    }
    vc.numFmt = numFmt;
    vc.font   = { name: "Calibri", size: 9, bold: highlight, color: { argb: highlight ? C_NAVY : C_BLACK } };
    vc.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: highlight ? C_YELLOW : C_WHITE } };
    vc.alignment = { horizontal: "right", vertical: "middle" };
    vc.border = highlight ? topMedBorder : allBorder;

    ws.mergeCells(r, FIRST_Y_COL + 1, r, LAST_COL);
    const fc = ws.getCell(r, FIRST_Y_COL + 1);
    fc.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: highlight ? C_YELLOW : C_LBL_BG } };
    fc.border = allBorder;
    r++;
  };

  // EV = SUM of PV FCF across projection columns
  const pvFcfSumFormula = `=SUM(${colLetter(FIRST_Y_COL + HIST_N)}${ROWS.PV_FCF}:${colLetter(LAST_COL)}${ROWS.PV_FCF})`;
  writeValRow(
    "Enterprise Value  (Sum of PV of FCFs + PV of Terminal Value)",
    enterpriseVal, "#,##0", false, pvFcfSumFormula
  );
  // r=42

  writeValRow(
    "  Less: Net Debt",
    data.net_debt !== null ? -data.net_debt : null,
    "#,##0"
  );
  // r=43

  writeValRow(
    "Equity Value",
    equityVal, "#,##0", false,
    `=${R(ROWS.EV, FIRST_Y_COL)}+${R(ROWS.NET_DEBT, FIRST_Y_COL)}`
  );
  // r=44

  writeValRow("  Shares Outstanding (millions)", data.share_count, "#,##0.0");
  // r=45

  writeValRow(
    "Intrinsic Value per Share (USD)",
    intrinsicVal,
    '"$"#,##0.00',
    true,
    `=IFERROR(${R(ROWS.EQ_VAL, FIRST_Y_COL)}/${R(ROWS.SHARES, FIRST_Y_COL)},"")`
  );
  // r=46

  ws.getRow(r).height = 12;
  r++; // r=47

  // ── SENSITIVITY ANALYSIS (static grid — pre-computed) ─────────────────────
  if (intrinsicVal !== null && data.share_count) {
    addSectionHdr("SENSITIVITY ANALYSIS  —  Intrinsic Value per Share  (static at generation)");

    const waccRange = [0.08, 0.09, 0.10, 0.11, 0.12];
    const tgRange   = [0.015, 0.020, 0.025, 0.030, 0.035];

    ws.getRow(r).height = 16;
    const cornerCell = ws.getCell(r, LABEL_COL);
    cornerCell.value = "WACC  ╲  Terminal Growth Rate";
    cornerCell.font  = { name: "Calibri", bold: true, size: 8, color: { argb: C_WHITE } };
    cornerCell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C_PROJ_HDR } };
    cornerCell.alignment = { horizontal: "center", vertical: "middle" };
    cornerCell.border = allBorder;

    for (let j = 0; j < tgRange.length; j++) {
      const hc = ws.getCell(r, FIRST_Y_COL + j);
      hc.value  = tgRange[j];
      hc.numFmt = "0.0%";
      hc.font   = { name: "Calibri", bold: true, size: 8, color: { argb: C_WHITE } };
      hc.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: C_PROJ_HDR } };
      hc.alignment = { horizontal: "center", vertical: "middle" };
      hc.border = allBorder;
    }
    for (let c = FIRST_Y_COL + tgRange.length; c <= LAST_COL; c++) {
      const ec = ws.getCell(r, c);
      ec.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C_PROJ_HDR } };
      ec.border = allBorder;
    }
    r++;

    for (const w of waccRange) {
      ws.getRow(r).height = 16;
      const wc = ws.getCell(r, LABEL_COL);
      wc.value  = w;
      wc.numFmt = "0.0%";
      wc.font   = { name: "Calibri", bold: true, size: 8, color: { argb: C_WHITE } };
      wc.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: C_PROJ_HDR } };
      wc.alignment = { horizontal: "center", vertical: "middle" };
      wc.border = allBorder;

      for (let j = 0; j < tgRange.length; j++) {
        const tg = tgRange[j];
        const isBase = w === wacc && tg === termGrowth;
        let iv: number | null = null;
        if (w > tg) {
          const tv2  = projFcfSens[PROJ_N - 1] * (1 + tg) / (w - tg);
          const pvf2 = projFcfSens.map((fcf, i) => fcf / Math.pow(1 + w, i + 1));
          const pvt2 = tv2 / Math.pow(1 + w, PROJ_N);
          const ev2  = pvf2.reduce((a, b) => a + b, 0) + pvt2;
          iv = (ev2 - (data.net_debt ?? 0)) / data.share_count!;
        }
        const sc = ws.getCell(r, FIRST_Y_COL + j);
        sc.value  = iv;
        sc.numFmt = '"$"#,##0.00';
        sc.font   = { name: "Calibri", size: 8, bold: isBase };
        sc.fill   = {
          type: "pattern", pattern: "solid",
          fgColor: { argb: isBase ? C_YELLOW : (w % 0.02 < 0.01 ? C_PROJ_DATA : C_PROJ_CALC) },
        };
        sc.alignment = { horizontal: "right", vertical: "middle" };
        sc.border = allBorder;
      }
      for (let c = FIRST_Y_COL + tgRange.length; c <= LAST_COL; c++) {
        const ec = ws.getCell(r, c);
        ec.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C_LBL_BG } };
        ec.border = allBorder;
      }
      r++;
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  ws.getRow(r).height = 8;
  r++;
  ws.mergeCells(r, LABEL_COL, r, LAST_COL);
  const note = ws.getCell(r, LABEL_COL);
  note.value =
    "Yellow cells = GPT uncertainty flags — verify against source.  Dark-green cells = editable assumptions.  " +
    "Projection formulas reference assumption cells — edit B5–B11 to update the model live.  " +
    "Sensitivity table is static (regenerate to refresh after assumption changes).";
  note.font  = { name: "Calibri", size: 8, italic: true, color: { argb: "FF888888" } };
  note.alignment = { horizontal: "left", vertical: "middle", indent: 1 };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
