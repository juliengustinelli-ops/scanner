"use client";

import { useCallback, useRef, useState } from "react";
import type { FinancialData, ProjectionAssumptions } from "@/lib/dcf";

type AppState =
  | { status: "idle" }
  | { status: "extracting"; filename: string }
  | { status: "excel_ready"; financialData: FinancialData; assumptions: ProjectionAssumptions; excelUrl: string; excelFilename: string }
  | { status: "building_deck"; financialData: FinancialData; assumptions: ProjectionAssumptions }
  | { status: "deck_ready"; financialData: FinancialData; assumptions: ProjectionAssumptions; pptxUrl: string; pptxFilename: string; excelUrl: string; excelFilename: string }
  | { status: "error"; message: string; prev?: AppState };

export default function DcfPage() {
  const [state, setState] = useState<AppState>({ status: "idle" });
  const [isDragging, setIsDragging] = useState(false);
  const pdfInputRef  = useRef<HTMLInputElement>(null);
  const xlsxInputRef = useRef<HTMLInputElement>(null);

  // ── Step 1: PDF upload & extraction ─────────────────────────────────────────

  const handlePdf = useCallback(async (file: File) => {
    setState({ status: "extracting", filename: file.name });
    try {
      const apiKey = localStorage.getItem("openai_api_key") || "";
      const formData = new FormData();
      formData.append("pdf", file);
      formData.append("apiKey", apiKey);
      const extractRes = await fetch("/api/extract", { method: "POST", body: formData });
      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Server error: ${extractRes.status}`);
      }
      const { financialData, assumptions } = await extractRes.json();

      // Immediately generate the Excel
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financialData, assumptions }),
      });
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Excel generation failed: ${genRes.status}`);
      }
      const blob         = await genRes.blob();
      const excelUrl     = URL.createObjectURL(blob);
      const excelFilename = genRes.headers.get("X-Filename") || `${financialData.company}-DCF.xlsx`;

      setState({ status: "excel_ready", financialData, assumptions, excelUrl, excelFilename });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
  }, []);

  const onPdfDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handlePdf(file);
  }, [handlePdf]);

  // ── Step 2: Excel upload & deck generation ───────────────────────────────────

  const handleXlsx = async (file: File) => {
    if (state.status !== "excel_ready" && state.status !== "deck_ready") return;
    const { excelUrl, excelFilename } = state.status === "excel_ready"
      ? state
      : { excelUrl: state.excelUrl, excelFilename: state.excelFilename };

    setState({ status: "building_deck", financialData: state.financialData, assumptions: state.assumptions });

    try {
      // Read assumptions from the uploaded Excel
      const formData = new FormData();
      formData.append("xlsx", file);
      const readRes = await fetch("/api/read-excel", { method: "POST", body: formData });
      if (!readRes.ok) throw new Error("Could not read the Excel file.");
      const { financialData: updatedFd, assumptions: updatedA } = await readRes.json();

      // Generate pitch deck with those numbers
      const pptxRes = await fetch("/api/pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financialData: updatedFd, assumptions: updatedA }),
      });
      if (!pptxRes.ok) {
        const err = await pptxRes.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Pitch deck generation failed.");
      }
      const blob        = await pptxRes.blob();
      const pptxUrl     = URL.createObjectURL(blob);
      const pptxFilename = pptxRes.headers.get("X-Filename") || `${updatedFd.company}-Pitch-Deck.pptx`;

      setState({ status: "deck_ready", financialData: updatedFd, assumptions: updatedA, pptxUrl, pptxFilename, excelUrl, excelFilename });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Something went wrong.", prev: state as AppState });
    }

    if (xlsxInputRef.current) xlsxInputRef.current.value = "";
  };

  const reset = () => {
    if (state.status === "excel_ready") URL.revokeObjectURL(state.excelUrl);
    if (state.status === "deck_ready") { URL.revokeObjectURL(state.pptxUrl); URL.revokeObjectURL(state.excelUrl); }
    setState({ status: "idle" });
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  };

  // ── Step indicators ──────────────────────────────────────────────────────────

  const step = state.status === "idle" || state.status === "extracting" ? 1
    : state.status === "excel_ready" || state.status === "building_deck" ? 2
    : state.status === "deck_ready" ? 3
    : state.status === "error" && state.prev ? 2
    : 1;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">

      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-white mb-2">DCF Populator</h1>
        <p className="text-sm max-w-md" style={{ color: "#666" }}>
          Upload a financial PDF. Edit your model in Excel. Get a branded pitch deck.
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {[
          { n: 1, label: "Upload PDF" },
          { n: 2, label: "Edit in Excel" },
          { n: 3, label: "Download Deck" },
        ].map(({ n, label }, i) => (
          <div key={n} className="flex items-center gap-2">
            {i > 0 && <div className="w-8 h-px" style={{ background: step > n - 1 ? "#A07828" : "#222" }} />}
            <div className="flex items-center gap-1.5" style={{ color: step === n ? "white" : step > n ? "#C9A84C" : "#444" }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: step === n ? "#A07828" : step > n ? "#1a1500" : "#1a1a1a",
                  color: step === n ? "white" : step > n ? "#C9A84C" : "#444",
                }}>
                {step > n ? "✓" : n}
              </div>
              <span className="text-xs font-medium hidden sm:inline">{label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-xl rounded-2xl p-8" style={{ background: "#161616", border: "1px solid #222" }}>

        {/* ── Step 1: Drop PDF ── */}
        {(state.status === "idle") && (
          <div>
            <p className="text-sm font-medium text-white mb-4">Upload a financial PDF</p>
            <div
              onClick={() => pdfInputRef.current?.click()}
              onDrop={onPdfDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all"
              style={{ borderColor: isDragging ? "#A07828" : "#2a2a2a", background: isDragging ? "#1a1500" : "transparent" }}
            >
              <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdf(f); }} />
              <svg className="mx-auto w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "#444" }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <p className="text-sm font-medium" style={{ color: "#aaa" }}>Drop a PDF here, or click to browse</p>
              <p className="text-xs mt-1" style={{ color: "#555" }}>10-K, CIM, earnings report, or any financial PDF</p>
            </div>
          </div>
        )}

        {/* ── Extracting spinner ── */}
        {state.status === "extracting" && (
          <div className="text-center py-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full border-2 border-t-transparent animate-spin mb-5" style={{ borderColor: "#A07828", borderTopColor: "transparent" }} />
            <p className="text-white font-medium mb-1">Reading {state.filename}</p>
            <p className="text-sm" style={{ color: "#555" }}>Extracting financials and building your model…</p>
            <p className="text-xs mt-2" style={{ color: "#444" }}>This takes about 30 seconds</p>
          </div>
        )}

        {/* ── Step 2: Download & re-upload Excel ── */}
        {state.status === "excel_ready" && (
          <div>
            <div className="flex items-center gap-3 mb-6 pb-5 border-b" style={{ borderColor: "#222" }}>
              <div className="w-9 h-9 rounded-full bg-green-900/40 border border-green-700 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold">{state.financialData.company}</p>
                <p className="text-xs">
                  {state.financialData.years[0]}–{state.financialData.years[state.financialData.years.length - 1]} · {state.financialData.currency} in {state.financialData.unit}
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {/* 2a: Download */}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">1 — Download your model</p>
                <a
                  href={state.excelUrl}
                  download={state.excelFilename}
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold py-3 px-5 rounded-xl transition-colors text-sm w-full justify-center"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Excel Model (.xlsx)
                </a>
              </div>

              {/* Instruction */}
              <div className="bg-slate-800/50 rounded-xl px-4 py-3 text-xs text-slate-400 leading-relaxed">
                Open the file in Excel. Adjust any numbers — assumptions are in cells <span className="text-slate-200 font-mono">B5–B11</span>. Save when done.
              </div>

              {/* 2b: Re-upload */}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">2 — Upload edited Excel to generate deck</p>
                <input ref={xlsxInputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleXlsx(f); }} />
                <button
                  onClick={() => xlsxInputRef.current?.click()}
                  className="flex items-center gap-2 border-2 border-dashed border-slate-600 hover:border-blue-500 hover:bg-blue-950/20 text-slate-300 hover:text-white font-medium py-4 px-5 rounded-xl transition-all text-sm w-full justify-center"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  Upload edited Excel
                </button>
              </div>
            </div>

            <button onClick={reset} className="mt-6 w-full text-slate-600 hover:text-slate-400 text-xs transition-colors">
              ← Start over with a different PDF
            </button>
          </div>
        )}

        {/* ── Building deck spinner ── */}
        {state.status === "building_deck" && (
          <div className="text-center py-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mb-5" />
            <p className="text-white font-medium mb-1">Building pitch deck</p>
            <p className="text-slate-400 text-sm">Reading your model and generating slides…</p>
          </div>
        )}

        {/* ── Step 3: Download deck ── */}
        {state.status === "deck_ready" && (
          <div>
            <div className="flex items-center gap-3 mb-6 pb-5 border-b" style={{ borderColor: "#222" }}>
              <div className="w-9 h-9 rounded-full bg-blue-900/40 border border-blue-700 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold">{state.financialData.company}</p>
                <p className="text-xs">Pitch deck ready</p>
              </div>
            </div>

            <div className="space-y-3">
              <a
                href={state.pptxUrl}
                download={state.pptxFilename}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-5 rounded-xl transition-colors text-sm w-full justify-center"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Pitch Deck (.pptx)
              </a>

              <a
                href={state.excelUrl}
                download={state.excelFilename}
                className="flex items-center gap-2 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white py-2.5 px-5 rounded-xl transition-colors text-sm w-full justify-center"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Re-download Excel Model
              </a>

              {/* Upload again to regenerate */}
              <input ref={xlsxInputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleXlsx(f); }} />
              <button
                onClick={() => xlsxInputRef.current?.click()}
                className="w-full text-slate-600 hover:text-slate-400 text-xs py-1.5 transition-colors"
              >
                Upload a different Excel to regenerate deck
              </button>
            </div>

            <button onClick={reset} className="mt-4 w-full text-slate-600 hover:text-slate-400 text-xs transition-colors">
              ← Start over with a different PDF
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {state.status === "error" && (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-900/30 border border-red-800 mb-4">
              <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-red-300 font-medium mb-1">Something went wrong</p>
            <p className="text-slate-500 text-sm mb-5">{state.message}</p>
            <button onClick={reset} className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-2.5 rounded-xl transition-colors text-sm">
              Start over
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
