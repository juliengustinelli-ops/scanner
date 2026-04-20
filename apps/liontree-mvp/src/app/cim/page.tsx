"use client";

import { useCallback, useRef, useState } from "react";

type AppState =
  | { status: "idle" }
  | { status: "analyzing"; filename: string }
  | { status: "done"; summary: string; company: string; filename: string }
  | { status: "error"; message: string };

export default function CimPage() {
  const [state, setState]   = useState<AppState>({ status: "idle" });
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const analyze = useCallback(async (file: File) => {
    setState({ status: "analyzing", filename: file.name });
    try {
      const apiKey = localStorage.getItem("openai_api_key") || "";
      const formData = new FormData();
      formData.append("pdf", file);
      formData.append("apiKey", apiKey);

      const res = await fetch("/api/cim", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Server error: ${res.status}`);
      }
      const { summary, company } = await res.json();
      setState({ status: "done", summary, company, filename: file.name });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Analysis failed." });
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) analyze(file);
  }, [analyze]);

  const reset = () => {
    setState({ status: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="min-h-screen px-10 py-12 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-1">CIM Analyzer</h1>
      <p className="text-[#666] text-sm mb-8">
        Upload a CIM or information memorandum. Get a structured 1-page deal summary in seconds.
      </p>

      {state.status === "idle" && (
        <div>
          <div
            onClick={() => inputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all"
            style={{
              borderColor: isDragging ? "#A07828" : "#222",
              background: isDragging ? "#1a1500" : "#111",
            }}
          >
            <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) analyze(f); }} />
            <svg className="mx-auto w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "#444" }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-[#888] text-sm font-medium">Drop a CIM here, or click to browse</p>
            <p className="text-[#444] text-xs mt-1">PDF format · CIM, IM, or any deal document</p>
          </div>

          <div className="mt-5 rounded-xl p-4 text-xs text-[#555] leading-relaxed" style={{ background: "#111", border: "1px solid #1a1a1a" }}>
            <p className="text-[#777] font-medium mb-2">What you&apos;ll get:</p>
            <ul className="space-y-1">
              {[
                "Company overview & business description",
                "Key financial metrics (Revenue, EBITDA, margins)",
                "Investment highlights & key risks",
                "Management team summary",
                "Suggested deal angles for LionTree",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span style={{ color: "#A07828" }}>·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {state.status === "analyzing" && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full border-2 border-t-transparent animate-spin mb-5" style={{ borderColor: "#A07828", borderTopColor: "transparent" }} />
          <p className="text-white font-medium mb-1">Analyzing {state.filename}</p>
          <p className="text-[#555] text-sm">Extracting investment highlights and key metrics…</p>
        </div>
      )}

      {state.status === "done" && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-white font-semibold text-lg">{state.company}</h2>
              <p className="text-[#666] text-xs mt-0.5">{state.filename} · Deal Summary</p>
            </div>
            <button onClick={reset} className="text-xs text-[#555] hover:text-[#aaa] transition-colors">
              ← New document
            </button>
          </div>

          <div
            className="rounded-xl p-6 text-sm text-[#ccc] leading-relaxed whitespace-pre-wrap"
            style={{ background: "#111", border: "1px solid #1f1f1f" }}
          >
            {state.summary}
          </div>

          <button
            onClick={() => {
              const blob = new Blob([state.summary], { type: "text/plain" });
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement("a");
              a.href     = url;
              a.download = `${state.company}-Deal-Summary.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
            style={{ background: "#A07828", color: "white" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Summary
          </button>
        </div>
      )}

      {state.status === "error" && (
        <div className="text-center py-10">
          <p className="text-red-300 font-medium mb-1">Something went wrong</p>
          <p className="text-[#555] text-sm mb-5">{state.message}</p>
          <button onClick={reset} className="px-5 py-2.5 rounded-lg text-sm font-medium" style={{ background: "#1a1a1a", color: "#aaa" }}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
