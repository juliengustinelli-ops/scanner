"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Nav from "../components/Nav";

function FadeIn({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setTimeout(() => setVisible(true), delay); observer.disconnect(); }
    }, { threshold: 0.08 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);
  return (
    <div ref={ref} className={className} style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)", transition: "opacity 0.6s ease, transform 0.6s ease" }}>
      {children}
    </div>
  );
}

function Label({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-[11px] font-bold tracking-[3px] uppercase text-[#2196F3] mb-4 ${center ? "justify-center" : ""}`}>
      <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
      {children}
      {center && <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />}
    </div>
  );
}

// ─── Talent Pipeline Mockup ───────────────────────────────────────────────────
function TalentMockup() {
  const roles = [
    { title: "Sr. ServiceNow Architect", loc: "New Jersey, US", type: "Contract", days: "2d" },
    { title: "AI/ML Engineer", loc: "Remote · US", type: "FTE", days: "1d" },
    { title: "Cloud Solutions Architect", loc: "Hyderabad, IN", type: "Contract", days: "3d" },
    { title: "Cybersecurity Analyst", loc: "Mexico City, MX", type: "Contract", days: "5d" },
    { title: "GenAI Platform Engineer", loc: "Remote · US", type: "FTE", days: "1d" },
  ];
  return (
    <div className="bg-[#0f1117] border border-white/[0.1] rounded-xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.4)]">
      <div className="bg-[#161b24] border-b border-white/[0.07] px-4 py-2.5 flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[11px] text-white/30 font-mono">talent-pipeline · active roles</span>
        <span className="ml-auto text-[10px] text-[#4CAF50] font-bold">● LIVE</span>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: "Open Roles", val: "47", color: "#2196F3" },
            { label: "Avg Fill Time", val: "18d", color: "#4CAF50" },
            { label: "Recruiters", val: "20+", color: "#9C27B0" },
          ].map((k) => (
            <div key={k.label} className="bg-white/[0.04] rounded-lg p-3 border border-white/[0.05] text-center">
              <div className="text-[22px] font-black" style={{ color: k.color }}>{k.val}</div>
              <div className="text-[10px] text-white/30 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-white/30 font-mono mb-3 tracking-wider">RECENT OPENINGS</div>
        <div className="flex flex-col gap-2">
          {roles.map((r) => (
            <div key={r.title} className="flex items-center justify-between bg-white/[0.04] rounded px-3 py-2.5 border border-white/[0.05]">
              <div>
                <div className="text-[12px] text-white/70 font-medium">{r.title}</div>
                <div className="text-[10px] text-white/25 mt-0.5">{r.loc}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${r.type === "FTE" ? "bg-[rgba(76,175,80,0.15)] text-[#4CAF50]" : "bg-[rgba(33,150,243,0.15)] text-[#2196F3]"}`}>{r.type}</span>
                <span className="text-[10px] text-white/20">{r.days}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function StaffingPage() {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <Nav />

      {/* ── Hero ── */}
      <section className="min-h-screen pt-0 pb-0 relative overflow-hidden flex flex-col" style={{ background: "#212121" }}>
        <img src="https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=1600&q=80" alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.22]" />
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative z-10 flex-1 px-6 pt-32 pb-10 md:px-16 md:pt-44 md:pb-16 grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          <FadeIn>
            <Label>Technology Staffing · US · India · Mexico</Label>
            <h1 className="text-[28px] md:text-[52px] font-black text-white leading-[1.08] tracking-[-1.5px] mb-6">
              The Right Tech Talent.<br />
              <span className="text-[#2196F3]">Faster Than<br />You Think.</span>
            </h1>
            <p className="text-white/55 text-[16px] leading-[1.8] mb-10 max-w-[440px]">
              20+ specialized recruiters across the US, India, and Mexico. We place Cloud, AI/GenAI, Cybersecurity, and ServiceNow professionals — contractors to direct hires.
            </p>
            <div className="flex gap-3 flex-wrap">
              <a href="#capabilities" className="bg-[#2196F3] hover:bg-[#42a5f5] text-white text-[14px] font-bold px-8 py-3.5 rounded-md transition-colors no-underline">
                Our Capabilities
              </a>
              <Link href="/staffing/submit-requirement" className="border border-white/[0.15] hover:border-white/30 text-white text-[14px] font-bold px-8 py-3.5 rounded-md transition-colors no-underline">
                Submit a Requirement
              </Link>
            </div>
          </FadeIn>
          <FadeIn delay={150}>
            <TalentMockup />
          </FadeIn>
        </div>

        {/* Stat bar */}
        <div className="relative z-10 border-t border-white/[0.06] grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-white/[0.06]">
          {[
            { val: "20+", label: "Specialized Recruiters" },
            { val: "3", label: "Delivery Locations" },
            { val: "18d", label: "Average Fill Time" },
            { val: "500+", label: "Placements to Date" },
          ].map((s) => (
            <div key={s.label} className="px-4 py-5 md:px-10 md:py-7 text-center">
              <div className="text-[22px] md:text-[32px] font-black text-white tracking-[-1px]">{s.val}</div>
              <div className="text-[10px] md:text-[11px] text-white/35 mt-1 tracking-[0.5px]">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="bg-[#f8f9fa] px-[60px] py-[100px]">
        <FadeIn className="max-w-[680px] mx-auto text-center mb-16">
          <Label center>The Talent Gap</Label>
          <h2 className="text-[36px] font-black text-[#212121] tracking-[-0.5px] mb-5">
            Specialized Tech Talent is Scarce
          </h2>
          <p className="text-[#555] text-[16px] leading-[1.8]">
            Finding certified ServiceNow architects, AI engineers, and cloud specialists takes months. Generic staffing agencies don't understand the tech. We do.
          </p>
        </FadeIn>
        <div className="grid md:grid-cols-4 gap-5">
          {[
            {
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              ),
              title: "Long Fill Times",
              desc: "The average specialized tech role takes 3–4 months to fill. Every day unfilled is a delay to your roadmap.",
            },
            {
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
              ),
              title: "Mismatched Skills",
              desc: "Generalist recruiters can't assess if a candidate has real ServiceNow or AI/GenAI depth — we screen for it.",
            },
            {
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              ),
              title: "High Attrition",
              desc: "Without cultural and technical fit, contractors churn. Our match quality reduces early attrition significantly.",
            },
            {
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
              ),
              title: "Global Complexity",
              desc: "Cross-border staffing requires legal, payroll, and compliance expertise across multiple jurisdictions.",
            },
          ].map((p, i) => (
            <FadeIn key={p.title} delay={i * 80}>
              <div className="bg-white rounded-[10px] border border-[#dde8f8] p-7 h-full">
                <div className="w-10 h-10 rounded-lg bg-[#E3F2FD] text-[#2196F3] flex items-center justify-center mb-4">
                  {p.icon}
                </div>
                <h4 className="text-[14px] font-bold text-[#212121] mb-2">{p.title}</h4>
                <p className="text-[13px] text-[#555] leading-[1.65]">{p.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── What We Place ── */}
      <section id="capabilities" className="overflow-hidden bg-white">
        <div className="flex flex-col md:flex-row" style={{ minHeight: "560px" }}>
          <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
            <img src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=900&q=80" alt="Technology professionals team" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-white/10" />
          </div>
          <FadeIn className="md:w-1/2 flex flex-col justify-center px-14 py-16">
            <Label>What We Place</Label>
            <h2 className="text-[34px] font-black text-[#212121] tracking-[-0.5px] leading-[1.2] mb-5">
              Deep Specialization.<br />Not a Generalist Shop.
            </h2>
            <p className="text-[#555] text-[15px] leading-[1.8] mb-8">
              Our recruiters are former practitioners. They can actually evaluate a resume — not just keyword-match it. That expertise cuts interview-to-offer time in half.
            </p>
            <div className="flex flex-wrap gap-2.5">
              {[
                { area: "ServiceNow & SFDC", color: "#00BF6F" },
                { area: "AI & GenAI", color: "#9C27B0" },
                { area: "Cloud & Network", color: "#2196F3" },
                { area: "Cybersecurity", color: "#F44336" },
                { area: "Data Platforms", color: "#FF9800" },
                { area: "Domain SaaS", color: "#607D8B" },
              ].map((cat) => (
                <div key={cat.area} className="flex items-center gap-2 bg-[#f8f9fa] border border-[#dde8f8] rounded-lg px-4 py-2.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                  <span className="text-[13px] font-semibold text-[#212121]">{cat.area}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Engagement Models ── */}
      <section className="overflow-hidden" style={{ background: "#212121", backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "28px 28px" }}>
        <div className="flex flex-col md:flex-row-reverse" style={{ minHeight: "520px" }}>
          <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
            <img src="https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80" alt="Diverse tech team" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-[#212121]/35" />
          </div>
          <FadeIn className="md:w-1/2 flex flex-col justify-center px-14 py-16">
            <Label>How We Engage</Label>
            <h2 className="text-[34px] font-black text-white tracking-[-0.5px] leading-[1.2] mb-5">
              Flexible Models.<br />One Delivery Standard.
            </h2>
            <p className="text-white/60 text-[15px] leading-[1.8] mb-8">
              We match the engagement model to the need — from short-term contractors to full permanent placements to our unique Factory Model.
            </p>
            <div className="flex flex-col gap-4 mb-8">
              {[
                { type: "Contract / C2C", desc: "Short or long-term contractors billed hourly — ideal for project-based work.", color: "#2196F3" },
                { type: "Contract-to-Hire", desc: "90–180 day trial with a conversion option. Try before you commit.", color: "#9C27B0" },
                { type: "Direct Hire / FTE", desc: "Permanent placements through retained or contingency search.", color: "#4CAF50" },
                { type: "Factory Model", desc: "We hire, train, certify, and deploy a dedicated bench trained on your stack.", color: "#FF9800" },
              ].map((m) => (
                <div key={m.type} className="flex gap-3 items-start">
                  <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: m.color }} />
                  <div>
                    <span className="text-white text-[14px] font-bold">{m.type}</span>
                    <span className="text-white/50 text-[14px]"> — {m.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-5">
              {[{ flag: "🇺🇸", loc: "United States" }, { flag: "🇮🇳", loc: "India" }, { flag: "🇲🇽", loc: "Mexico" }].map((l) => (
                <div key={l.loc} className="flex items-center gap-2 text-white/60 text-[13px]">
                  <span>{l.flag}</span><span>{l.loc}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Why CBS Staffing ── */}
      <section className="px-[60px] py-[100px]" style={{ background: "#212121", backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "28px 28px" }}>
        <FadeIn className="text-center mb-14">
          <Label center>Why Cloud Base Solutions</Label>
          <h2 className="text-[36px] font-black text-white tracking-[-0.5px]">We Know the Tech. We Know the Talent.</h2>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { title: "Practitioner Recruiters", desc: "Our staffing team comes from ServiceNow, cloud, and AI backgrounds. They can actually evaluate a resume — not just keyword-match it.", icon: "🎯" },
            { title: "Curated Talent Bench", desc: "Pre-vetted specialists across all practice areas. Many placements happen before we post a job. First qualified slate within 72 hours.", icon: "🤝" },
            { title: "Flexible Commercial Structures", desc: "Fixed-fee, T&M, milestone-based, or our Factory Model (Hire, Train, Certify & Deploy). We match the engagement model to the need.", icon: "🔗" },
          ].map((c, i) => (
            <FadeIn key={c.title} delay={i * 100}>
              <div className="bg-white/[0.04] rounded-[10px] border border-white/[0.08] p-8 hover:border-[#2196F3]/40 transition-colors">
                <div className="text-3xl mb-4">{c.icon}</div>
                <h4 className="text-[16px] font-black text-white mb-2">{c.title}</h4>
                <p className="text-[13px] text-white/45 leading-[1.7]">{c.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── Image Split ── */}
      <div className="flex flex-col md:flex-row-reverse" style={{ minHeight: "520px" }}>
        <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
          <img src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=900&q=80" alt="Tech talent team" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-[#212121]/25" />
        </div>
        <div className="md:w-1/2 bg-[#1a2030] flex items-center px-16 py-20">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[3px] uppercase text-[#2196F3] mb-5">
              <span className="w-5 h-0.5 bg-[#2196F3]" />Tech Staffing · 3 Delivery Locations
            </div>
            <h2 className="text-[34px] font-black text-white tracking-[-0.5px] mb-5 leading-[1.2]">Practitioner-Led Recruiting. Not Resume Matching.</h2>
            <p className="text-white/60 text-[15px] leading-[1.85] mb-8">Our recruiters understand the technology. They've worked alongside ServiceNow architects, cloud engineers, and AI specialists — so they know exactly who to look for and how to screen them. First qualified slate in 72 hours.</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { val: "20+", label: "Specialized Recruiters" },
                { val: "18d", label: "Avg. Fill Time" },
                { val: "500+", label: "Placements to Date" },
                { val: "3", label: "Delivery Locations" },
              ].map(s => (
                <div key={s.label} className="bg-white/[0.06] rounded-lg px-4 py-3 border border-white/[0.08]">
                  <div className="text-[24px] font-black text-[#2196F3] tracking-[-0.5px]">{s.val}</div>
                  <div className="text-[11px] text-white/40 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <section className="bg-[#2196F3] px-[60px] py-[100px] text-center">
        <FadeIn>
          <h2 className="text-[46px] font-black text-white mb-4 tracking-[-1px]">Have a Role to Fill?</h2>
          <p className="text-white/78 text-[17px] max-w-[500px] mx-auto mb-10 leading-[1.7]">
            Send us your requirements. We&apos;ll have a qualified slate in front of you within 72 hours — or we&apos;ll tell you exactly why not.
          </p>
          <Link
            href="/staffing/submit-requirement"
            className="bg-white text-[#2196F3] text-[15px] font-extrabold px-10 py-4 rounded-md inline-block hover:opacity-90 transition-opacity no-underline"
          >
            Submit a Requirement
          </Link>
        </FadeIn>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[#1a1a1a] px-4 py-5 md:px-[60px] md:py-7 flex flex-col md:flex-row items-center gap-3 md:justify-between border-t border-white/[0.05]">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
            <path d="M2 36 L22 36 L26 28 L6 28 Z" fill="#2196F3" opacity="0.32" />
            <path d="M7 26 L27 26 L31 18 L11 18 Z" fill="#2196F3" opacity="0.62" />
            <path d="M12 16 L32 16 L36 8 L16 8 Z" fill="#2196F3" />
          </svg>
          <div className="leading-tight">
            <div className="text-[14px] font-black text-white/40 tracking-[0.3px] leading-[1.1]">CLOUD BASE</div>
            <div className="text-[9px] font-semibold text-white/25 tracking-[4px] uppercase mt-[2px]">SOLUTIONS</div>
          </div>
        </Link>
        <span className="text-white/20 text-[12px]">© 2026 Cloud Base Solutions. All rights reserved.</span>
      </footer>
    </div>
  );
}
