"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setKey(localStorage.getItem("openai_api_key") || "");
  }, []);

  const save = () => {
    localStorage.setItem("openai_api_key", key.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const masked = key.length > 8 ? key.slice(0, 4) + "••••••••" + key.slice(-4) : key;

  return (
    <div className="min-h-screen px-10 py-12 max-w-xl">
      <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
      <p className="text-[#666] text-sm mb-10">Configure your API credentials.</p>

      <div className="rounded-xl p-6" style={{ background: "#161616", border: "1px solid #222" }}>
        <label className="block text-sm font-medium text-white mb-1">OpenAI API Key</label>
        <p className="text-xs text-[#555] mb-3">
          Used for PDF extraction and deck generation. Stored locally in your browser — never sent to our servers.
        </p>
        <input
          type="password"
          value={key}
          onChange={(e) => { setKey(e.target.value); setSaved(false); }}
          placeholder="sk-..."
          className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-sm text-white font-mono placeholder-[#444] outline-none focus:border-[#A07828] transition-colors"
        />
        {key && (
          <p className="text-xs text-[#444] mt-1.5 font-mono">{masked}</p>
        )}

        <button
          onClick={save}
          className="mt-4 px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{ background: saved ? "#1a3a1a" : "#A07828", color: saved ? "#4ade80" : "white" }}
        >
          {saved ? "Saved ✓" : "Save Key"}
        </button>
      </div>

      <div className="mt-6 rounded-xl p-4 text-xs text-[#555] leading-relaxed" style={{ background: "#111", border: "1px solid #1a1a1a" }}>
        Your key is stored in <span className="text-[#888] font-mono">localStorage</span> on this device only.
        Get your key at <span className="text-[#A07828]">platform.openai.com/api-keys</span>.
      </div>
    </div>
  );
}
