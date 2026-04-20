"use client";

import { useRef, useState } from "react";

type MeetingType = "new_pitch" | "due_diligence" | "follow_up" | "management_presentation";

type AppState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "done"; brief: string; company: string }
  | { status: "error"; message: string };

const MEETING_LABELS: Record<MeetingType, string> = {
  new_pitch:                "New Pitch / First Meeting",
  due_diligence:            "Due Diligence",
  follow_up:                "Follow-Up",
  management_presentation:  "Management Presentation",
};

export default function MeetingPrepPage() {
  const [company, setCompany]       = useState("");
  const [meetingType, setMeetingType] = useState<MeetingType>("new_pitch");
  const [context, setContext]       = useState("");
  const [state, setState]           = useState<AppState>({ status: "idle" });
  const [file, setFile]             = useState<File | null>(null);
  const fileRef                     = useRef<HTMLInputElement>(null);

  const generate = async () => {
    if (!company.trim()) return;
    setState({ status: "generating" });

    try {
      const apiKey = localStorage.getItem("openai_api_key") || "";
      const formData = new FormData();
      formData.append("company", company.trim());
      formData.append("meetingType", meetingType);
      formData.append("context", context.trim());
      formData.append("apiKey", apiKey);
      if (file) formData.append("document", file);

      const res = await fetch("/api/meeting-prep", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Server error: ${res.status}`);
      }
      const { brief } = await res.json();
      setState({ status: "done", brief, company: company.trim() });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Generation failed." });
    }
  };

  const reset = () => {
    setState({ status: "idle" });
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="min-h-screen px-10 py-12 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-1">Meeting Prep</h1>
      <p className="text-[#666] text-sm mb-8">
        Generate a structured briefing document before any client meeting.
      </p>

      {(state.status === "idle" || state.status === "error") && (
        <div className="space-y-5">
          {state.status === "error" && (
            <div className="rounded-lg px-4 py-3 text-sm text-red-300" style={{ background: "#1a0a0a", border: "1px solid #3a1a1a" }}>
              {state.message}
            </div>
          )}

          {/* Company */}
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Company name</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Warner Bros. Discovery"
              className="w-full bg-[#111] border border-[#222] rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#444] outline-none focus:border-[#A07828] transition-colors"
            />
          </div>

          {/* Meeting type */}
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Meeting type</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(MEETING_LABELS) as MeetingType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setMeetingType(t)}
                  className="px-3 py-2.5 rounded-lg text-xs font-medium text-left transition-all"
                  style={{
                    background: meetingType === t ? "#1a1500" : "#111",
                    border: `1px solid ${meetingType === t ? "#A07828" : "#222"}`,
                    color: meetingType === t ? "#C9A84C" : "#888",
                  }}
                >
                  {MEETING_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Optional context */}
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">
              Additional context <span className="text-[#555] font-normal">(optional)</span>
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. They're exploring a sale of their streaming unit. Focus on precedent transactions in streaming M&A."
              rows={3}
              className="w-full bg-[#111] border border-[#222] rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#444] outline-none focus:border-[#A07828] transition-colors resize-none"
            />
          </div>

          {/* Optional document */}
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">
              Upload a document <span className="text-[#555] font-normal">(optional — CIM, press release, filing)</span>
            </label>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-all w-full"
              style={{ background: "#111", border: `1px solid ${file ? "#A07828" : "#222"}`, color: file ? "#C9A84C" : "#666" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {file ? file.name : "Attach PDF"}
            </button>
          </div>

          <button
            onClick={generate}
            disabled={!company.trim()}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "#A07828", color: "white" }}
          >
            Generate Meeting Brief
          </button>
        </div>
      )}

      {state.status === "generating" && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full border-2 border-t-transparent animate-spin mb-5" style={{ borderColor: "#A07828", borderTopColor: "transparent" }} />
          <p className="text-white font-medium mb-1">Preparing brief for {company}</p>
          <p className="text-[#555] text-sm">Researching company, recent transactions, and strategic context…</p>
        </div>
      )}

      {state.status === "done" && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-white font-semibold text-lg">{state.company}</h2>
              <p className="text-[#666] text-xs mt-0.5">{MEETING_LABELS[meetingType]} · Meeting Brief</p>
            </div>
            <button onClick={reset} className="text-xs text-[#555] hover:text-[#aaa] transition-colors">
              ← New brief
            </button>
          </div>

          <div
            className="rounded-xl p-6 text-sm text-[#ccc] leading-relaxed whitespace-pre-wrap font-mono"
            style={{ background: "#111", border: "1px solid #1f1f1f" }}
          >
            {state.brief}
          </div>

          <button
            onClick={() => {
              const blob = new Blob([state.brief], { type: "text/plain" });
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement("a");
              a.href     = url;
              a.download = `${state.company}-Meeting-Brief.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: "#A07828", color: "white" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Brief
          </button>
        </div>
      )}
    </div>
  );
}
