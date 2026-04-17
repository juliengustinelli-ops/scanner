"use client";

import { useState } from "react";
import Link from "next/link";
import Nav from "../../components/Nav";

export default function SubmitRequirementPage() {
  const [selected, setSelected] = useState<"us" | "india" | null>(null);

  const options = [
    {
      id: "us" as const,
      flag: "🇺🇸",
      label: "United States",
      desc: "Roles based in the US or requiring US-based talent sourcing.",
      email: "CBS_USrecruiting@cloudbasesolutions.digital",
      color: "#2196F3",
    },
    {
      id: "india" as const,
      flag: "🇮🇳",
      label: "India",
      desc: "Roles based in India or requiring India-based talent sourcing.",
      email: "recruitment@cloudbasesolutions.digital",
      color: "#4CAF50",
    },
  ];

  const chosen = options.find((o) => o.id === selected);

  return (
    <div className="min-h-screen bg-[#212121]">
      <Nav />

      <div className="pt-[140px] pb-[100px] px-6 flex flex-col items-center">
        {/* Heading */}
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[3px] uppercase text-[#2196F3] mb-5 justify-center">
          <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
          Submit a Requirement
          <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
        </div>
        <h1 className="text-[42px] font-black text-white tracking-[-1px] mb-3 text-center leading-[1.1]">
          Where is the role located?
        </h1>
        <p className="text-white/45 text-[16px] mb-12 text-center max-w-[440px] leading-[1.7]">
          Select the delivery region so we can connect you with the right recruiting team.
        </p>

        {/* Cards */}
        <div className="grid md:grid-cols-2 gap-5 w-full max-w-[620px] mb-10">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              className={`text-left rounded-xl border-2 p-8 transition-all cursor-pointer ${
                selected === opt.id
                  ? "border-[#2196F3] bg-white/[0.07]"
                  : "border-white/[0.1] bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]"
              }`}
            >
              <div className="text-[42px] mb-4">{opt.flag}</div>
              <div className="text-[18px] font-black text-white mb-2">{opt.label}</div>
              <div className="text-[13px] text-white/45 leading-[1.65]">{opt.desc}</div>
              {selected === opt.id && (
                <div className="mt-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#2196F3]" />
                  <span className="text-[12px] text-[#2196F3] font-bold">Selected</span>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* CTA */}
        {chosen ? (
          <div className="flex flex-col items-center gap-4">
            <a
              href={`mailto:${chosen.email}?subject=Staffing Requirement — ${chosen.label}`}
              className="bg-[#2196F3] hover:bg-[#42a5f5] text-white text-[15px] font-extrabold px-10 py-4 rounded-md transition-colors no-underline"
            >
              Email {chosen.label} Recruiting Team
            </a>
            <div className="text-white/30 text-[13px]">{chosen.email}</div>
          </div>
        ) : (
          <div className="text-white/20 text-[13px] mt-2">Select a region above to continue</div>
        )}

        <Link href="/staffing" className="mt-10 text-white/30 hover:text-white/60 text-[13px] transition-colors no-underline">
          ← Back to Staffing
        </Link>
      </div>
    </div>
  );
}
