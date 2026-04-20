"use client";

import Script from "next/script";
import { useState, useCallback } from "react";
import type { FinancialData, ProjectionAssumptions } from "@/lib/dcf";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const Office: any;
declare const Excel: any;

type AddinState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "reading" }
  | { status: "reviewed"; financialData: FinancialData; assumptions: ProjectionAssumptions }
  | { status: "generating"; financialData: FinancialData; assumptions: ProjectionAssumptions }
  | { status: "done"; pptxUrl: string; pptxFilename: string; financialData: FinancialData; assumptions: ProjectionAssumptions }
  | { status: "error"; message: string };

const ROWS = {
  WACC: 5, TERM_GROWTH: 6, TAX: 7, REV_GROWTH: 8,
  EBITDA_MARGIN: 9, DA_PCT: 10, CAPEX_PCT: 11,
  FY_HDR: 14, YEAR_INDEX: 13,
  REV: 16, EBITDA: 18, DA: 21, EBIT: 23, CAPEX: 32,
  NET_DEBT: 42, SHARES: 44,
};

// Convert 1-based row/col to A1 notation (up to col Z)
function cellAddr(row: number, col: number): string {
  return `${String.fromCharCode(64 + col)}${row}`;
}

function rangeAddr(row: number, startCol: number, endCol: number): string {
  return `${cellAddr(row, startCol)}:${cellAddr(row, endCol)}`;
}

async function readWorkbook(): Promise<{ financialData: FinancialData; assumptions: ProjectionAssumptions }> {
  return Excel.run(async (ctx: any) => {
    const ws = ctx.workbook.worksheets.getActiveWorksheet();
    const MAX_COL = 11; // B(2) to K(11) — up to 10 year columns

    // Load all needed ranges
    const titleR    = ws.getRange("A1");
    const fyLabelR  = ws.getRange("A14");
    const assumR    = ws.getRange(`B5:B11`);
    const yearIdxR  = ws.getRange(rangeAddr(ROWS.YEAR_INDEX, 2, MAX_COL));
    const fyHdrR    = ws.getRange(rangeAddr(ROWS.FY_HDR,     2, MAX_COL));
    const revR      = ws.getRange(rangeAddr(ROWS.REV,        2, MAX_COL));
    const ebitdaR   = ws.getRange(rangeAddr(ROWS.EBITDA,     2, MAX_COL));
    const daR       = ws.getRange(rangeAddr(ROWS.DA,         2, MAX_COL));
    const ebitR     = ws.getRange(rangeAddr(ROWS.EBIT,       2, MAX_COL));
    const capexR    = ws.getRange(rangeAddr(ROWS.CAPEX,      2, MAX_COL));
    const netDebtR  = ws.getRange("B42");
    const sharesR   = ws.getRange("B44");

    [titleR, fyLabelR, assumR, yearIdxR, fyHdrR, revR, ebitdaR, daR, ebitR, capexR, netDebtR, sharesR]
      .forEach((r) => r.load("values"));

    await ctx.sync();

    // Parse company name from title "COMPANY — DCF VALUATION MODEL"
    const titleStr  = String(titleR.values?.[0]?.[0] ?? "");
    const company   = titleStr.split("—")[0].trim() || "Company";

    // Parse currency/unit from FY header "Fiscal Year  (USD in millions)"
    const fyLabel   = String(fyLabelR.values?.[0]?.[0] ?? "");
    const currMatch = fyLabel.match(/\((\w+)\s+in\s+(\w+)\)/);
    const currency  = currMatch?.[1] ?? "USD";
    const unit      = currMatch?.[2] ?? "millions";

    // Determine historical column count: year-index row is empty for hist cols
    const yearIdxVals: any[] = yearIdxR.values?.[0] ?? [];
    const histN = yearIdxVals.findIndex((v: any) => v !== null && v !== "" && v !== 0);
    const actualHistN = histN === -1 ? yearIdxVals.length : histN;

    // Read year labels
    const fyVals: any[] = fyHdrR.values?.[0] ?? [];
    const years: string[] = fyVals.slice(0, actualHistN).map((v: any) => String(v)).filter(Boolean);

    const toNum = (v: any): number | null => {
      const n = typeof v === "number" ? v : parseFloat(v);
      return isFinite(n) ? n : null;
    };

    const readHistArr = (rowVals: any[][], negate = false): (number | null)[] =>
      (rowVals?.[0] ?? []).slice(0, actualHistN).map((v: any) => {
        const n = toNum(v);
        return n !== null && negate ? -n : n;
      });

    const assumptions: ProjectionAssumptions = {
      wacc:         toNum(assumR.values?.[0]?.[0]) ?? 0.10,
      termGrowth:   toNum(assumR.values?.[1]?.[0]) ?? 0.025,
      taxRate:      toNum(assumR.values?.[2]?.[0]) ?? 0.25,
      revGrowth:    toNum(assumR.values?.[3]?.[0]) ?? 0.05,
      ebitdaMargin: toNum(assumR.values?.[4]?.[0]) ?? 0.20,
      daRevPct:     toNum(assumR.values?.[5]?.[0]) ?? 0.03,
      capexRevPct:  toNum(assumR.values?.[6]?.[0]) ?? 0.04,
    };

    const netDebtStored = toNum(netDebtR.values?.[0]?.[0]);

    const financialData: FinancialData = {
      company, currency, unit, years,
      revenue: readHistArr(revR.values),
      ebitda:  readHistArr(ebitdaR.values),
      ebit:    readHistArr(ebitR.values),
      da:      readHistArr(daR.values),
      capex:   readHistArr(capexR.values, true), // stored negative, flip to positive
      net_debt:    netDebtStored !== null ? -netDebtStored : null,
      cash:        null,
      share_count: toNum(sharesR.values?.[0]?.[0]),
      tax_rate:    assumptions.taxRate,
      uncertain_cells: [],
    };

    return { financialData, assumptions };
  });
}

export default function AddinPage() {
  const [state, setState] = useState<AddinState>({ status: "loading" });

  const onOfficeReady = useCallback(() => {
    Office.onReady((info: any) => {
      if (info.host === Office.HostType?.Excel || info.host === "Excel") {
        setState({ status: "ready" });
      } else {
        setState({ status: "error", message: "Open this add-in inside Microsoft Excel." });
      }
    });
  }, []);

  const handleReadWorkbook = async () => {
    setState({ status: "reading" });
    try {
      const { financialData, assumptions } = await readWorkbook();
      setState({ status: "reviewed", financialData, assumptions });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Could not read workbook." });
    }
  };

  const handleGenerate = async (financialData: FinancialData, assumptions: ProjectionAssumptions) => {
    setState({ status: "generating", financialData, assumptions });
    try {
      const res = await fetch("/api/pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financialData, assumptions }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Server error: ${res.status}`);
      }
      const blob     = await res.blob();
      const pptxUrl  = URL.createObjectURL(blob);
      const filename = res.headers.get("X-Filename") || `${financialData.company}-Pitch-Deck.pptx`;
      setState({ status: "done", pptxUrl, pptxFilename: filename, financialData, assumptions });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Generation failed." });
    }
  };

  return (
    <>
      <Script
        src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
        strategy="afterInteractive"
        onLoad={onOfficeReady}
      />

      <main className="min-h-screen bg-slate-950 text-white p-4 text-sm">
        {/* Header */}
        <div className="flex items-center gap-2 mb-5 pb-4 border-b border-slate-800">
          <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-xs font-bold">L</div>
          <span className="text-slate-300 font-semibold tracking-wide">LexAi DCF Tools</span>
        </div>

        {/* Loading Office.js */}
        {state.status === "loading" && (
          <div className="text-center py-10">
            <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-xs">Connecting to Excel…</p>
          </div>
        )}

        {/* Ready — prompt user to read */}
        {state.status === "ready" && (
          <div>
            <p className="text-slate-300 mb-1 font-medium">DCF Pitch Deck Generator</p>
            <p className="text-slate-500 text-xs mb-5 leading-relaxed">
              Open your LexAi DCF workbook, then click below to read the model and generate a branded pitch deck.
            </p>
            <button
              onClick={handleReadWorkbook}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              Read Active Workbook
            </button>
          </div>
        )}

        {/* Reading */}
        {state.status === "reading" && (
          <div className="text-center py-10">
            <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-xs">Reading workbook…</p>
          </div>
        )}

        {/* Reviewed — show summary + assumptions */}
        {(state.status === "reviewed" || state.status === "generating") && (
          <ReviewedView
            state={state as Extract<AddinState, { status: "reviewed" | "generating" }>}
            onGenerate={handleGenerate}
            onReread={handleReadWorkbook}
          />
        )}

        {/* Done */}
        {state.status === "done" && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-5 h-5 rounded-full bg-green-900/50 border border-green-700 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white font-semibold">{state.financialData.company}</p>
            </div>

            <a
              href={state.pptxUrl}
              download={state.pptxFilename}
              className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm w-full justify-center mb-3"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Pitch Deck
            </a>

            <button
              onClick={() => handleGenerate(state.financialData, state.assumptions)}
              className="w-full text-slate-500 hover:text-slate-300 text-xs py-1.5 transition-colors"
            >
              Regenerate
            </button>
            <button
              onClick={handleReadWorkbook}
              className="w-full text-slate-500 hover:text-slate-300 text-xs py-1 transition-colors"
            >
              Re-read workbook
            </button>
          </div>
        )}

        {/* Error */}
        {state.status === "error" && (
          <div>
            <p className="text-red-300 font-medium mb-1">Error</p>
            <p className="text-slate-400 text-xs mb-4 leading-relaxed">{state.message}</p>
            <button
              onClick={() => setState({ status: "ready" })}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              Try again
            </button>
          </div>
        )}
      </main>
    </>
  );
}

// ── Reviewed view with editable assumptions ───────────────────────────────────

type ReviewedOrGenerating = Extract<AddinState, { status: "reviewed" | "generating" }>;

function ReviewedView({
  state,
  onGenerate,
  onReread,
}: {
  state: ReviewedOrGenerating;
  onGenerate: (fd: FinancialData, a: ProjectionAssumptions) => void;
  onReread: () => void;
}) {
  const [a, setA] = useState<ProjectionAssumptions>(state.assumptions);
  const fd = state.financialData;
  const isGenerating = state.status === "generating";

  const field = (key: keyof ProjectionAssumptions, label: string, isInput: boolean) => (
    <div key={key} className="flex items-center justify-between gap-2 py-1">
      <label className="text-slate-400 text-xs flex-1">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="0.1"
          value={(a[key] * 100).toFixed(1)}
          onChange={(e) => setA((prev) => ({ ...prev, [key]: parseFloat(e.target.value || "0") / 100 }))}
          className={`w-16 text-right text-xs font-mono rounded px-1.5 py-1 border outline-none ${
            isInput
              ? "bg-green-950/40 border-green-800 text-green-300 focus:border-green-600"
              : "bg-blue-950/30 border-slate-700 text-blue-300 focus:border-blue-600"
          }`}
        />
        <span className="text-slate-600 text-xs">%</span>
      </div>
    </div>
  );

  const lastYear = fd.years[fd.years.length - 1];
  const lastRev  = fd.revenue[fd.revenue.length - 1];
  const lastEbitda = fd.ebitda[fd.ebitda.length - 1];

  return (
    <div>
      {/* Company summary */}
      <div className="mb-4 pb-3 border-b border-slate-800">
        <p className="text-white font-semibold truncate">{fd.company}</p>
        <p className="text-slate-500 text-xs mt-0.5">
          {fd.years[0]}–{lastYear} · {fd.currency} in {fd.unit}
        </p>
        <div className="flex gap-4 mt-2">
          {lastRev !== null && (
            <div>
              <p className="text-slate-600 text-xs">Revenue ({lastYear})</p>
              <p className="text-slate-300 text-xs font-medium">{lastRev?.toLocaleString()}</p>
            </div>
          )}
          {lastEbitda !== null && (
            <div>
              <p className="text-slate-600 text-xs">EBITDA ({lastYear})</p>
              <p className="text-slate-300 text-xs font-medium">{lastEbitda?.toLocaleString()}</p>
            </div>
          )}
        </div>
      </div>

      {/* Assumptions */}
      <div className="mb-4">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">DCF Assumptions</p>
        {field("wacc",       "WACC",               true)}
        {field("termGrowth", "Terminal Growth",     true)}
        {field("taxRate",    "Tax Rate",            true)}
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 mt-3">Projection Drivers</p>
        {field("revGrowth",    "Revenue Growth",    false)}
        {field("ebitdaMargin", "EBITDA Margin",     false)}
        {field("daRevPct",     "D&A % Revenue",     false)}
        {field("capexRevPct",  "CapEx % Revenue",   false)}
      </div>

      <button
        onClick={() => onGenerate(fd, a)}
        disabled={isGenerating}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 mb-2"
      >
        {isGenerating ? (
          <>
            <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            Building deck…
          </>
        ) : "Generate Pitch Deck"}
      </button>

      <button
        onClick={onReread}
        disabled={isGenerating}
        className="w-full text-slate-600 hover:text-slate-400 text-xs py-1.5 transition-colors disabled:opacity-40"
      >
        Re-read workbook
      </button>
    </div>
  );
}
