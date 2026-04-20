import PptxGenJS from "pptxgenjs";
import type { FinancialData, ProjectionAssumptions } from "./dcf";

// ── Brand colors (CenterView-style palette) ───────────────────────────────────
const NAVY      = "1B2A4A";   // headers, firm name, key text
const WHITE     = "FFFFFF";
const ROW_ALT   = "F4F6F9";   // alternating table row tint
const ROW_SUB   = "EAECF2";   // sub-metric rows (growth, margin)
const TEXT_DARK = "222222";   // body text
const TEXT_GRAY = "6B7280";   // notes, sub-labels
const TEXT_SUB  = "8A8A8A";   // growth/margin row text
const BORDER    = "D0D5E0";   // thin table borders
const FOOTER_LN = "C8CDD8";   // footer separator line
const FOOTER_TX = "9CA3AF";   // footer text

// ── Math helpers ──────────────────────────────────────────────────────────────

function nonNull(arr: (number | null)[]): number[] {
  return arr.filter((v): v is number => v !== null);
}

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function computeEquityValue(fd: FinancialData, a: ProjectionAssumptions): number {
  const { wacc, termGrowth, taxRate, revGrowth, ebitdaMargin, daRevPct, capexRevPct } = a;
  if (wacc <= termGrowth) return NaN;
  const PROJ_N = 5;
  let lastRev = nonNull(fd.revenue).slice(-1)[0] ?? 0;
  const fcfs: number[] = [];
  for (let i = 0; i < PROJ_N; i++) {
    const rev    = lastRev * (1 + revGrowth);
    const ebitda = rev * ebitdaMargin;
    const da     = rev * daRevPct;
    const ebit   = ebitda - da;
    const capex  = rev * capexRevPct;
    const noplat = ebit * (1 - taxRate);
    fcfs.push(noplat + da - capex);
    lastRev = rev;
  }
  const tv    = fcfs[PROJ_N - 1] * (1 + termGrowth) / (wacc - termGrowth);
  const pvFcf = fcfs.map((f, i) => f / Math.pow(1 + wacc, i + 1));
  const pvTv  = tv / Math.pow(1 + wacc, PROJ_N);
  const ev    = pvFcf.reduce((s, x) => s + x, 0) + pvTv;
  return ev - (fd.net_debt ?? 0);
}

// ── Slide chrome (CenterView style) ──────────────────────────────────────────
// White slide, title text on white, thin rule + footer with firm name + slide #

function addSlideChrome(
  slide: PptxGenJS.Slide,
  title: string,
  company: string,
  slideNum: number
) {
  slide.background = { color: WHITE };

  // Title — large black text directly on white, no background bar
  slide.addText(title, {
    x: 0.4, y: 0.22, w: 10, h: 0.62,
    fontSize: 22, bold: true,
    color: TEXT_DARK, fontFace: "Arial",
    valign: "middle",
  });

  // Thin separator under title
  slide.addShape("line", {
    x: 0.4, y: 0.9, w: 12.55, h: 0,
    line: { color: FOOTER_LN, width: 0.75 },
  });

  // Footer separator
  slide.addShape("line", {
    x: 0.4, y: 7.1, w: 12.55, h: 0,
    line: { color: FOOTER_LN, width: 0.5 },
  });

  // Footer left: confidentiality notice
  slide.addText("Preliminary  |  Confidential  |  For Discussion Purposes Only", {
    x: 0.4, y: 7.15, w: 8, h: 0.22,
    fontSize: 7, color: FOOTER_TX,
    fontFace: "Arial", italic: true,
  });

  // Footer right: firm name + slide number
  slide.addText(`LIONTREE  |  ${slideNum}`, {
    x: 9.5, y: 7.15, w: 3.45, h: 0.22,
    fontSize: 7, bold: true, color: NAVY,
    fontFace: "Arial", align: "right",
  });
}

// ── Table cell helper ─────────────────────────────────────────────────────────

function tCell(
  text: string,
  bold: boolean,
  bg: string,
  fg: string,
  align: "left" | "center" | "right" = "left",
  fontSize = 10
): PptxGenJS.TableCell {
  return {
    text,
    options: {
      bold, align, valign: "middle",
      color: fg, fontFace: "Arial", fontSize,
      fill: { color: bg },
      border: { type: "solid", color: BORDER, pt: 0.5 },
      margin: [3, 6, 3, 6],
    },
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generatePptx(
  fd: FinancialData,
  a: ProjectionAssumptions
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33" × 7.5"

  const today = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const company     = fd.company;
  const lastHistYr  = fd.years[fd.years.length - 1];

  // Pre-compute key numbers
  const revenues    = nonNull(fd.revenue);
  const ebitdas     = nonNull(fd.ebitda);
  const lastRev     = revenues[revenues.length - 1] ?? 0;
  const lastEbitda  = ebitdas[ebitdas.length - 1] ?? 0;
  const ebitdaMarginPct = lastRev > 0 ? lastEbitda / lastRev : 0;
  const n           = revenues.length - 1;
  const firstRev    = revenues[0] ?? 0;
  const revCagr     = firstRev > 0 && n > 0 ? Math.pow(lastRev / firstRev, 1 / n) - 1 : 0;

  const baseEquity  = computeEquityValue(fd, a);
  const baseEV      = baseEquity + (fd.net_debt ?? 0);
  const intrinsic   = fd.share_count && fd.share_count > 0
    ? baseEquity / fd.share_count
    : null;

  // Football field scenarios
  const ffScenarios = [
    { label: "WACC +2%", wacc: a.wacc + 0.02, tg: a.termGrowth },
    { label: "WACC +1%", wacc: a.wacc + 0.01, tg: a.termGrowth },
    { label: "Base Case", wacc: a.wacc,        tg: a.termGrowth },
    { label: "WACC −1%", wacc: a.wacc - 0.01, tg: a.termGrowth },
    { label: "WACC −2%", wacc: a.wacc - 0.02, tg: a.termGrowth },
  ].map(s => ({
    label: s.label,
    equity: computeEquityValue(fd, { ...a, wacc: Math.max(s.wacc, s.tg + 0.005), termGrowth: s.tg }),
  })).filter(s => isFinite(s.equity));

  // ══════════════════════════════════════════════════════════════════════════
  // SLIDE 1 — Cover
  // ══════════════════════════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    s.background = { color: NAVY };

    // Company name
    s.addText(company, {
      x: 0.6, y: 1.8, w: 11.5, h: 1.4,
      fontSize: 48, bold: true,
      color: WHITE, fontFace: "Arial",
    });

    // Thin white rule
    s.addShape("line", {
      x: 0.6, y: 3.35, w: 11.5, h: 0,
      line: { color: WHITE, width: 1 },
    });

    // Subtitle
    s.addText("Preliminary Discounted Cash Flow Analysis", {
      x: 0.6, y: 3.55, w: 10, h: 0.5,
      fontSize: 18, color: "B8C4D8", fontFace: "Arial",
    });

    // Date
    s.addText(today, {
      x: 0.6, y: 4.2, w: 5, h: 0.35,
      fontSize: 11, color: "8A9AB8", fontFace: "Arial",
    });

    // Eyebrow — top left
    s.addText("CONFIDENTIAL  ·  PRELIMINARY  ·  FOR DISCUSSION ONLY", {
      x: 0.6, y: 0.4, w: 11, h: 0.28,
      fontSize: 7.5, color: "6B7E9E", fontFace: "Arial", charSpacing: 2,
    });

    // Bottom footer bar
    s.addShape("rect", {
      x: 0, y: 6.9, w: "100%", h: 0.6,
      fill: { color: "0D1A30" },
      line: { color: "0D1A30", width: 0 },
    });

    s.addText("Prepared by LexAi  ·  Hypothetical template — brand specs pending from LionTree", {
      x: 0.6, y: 6.94, w: 9, h: 0.36,
      fontSize: 8, color: "4A5A78",
      fontFace: "Arial", italic: true,
    });

    s.addText("LIONTREE", {
      x: 10.3, y: 6.94, w: 2.7, h: 0.36,
      fontSize: 10, bold: true,
      color: WHITE, fontFace: "Arial", align: "right",
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SLIDE 2 — Historical Financial Performance
  // ══════════════════════════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addSlideChrome(s, "Historical Financial Performance", company, 2);

    const numCols = fd.years.length;
    const labelW  = 3.2;
    const dataW   = parseFloat(((12.55 - labelW) / numCols).toFixed(2));
    const colW    = [labelW, ...fd.years.map(() => dataW)];

    const rows: PptxGenJS.TableRow[] = [
      // Header row
      [
        tCell("", true, NAVY, WHITE),
        ...fd.years.map(y => tCell(y, true, NAVY, WHITE, "center")),
      ],
    ];

    // Revenue
    rows.push([
      tCell(`Revenue (${fd.unit})`, true, WHITE, TEXT_DARK),
      ...fd.revenue.map(v =>
        tCell(v === null ? "—" : fmt(v), true, WHITE, TEXT_DARK, "right")
      ),
    ]);

    // Revenue growth (sub-row)
    const revGrowthRow: PptxGenJS.TableCell[] = [
      tCell("  % Growth", false, ROW_SUB, TEXT_SUB),
    ];
    for (let i = 0; i < fd.revenue.length; i++) {
      const curr = fd.revenue[i];
      const prev = i > 0 ? fd.revenue[i - 1] : null;
      const val  = curr && prev && prev !== 0 ? pct((curr - prev) / Math.abs(prev)) : "—";
      revGrowthRow.push(tCell(val, false, ROW_SUB, TEXT_SUB, "right"));
    }
    rows.push(revGrowthRow);

    // EBITDA
    rows.push([
      tCell(`EBITDA (${fd.unit})`, true, ROW_ALT, TEXT_DARK),
      ...fd.ebitda.map(v =>
        tCell(v === null ? "—" : fmt(v), true, ROW_ALT, TEXT_DARK, "right")
      ),
    ]);

    // EBITDA margin (sub-row)
    const marginRow: PptxGenJS.TableCell[] = [
      tCell("  % Margin", false, ROW_SUB, TEXT_SUB),
    ];
    for (let i = 0; i < fd.ebitda.length; i++) {
      const e = fd.ebitda[i];
      const r = fd.revenue[i];
      const val = e !== null && r !== null && r !== 0 ? pct(e / r) : "—";
      marginRow.push(tCell(val, false, ROW_SUB, TEXT_SUB, "right"));
    }
    rows.push(marginRow);

    // EBIT
    rows.push([
      tCell(`EBIT (${fd.unit})`, false, WHITE, TEXT_DARK),
      ...fd.ebit.map(v =>
        tCell(v === null ? "—" : fmt(v), false, WHITE, TEXT_DARK, "right")
      ),
    ]);

    // D&A
    rows.push([
      tCell(`D&A (${fd.unit})`, false, ROW_ALT, TEXT_DARK),
      ...fd.da.map(v =>
        tCell(v === null ? "—" : fmt(v), false, ROW_ALT, TEXT_DARK, "right")
      ),
    ]);

    // CapEx
    rows.push([
      tCell(`CapEx (${fd.unit})`, false, WHITE, TEXT_DARK),
      ...fd.capex.map(v =>
        tCell(v === null ? "—" : fmt(v), false, WHITE, TEXT_DARK, "right")
      ),
    ]);

    s.addTable(rows, {
      x: 0.4, y: 1.05, w: 12.55,
      colW,
      rowH: 0.42,
      fontFace: "Arial", fontSize: 10,
    });

    s.addText(
      `Source: Company financial statements.  All figures in ${fd.currency} ${fd.unit} unless otherwise noted.`,
      { x: 0.4, y: 6.8, w: 10, h: 0.25, fontSize: 7, color: FOOTER_TX, fontFace: "Arial", italic: true }
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SLIDE 3 — DCF Assumptions
  // ══════════════════════════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addSlideChrome(s, "Key Valuation Assumptions", company, 3);

    // Left panel heading
    s.addText("DCF Assumptions", {
      x: 0.4, y: 1.1, w: 5.9, h: 0.32,
      fontSize: 11, bold: true, color: NAVY, fontFace: "Arial",
    });

    const dcfRows: PptxGenJS.TableRow[] = [
      [tCell("Assumption", true, NAVY, WHITE), tCell("Value", true, NAVY, WHITE, "center")],
      [tCell("WACC", false, WHITE, TEXT_DARK),              tCell(pct(a.wacc),       false, WHITE,   NAVY, "center")],
      [tCell("Terminal Growth Rate", false, ROW_ALT, TEXT_DARK), tCell(pct(a.termGrowth), false, ROW_ALT, NAVY, "center")],
      [tCell("Effective Tax Rate", false, WHITE, TEXT_DARK),   tCell(pct(a.taxRate),   false, WHITE,   NAVY, "center")],
      [tCell("Projection Horizon", false, ROW_ALT, TEXT_DARK), tCell("5 years",          false, ROW_ALT, NAVY, "center")],
    ];

    s.addTable(dcfRows, {
      x: 0.4, y: 1.47, w: 5.9,
      colW: [3.9, 2.0], rowH: 0.44,
      fontFace: "Arial", fontSize: 10,
    });

    // Right panel heading
    s.addText("Projection Drivers", {
      x: 7.0, y: 1.1, w: 5.95, h: 0.32,
      fontSize: 11, bold: true, color: NAVY, fontFace: "Arial",
    });
    s.addText("Auto-set from historical averages; editable in Excel model", {
      x: 7.0, y: 1.44, w: 5.95, h: 0.22,
      fontSize: 7.5, color: TEXT_GRAY, fontFace: "Arial", italic: true,
    });

    const driverRows: PptxGenJS.TableRow[] = [
      [tCell("Driver", true, NAVY, WHITE), tCell("Value", true, NAVY, WHITE, "center")],
      [tCell("Revenue Growth (YoY)", false, WHITE,   TEXT_DARK), tCell(pct(a.revGrowth),    false, WHITE,   NAVY, "center")],
      [tCell("EBITDA Margin",        false, ROW_ALT, TEXT_DARK), tCell(pct(a.ebitdaMargin), false, ROW_ALT, NAVY, "center")],
      [tCell("D&A % of Revenue",     false, WHITE,   TEXT_DARK), tCell(pct(a.daRevPct),     false, WHITE,   NAVY, "center")],
      [tCell("CapEx % of Revenue",   false, ROW_ALT, TEXT_DARK), tCell(pct(a.capexRevPct),  false, ROW_ALT, NAVY, "center")],
    ];

    s.addTable(driverRows, {
      x: 7.0, y: 1.68, w: 5.95,
      colW: [3.9, 2.05], rowH: 0.44,
      fontFace: "Arial", fontSize: 10,
    });

    // Methodology note box
    s.addShape("rect", {
      x: 0.4, y: 5.2, w: 12.55, h: 1.65,
      fill: { color: "F0F3F8" },
      line: { color: BORDER, width: 0.75 },
    });

    s.addText("Methodology Note", {
      x: 0.65, y: 5.32, w: 3, h: 0.26,
      fontSize: 8.5, bold: true, color: NAVY, fontFace: "Arial",
    });

    s.addText(
      "Free cash flows are projected over a 5-year horizon using the assumptions above. " +
      "FCF = NOPLAT + D&A − CapEx, where NOPLAT = EBIT × (1 − Tax Rate). " +
      "Terminal value is calculated using the Gordon Growth Model applied to Year 5 FCF. " +
      "Enterprise Value = PV of projected FCFs + PV of terminal value. " +
      "Equity Value = Enterprise Value − Net Debt. " +
      "Intrinsic value per share assumes diluted share count as of the most recent period.",
      {
        x: 0.65, y: 5.6, w: 12.1, h: 1.1,
        fontSize: 8.5, color: TEXT_DARK, fontFace: "Arial",
        paraSpaceBefore: 2,
      }
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SLIDE 4 — Football Field (WACC Sensitivity)
  // ══════════════════════════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addSlideChrome(s, "Valuation Sensitivity — WACC Football Field", company, 4);

    const LABEL_X  = 0.4;
    const LABEL_W  = 2.5;
    const BAR_X    = 3.05;
    const BAR_AREA = 9.0;
    const BAR_H    = 0.52;
    const ROW_H    = 0.9;
    const FIRST_Y  = 1.2;
    const VALUE_W  = 1.5;

    // Bull (high equity) on top, Bear on bottom
    const displayRows = [...ffScenarios].reverse();
    const maxVal = Math.max(...displayRows.map(r => r.equity));

    // Bar shades: darkest navy for Bull, lighter for Bear
    const barShades = ["1B2A4A", "2C4470", "3D5E96", "5578B8", "7094CC"];

    displayRows.forEach((row, i) => {
      const y      = FIRST_Y + i * ROW_H;
      const barW   = (row.equity / maxVal) * (BAR_AREA - VALUE_W);
      const shade  = barShades[i] ?? NAVY;
      const isBase = row.label === "Base Case";

      // Subtle alternating row background (very light)
      s.addShape("rect", {
        x: LABEL_X, y: y - 0.08, w: 12.55, h: ROW_H - 0.04,
        fill: { color: i % 2 === 0 ? "F8F9FB" : WHITE },
        line: { color: i % 2 === 0 ? "F8F9FB" : WHITE, width: 0 },
      });

      // Row label
      s.addText(row.label, {
        x: LABEL_X, y, w: LABEL_W, h: BAR_H,
        fontSize: isBase ? 10 : 9.5,
        bold: isBase,
        color: isBase ? NAVY : TEXT_DARK,
        fontFace: "Arial",
        align: "right", valign: "middle",
      });

      // Bar (flat — no shadow)
      s.addShape("rect", {
        x: BAR_X, y, w: barW, h: BAR_H,
        fill: { color: shade },
        line: { color: shade, width: 0 },
      });

      // Thin top-edge accent line on Base Case bar
      if (isBase) {
        s.addShape("line", {
          x: BAR_X, y, w: barW, h: 0,
          line: { color: "AABCD8", width: 1.5 },
        });
      }

      // WACC label inside bar (if wide enough)
      const waccDelta = (2 - i) * -0.01;
      const sign = waccDelta >= 0 ? "+" : "";
      const wLabel = `WACC ${sign}${(waccDelta * 100).toFixed(0)}%`;
      if (barW > 1.6) {
        s.addText(wLabel, {
          x: BAR_X + 0.12, y: y + 0.02, w: 1.6, h: BAR_H - 0.04,
          fontSize: 7.5, color: "C8D8F0", fontFace: "Arial", valign: "middle",
        });
      }

      // Value label to the right of bar
      s.addText(`$${fmt(Math.round(row.equity))}M`, {
        x: BAR_X + barW + 0.1, y, w: VALUE_W, h: BAR_H,
        fontSize: isBase ? 11 : 10,
        bold: isBase,
        color: isBase ? NAVY : TEXT_DARK,
        fontFace: "Arial", valign: "middle",
      });
    });

    // Axis line at base of bars
    const axisY = FIRST_Y + displayRows.length * ROW_H;
    s.addShape("line", {
      x: BAR_X, y: axisY, w: BAR_AREA - VALUE_W, h: 0,
      line: { color: NAVY, width: 1 },
    });

    s.addText(`Equity Value (${fd.currency} ${fd.unit})`, {
      x: BAR_X, y: axisY + 0.12, w: BAR_AREA - VALUE_W, h: 0.25,
      fontSize: 7.5, color: TEXT_GRAY, fontFace: "Arial", align: "center",
    });

    s.addText(
      `WACC sensitivity: ${pct(a.wacc - 0.02)} to ${pct(a.wacc + 0.02)}  ·  Terminal growth rate held constant at ${pct(a.termGrowth)}  ·  All other assumptions unchanged.`,
      { x: 0.4, y: 6.8, w: 12.55, h: 0.25, fontSize: 7, color: FOOTER_TX, fontFace: "Arial", italic: true }
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SLIDE 5 — Valuation Summary
  // ══════════════════════════════════════════════════════════════════════════
  {
    const s = pptx.addSlide();
    addSlideChrome(s, "Valuation Summary", company, 5);

    const bridgeItems = [
      {
        label: "Enterprise Value",
        sub: "PV of projected FCFs + PV of terminal value",
        value: `$${fmt(Math.round(baseEV))}`,
        bold: false,
        bg: ROW_ALT,
        fg: TEXT_DARK,
        valueFg: NAVY,
      },
      {
        label: fd.net_debt && fd.net_debt > 0 ? "Less: Net Debt" : "Plus: Net Cash",
        sub: "Total debt minus cash and cash equivalents",
        value: `($${fmt(Math.abs(Math.round(fd.net_debt ?? 0)))})`,
        bold: false,
        bg: WHITE,
        fg: TEXT_DARK,
        valueFg: fd.net_debt && fd.net_debt > 0 ? "B03A2E" : "1E8449",
      },
      {
        label: "Equity Value",
        sub: "Enterprise Value minus net debt",
        value: `$${fmt(Math.round(baseEquity))}`,
        bold: true,
        bg: NAVY,
        fg: WHITE,
        valueFg: WHITE,
      },
      ...(fd.share_count
        ? [{
            label: "Diluted Shares Outstanding",
            sub: "Most recent reporting period",
            value: `${fmt(fd.share_count, 1)}M`,
            bold: false,
            bg: ROW_ALT,
            fg: TEXT_DARK,
            valueFg: TEXT_DARK,
          }]
        : []),
      ...(intrinsic
        ? [{
            label: "Implied Intrinsic Value / Share",
            sub: `Base case WACC: ${pct(a.wacc)}  ·  Terminal growth: ${pct(a.termGrowth)}`,
            value: `$${fmt(intrinsic, 2)}`,
            bold: true,
            bg: "EAF0F8",
            fg: NAVY,
            valueFg: NAVY,
          }]
        : []),
    ];

    bridgeItems.forEach((item, i) => {
      const y = 1.1 + i * 0.84;

      s.addShape("rect", {
        x: 0.4, y, w: 12.55, h: 0.74,
        fill: { color: item.bg },
        line: { color: BORDER, width: item.bold ? 0 : 0.5 },
      });

      s.addText(item.label, {
        x: 0.65, y: y + 0.06, w: 7.5, h: 0.32,
        fontSize: item.bold ? 13 : 11, bold: item.bold,
        color: item.fg, fontFace: "Arial",
      });

      s.addText(item.sub, {
        x: 0.65, y: y + 0.4, w: 7.5, h: 0.25,
        fontSize: 7.5, color: item.bold ? (item.fg === WHITE ? "8AAAC8" : TEXT_GRAY) : TEXT_GRAY,
        fontFace: "Arial", italic: true,
      });

      s.addText(item.value, {
        x: 9.0, y: y + 0.02, w: 3.7, h: 0.7,
        fontSize: item.bold ? 20 : 15, bold: item.bold,
        color: item.valueFg, fontFace: "Arial",
        align: "right", valign: "middle",
      });
    });

    // Key stats row
    const stats = [
      { label: "Revenue CAGR",      value: pct(revCagr),               sub: `${fd.years[0]}–${lastHistYr}` },
      { label: "EBITDA Margin",     value: pct(ebitdaMarginPct),        sub: `${lastHistYr} actual` },
      { label: "Implied EV/EBITDA", value: lastEbitda > 0 ? `${fmt(baseEV / lastEbitda, 1)}x` : "—", sub: `Based on ${lastHistYr}` },
      { label: "Base WACC",         value: pct(a.wacc),                 sub: "Discount rate" },
    ];

    const boxW = 12.55 / stats.length;
    stats.forEach((stat, i) => {
      const x = 0.4 + i * boxW;
      s.addShape("rect", {
        x, y: 6.08, w: boxW - 0.06, h: 0.82,
        fill: { color: NAVY },
        line: { color: NAVY, width: 0 },
      });
      s.addText(stat.value, {
        x, y: 6.1, w: boxW - 0.06, h: 0.3,
        fontSize: 13, bold: true, color: WHITE,
        fontFace: "Arial", align: "center", valign: "bottom",
      });
      s.addText(stat.label, {
        x, y: 6.41, w: boxW - 0.06, h: 0.22,
        fontSize: 7.5, color: "B8C8DC",
        fontFace: "Arial", align: "center",
      });
      s.addText(stat.sub, {
        x, y: 6.63, w: boxW - 0.06, h: 0.2,
        fontSize: 6.5, color: "6880A0",
        fontFace: "Arial", align: "center",
      });
    });
  }

  // ── Serialize ─────────────────────────────────────────────────────────────
  const arrayBuffer = await pptx.write({ outputType: "arraybuffer" }) as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}
