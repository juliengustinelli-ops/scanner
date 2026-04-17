"use client";

import { useEffect, useRef, useState } from "react";
import Nav from "../components/Nav";

// ─── Animated Counter ─────────────────────────────────────────────────────────
function Counter({ end, suffix = "" }: { end: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const steps = 60;
          const increment = end / steps;
          let current = 0;
          const timer = setInterval(() => {
            current += increment;
            if (current >= end) { setCount(end); clearInterval(timer); }
            else setCount(Math.floor(current));
          }, 1500 / steps);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [end]);

  return <span ref={ref}>{count}{suffix}</span>;
}

// ─── Fade In ─────────────────────────────────────────────────────────────────
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
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(20px)",
      transition: "opacity 0.6s ease, transform 0.6s ease",
    }}>
      {children}
    </div>
  );
}

// ─── Section Label ────────────────────────────────────────────────────────────
function Label({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-[11px] font-bold tracking-[3px] uppercase text-[#2196F3] mb-4 ${center ? "justify-center" : ""}`}>
      <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
      {children}
      {center && <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />}
    </div>
  );
}

// ─── ServiceNow Dashboard Mockup ──────────────────────────────────────────────
function DashboardMockup() {
  return (
    <div className="bg-[#0f1117] border border-white/[0.1] rounded-xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.4)]">
      {/* Window chrome */}
      <div className="bg-[#161b24] border-b border-white/[0.07] px-4 py-2.5 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#22c55e]/50" />
        </div>
        <span className="text-white/30 text-[11px] ml-2 font-mono">Incident Management · Live</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
          <span className="text-white/25 text-[10px]">Connected</span>
        </div>
      </div>
      {/* KPI row */}
      <div className="grid grid-cols-3 divide-x divide-white/[0.07] border-b border-white/[0.07] bg-[#0a0d12]">
        {[
          { label: "Open Incidents", val: "247", delta: "↓ 12%" },
          { label: "Resolved Today",  val: "83",  delta: "↑ 40%" },
          { label: "Avg MTTR",        val: "2.1h", delta: "↓ 35%" },
        ].map((m) => (
          <div key={m.label} className="px-4 py-3">
            <div className="text-[20px] font-black text-white leading-none">{m.val}</div>
            <div className="text-[10px] text-white/35 mt-0.5">{m.label}</div>
            <div className="text-[10px] text-[#4ade80] font-semibold mt-0.5">{m.delta}</div>
          </div>
        ))}
      </div>
      {/* Incident rows */}
      {[
        { id: "INC0012847", desc: "Auth service degraded — BFSI Prod",  pri: "P1", status: "In Progress", color: "#ef4444" },
        { id: "INC0012851", desc: "HRSD onboarding workflow error",       pri: "P2", status: "Resolved",    color: "#4ade80" },
        { id: "INC0012839", desc: "CMDB sync failure — 3 CIs affected",  pri: "P2", status: "Assigned",    color: "#f59e0b" },
        { id: "INC0012863", desc: "Employee portal timeout (HRSD)",      pri: "P3", status: "Assigned",    color: "#60a5fa" },
      ].map((inc, i) => (
        <div key={inc.id} className={`px-4 py-2.5 flex items-center gap-3 ${i < 3 ? "border-b border-white/[0.04]" : ""}`}>
          <div className="w-1.5 h-8 rounded-full shrink-0" style={{ background: inc.color + "CC" }} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono text-white/25 leading-none">{inc.id}</div>
            <div className="text-[12px] text-white/60 truncate mt-0.5">{inc.desc}</div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <span className="text-[10px] font-bold text-white/35 w-5 text-right">{inc.pri}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium border" style={{ color: inc.color, borderColor: inc.color + "40", background: inc.color + "18" }}>{inc.status}</span>
          </div>
        </div>
      ))}
      {/* Progress bar */}
      <div className="px-4 py-3 border-t border-white/[0.07] bg-[#0a0d12]">
        <div className="flex justify-between mb-1.5">
          <span className="text-[11px] text-white/40">Self-service resolution rate</span>
          <span className="text-[11px] text-[#2196F3] font-bold">95%</span>
        </div>
        <div className="h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#2196F3] to-[#42a5f5] rounded-full" style={{ width: "95%" }} />
        </div>
      </div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-[#1a1a1a] px-4 py-5 md:px-[60px] md:py-7 flex flex-col md:flex-row items-center gap-3 md:justify-between border-t border-white/[0.05]">
      <div className="flex items-center gap-3">
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
          <path d="M2 36 L22 36 L26 28 L6 28 Z" fill="#2196F3" opacity="0.32" />
          <path d="M7 26 L27 26 L31 18 L11 18 Z" fill="#2196F3" opacity="0.62" />
          <path d="M12 16 L32 16 L36 8 L16 8 Z" fill="#2196F3" />
        </svg>
        <div className="leading-tight">
          <div className="text-[14px] font-black text-white/40 tracking-[0.3px] leading-[1.1]">CLOUD BASE</div>
          <div className="text-[9px] font-semibold text-white/25 tracking-[4px] uppercase mt-[2px]">SOLUTIONS</div>
        </div>
      </div>
      <p className="text-white/20 text-[12px]">© 2026 Cloud Base Solutions. All rights reserved.</p>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ServiceNowPage() {
  return (
    <>
      <Nav />
      <main className="overflow-x-hidden">

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section
          className="min-h-screen grid md:grid-cols-2 relative overflow-hidden"
          style={{ background: "#212121" }}
        >
          <img src="https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80" alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.18]" />
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
          {/* Left */}
          <div className="relative z-10 px-6 pt-32 pb-12 md:px-16 md:pt-44 md:pb-20 flex flex-col justify-center">
            <FadeIn>
              <div className="text-[#2196F3] text-[11px] font-bold tracking-[3px] uppercase mb-6 flex items-center gap-2">
                <span className="w-5 h-0.5 bg-[#2196F3]" />
                ServiceNow Practice
              </div>
              <h1 className="text-[28px] md:text-[52px] font-black leading-[1.1] text-white mb-6 tracking-[-1.5px]">
                The ServiceNow<br />
                Partner Built for<br />
                <em className="not-italic text-[#2196F3]">Enterprise Scale.</em>
              </h1>
              <p className="text-white/60 text-[16px] leading-[1.75] max-w-[440px] mb-10">
                Full-lifecycle ServiceNow — from advisory and ITSM to Agentic AI — backed by 130+ certified professionals and deep GSI partnerships with Genpact and IBM.
              </p>
              <div className="flex gap-3 flex-wrap">
                <a href="https://calendly.com/raghu-cloudbasesolutions/30min" target="_blank" rel="noopener noreferrer" className="bg-[#2196F3] hover:bg-[#42a5f5] text-white text-[14px] font-bold px-8 py-3.5 rounded-md transition-colors no-underline">
                  Book a Discovery Call
                </a>
                <a href="#capabilities" className="border border-white/20 hover:border-[#2196F3] text-white/80 hover:text-[#2196F3] text-[14px] font-semibold px-8 py-3.5 rounded-md transition-colors no-underline">
                  View Capabilities
                </a>
              </div>
            </FadeIn>
          </div>

          {/* Right — Stats */}
          <div className="relative z-10 px-6 pt-10 pb-12 md:px-16 md:pt-44 md:pb-20 flex flex-col justify-center">
            <div className="absolute top-[-80px] right-[-80px] w-[300px] h-[300px] rounded-full bg-[radial-gradient(circle,rgba(33,150,243,0.12)_0%,transparent_70%)]" />
            <FadeIn delay={150} className="relative z-10">
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { num: 130, suffix: "+", label: "Certified ServiceNow\nProfessionals" },
                  { num: 75,  suffix: "+", label: "ServiceNow\nCertifications" },
                  { num: 40,  suffix: "+", label: "AI Customers\nDelivered" },
                  { num: 30,  suffix: "+", label: "Years Combined\nSN Leadership" },
                ].map((s) => (
                  <div key={s.label} className="bg-white/[0.05] border border-white/[0.08] rounded-[10px] px-4 py-4 md:px-7 md:py-7 hover:bg-white/[0.08] transition-colors">
                    <div className="text-[28px] md:text-[44px] font-black text-[#2196F3] leading-none mb-2 tracking-[-1px]">
                      <Counter end={s.num} suffix={s.suffix} />
                    </div>
                    <div className="text-white/60 text-[12px] font-medium leading-[1.5] whitespace-pre-line">{s.label}</div>
                  </div>
                ))}
              </div>
              {/* GSI Partners */}
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-[10px] px-6 py-5 border-l-[3px] border-l-[#2196F3]">
                <div className="text-[10px] font-bold text-[#2196F3] tracking-[2px] uppercase mb-3">GSI Partners</div>
                <div className="flex gap-3">
                  {["Genpact", "IBM", "ServiceNow", "Deloitte"].map((p) => (
                    <div key={p} className="bg-white/[0.08] border border-white/[0.12] rounded px-4 py-1.5 text-[13px] font-bold text-white">{p}</div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ── PROBLEM ──────────────────────────────────────────────────────── */}
        <section className="bg-[#f8f9fa] px-[60px] py-[90px]">
          <FadeIn className="text-center mb-14">
            <Label center>Why Clients Come to Us</Label>
            <h2 className="text-[34px] font-black text-[#212121] tracking-[-0.5px] max-w-[640px] mx-auto leading-[1.2]">
              Six Reasons Enterprises Switch to CBS
            </h2>
            <p className="text-[#555] text-[15px] mt-4 max-w-[520px] mx-auto">
              These are the exact pain points we hear on every first call — and the problems we're built to fix.
            </p>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                ),
                title: "Not happy with existing partners",
                desc: "Missed deadlines, poor communication, and a platform that still doesn't work the way it was promised.",
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                ),
                title: "Poor employee experience",
                desc: "Clunky portals, abandoned self-service, and IT queues that never shrink — despite the investment.",
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
                title: "Not getting ROI from ServiceNow",
                desc: "Millions spent on licensing with low adoption, manual workarounds, and no measurable business outcome.",
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                  </svg>
                ),
                title: "Licensing cost optimization",
                desc: "Overpaying for unused modules or the wrong license tier. App rationalization and SAM that actually works.",
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                  </svg>
                ),
                title: "Process optimization stalled",
                desc: "Technology deployed but the process hasn't changed. The platform isn't driving the ROI it should.",
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
                  </svg>
                ),
                title: "HRSD transformation needed",
                desc: "HR still running on email and spreadsheets. Onboarding, offboarding, and lifecycle events not automated.",
              },
            ].map((p, i) => (
              <FadeIn key={p.title} delay={i * 80}>
                <div className="bg-white rounded-xl border border-[#dde8f8] px-7 py-7 h-full border-t-[3px] border-t-[#2196F3]">
                  <div className="w-11 h-11 rounded-lg bg-[#E3F2FD] text-[#2196F3] flex items-center justify-center mb-4">
                    {p.icon}
                  </div>
                  <h3 className="text-[14px] font-bold text-[#212121] mb-2">{p.title}</h3>
                  <p className="text-[13px] text-[#555] leading-[1.7]">{p.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ── LIFECYCLE ────────────────────────────────────────────────────── */}
        <section
          id="capabilities"
          className="overflow-hidden"
          style={{ background: "#212121", backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
        >
          <div className="flex flex-col md:flex-row" style={{ minHeight: "560px" }}>
            <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
              <img src="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=900&q=80" alt="Enterprise team collaborating" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-[#212121]/40" />
            </div>
            <FadeIn className="md:w-1/2 flex flex-col justify-center px-14 py-16">
              <Label>How We Engage</Label>
              <h2 className="text-[34px] font-black text-white tracking-[-0.5px] leading-[1.2] mb-5">
                One Partner.<br />Full Customer Lifecycle.
              </h2>
              <p className="text-white/60 text-[15px] leading-[1.8] mb-8">
                From the first conversation to long-term platform ownership — we're with you at every stage. No handoffs, no gaps, no surprises.
              </p>
              <div className="flex flex-col gap-5">
                {[
                  { phase: "Sell", desc: "POC development, industry expertise, and GSI relationships to help you win deals and build confidence early." },
                  { phase: "Implement", desc: "Accelerators, rapid resource deployment, and autonomous tooling built to go live fast — without cutting corners." },
                  { phase: "Accelerate", desc: "AI readiness assessments, best practices, and Agentic AI integration to continuously drive platform value." },
                  { phase: "Drive ARR", desc: "Upgrades, Hypercare, COE setup, and multi-year roadmaps to sustain outcomes and grow ROI over time." },
                ].map((p) => (
                  <div key={p.phase} className="flex gap-4 items-start">
                    <div className="bg-[#2196F3] text-white text-[11px] font-black px-2.5 py-1 rounded tracking-[0.5px] flex-shrink-0 mt-0.5 min-w-[80px] text-center">{p.phase}</div>
                    <p className="text-white/55 text-[14px] leading-[1.65]">{p.desc}</p>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ── MODULES ──────────────────────────────────────────────────────── */}
        <section className="bg-white px-[60px] py-[90px]">
          <FadeIn className="mb-14">
            <div className="grid md:grid-cols-2 gap-16 items-start">
              <div>
                <Label>Platform Coverage</Label>
                <h2 className="text-[34px] font-black text-[#212121] tracking-[-0.5px] leading-[1.2] mb-5">
                  Every Module.<br />Every Vertical.<br />One Practice.
                </h2>
                <p className="text-[#555] text-[15px] leading-[1.8]">
                  CBS covers the full ServiceNow platform — from foundational ITSM to cutting-edge Agentic AI. Our 130+ professionals bring certified depth across all modules and six key industry verticals.
                </p>
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#aaa] tracking-[2.5px] uppercase mb-4">Verticals Served</div>
                <div className="flex flex-wrap gap-2.5">
                  {["BFSI", "Hi-Tech", "CPG", "Pharma", "Hospitality", "Healthcare"].map((v) => (
                    <span key={v} className="bg-[#E3F2FD] text-[#2196F3] text-[13px] font-semibold px-4 py-2 rounded-full border border-[#d0e8fb]">{v}</span>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                module: "ITSM",
                full: "IT Service Management",
                desc: "Incident, problem, change, and request management. The foundation of every enterprise ServiceNow deployment.",
                tags: ["Incident Mgmt", "Change Mgmt", "CMDB", "Service Portal"],
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                  </svg>
                ),
              },
              {
                module: "HRSD",
                full: "HR Service Delivery",
                desc: "Hire-to-retire workflows, case management, and employee self-service — deployed as a preferred SI empanelled with ServiceNow.",
                tags: ["Case & Knowledge", "Employee Center", "Onboarding", "Lifecycle Events"],
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                ),
              },
              {
                module: "Agentic AI",
                full: "Now Assist & AI Platform",
                desc: "Autonomous AI agents inside ServiceNow. 90%+ KB generation accuracy. 35%+ reduction in MTTR across deployments.",
                tags: ["Now Assist", "Predictive AI", "GenAI Integration", "AI Ops"],
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                  </svg>
                ),
              },
              {
                module: "CSM",
                full: "Customer Service Management",
                desc: "Connect front-office customer service with back-office operations for end-to-end resolution.",
                tags: ["Case Management", "Omnichannel", "Self-Service", "Field Service"],
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                  </svg>
                ),
              },
              {
                module: "ITOM",
                full: "IT Operations Management",
                desc: "Full visibility into your IT infrastructure — discovery, event management, and service mapping.",
                tags: ["Discovery", "Event Mgmt", "Service Mapping", "AIOps"],
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
                  </svg>
                ),
              },
              {
                module: "Advisory",
                full: "Platform Advisory & Full Delivery",
                desc: "Full platform delivery across all modules — CSM, ITOM, ITAM, SPO, SPM, Virtual Agent, and Agentic AI for ITSM, CSM, SPO and more. Architecture reviews, maturity assessments, and multi-year roadmaps aligned to your business goals.",
                tags: ["CSM", "ITOM", "ITAM", "SPO", "SPM", "Virtual Agent", "Agentic AI", "Roadmapping", "COE Setup"],
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                  </svg>
                ),
              },
            ].map((m, i) => (
              <FadeIn key={m.module} delay={i * 70}>
                <div className="border border-[#dde8f8] rounded-xl p-7 h-full hover:border-[#2196F3] hover:shadow-[0_4px_20px_rgba(33,150,243,0.08)] transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[#E3F2FD] text-[#2196F3] flex items-center justify-center shrink-0">
                        {m.icon}
                      </div>
                      <div>
                        <span className="text-[#2196F3] text-[18px] font-black leading-none">{m.module}</span>
                        <div className="text-[11px] text-[#888] font-medium mt-0.5">{m.full}</div>
                      </div>
                    </div>
                  </div>
                  <p className="text-[13px] text-[#555] leading-[1.7] mb-4">{m.desc}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.tags.map((t) => (
                      <span key={t} className="bg-[#f4f8ff] text-[#2196F3] text-[11px] font-semibold px-2.5 py-1 rounded border border-[#dde8f8]">{t}</span>
                    ))}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ── USE CASES ────────────────────────────────────────────────────── */}
        <section
          style={{ background: "#181f2a", backgroundImage: "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
          className="px-[60px] py-[90px]"
        >
          <FadeIn className="text-center mb-14">
            <div className="text-[#2196F3] text-[11px] font-bold tracking-[3px] uppercase mb-4 flex items-center justify-center gap-2">
              <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
              Real Deployments
              <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
            </div>
            <h2 className="text-[34px] font-black text-white tracking-[-0.5px]">Use Cases We've Delivered</h2>
            <p className="text-white/55 text-[15px] mt-3 max-w-[520px] mx-auto">
              Not hypothetical scenarios — actual work done across banking, transport, hi-tech, and BPO clients.
            </p>
          </FadeIn>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                category: "ITSM & ITOM",
                color: "#2196F3",
                items: [
                  "Data governance, ACLs, security & domain separation for legal entities",
                  "OOB CMDB setup, duplicate CI cleanup, and service impact management",
                  "SCCM integration optimization and Mid Server validations for Discovery",
                  "Operations single pane of glass — improved process adherence to 90%",
                  "ITBM solutions to optimize project portfolio, resources, and financials",
                ],
              },
              {
                category: "HRSD",
                color: "#7c3aed",
                items: [
                  "Employee onboarding — personal info, BGV initiation & relevant workflows",
                  "Employee offboarding — exit process including assets and access revocation",
                  "Interactive dashboards and reports for HR/IT operations",
                  "ServicePortal deployment integrated with Workday for unified experience",
                  "ServiceNow CoE setup for GCCs with process simplification and automation",
                ],
              },
              {
                category: "CSM & Field Service",
                color: "#059669",
                items: [
                  "OOB ITSM & CSM — Incident, Case, Change, SLA, Knowledge Mgmt, Domain separation",
                  "Agent workspace, predictive intelligence, and skill-based routing",
                  "Field Service Management integrated with CMDB for visit scheduling and agent tracking",
                  "Mobile app integration with FSM module including barcode scanning",
                  "Custom app development — insurance checks, loan apps, Kudos app",
                ],
              },
              {
                category: "AI & GenAI",
                color: "#ea580c",
                items: [
                  "Virtual Agent & NowAssist with AI Search, KB, and GenAI results integration",
                  "AI foundation — content & findability improvement with KCS methodology",
                  "AI/GenAI agents for ITSM, HRSD, and CSM (use case identification + OOB enablement)",
                  "Automatic next-best actions, case summarization, and content generation",
                  "End-to-end GRC implementation with billing systems and customer data warehouse",
                ],
              },
            ].map((group, gi) => (
              <FadeIn key={group.category} delay={gi * 90}>
                <div className="h-full flex flex-col">
                  <div
                    className="text-[11px] font-black tracking-[2px] uppercase px-4 py-2.5 rounded-t-lg mb-0"
                    style={{ background: group.color + "22", color: group.color, borderLeft: `3px solid ${group.color}` }}
                  >
                    {group.category}
                  </div>
                  <div className="flex-1 bg-white/[0.04] border border-white/[0.08] border-t-0 rounded-b-lg px-5 py-5 flex flex-col gap-3">
                    {group.items.map((item, ii) => (
                      <div key={ii} className="flex gap-2.5 items-start">
                        <span className="mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: group.color + "99" }} />
                        <span className="text-[12.5px] text-white/60 leading-[1.6]">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ── OUTCOMES ─────────────────────────────────────────────────────── */}
        <section className="bg-[#2196F3] px-[60px] py-[90px]">
          <FadeIn className="text-center mb-14">
            <div className="text-white/60 text-[11px] font-bold tracking-[3px] uppercase mb-4 flex items-center justify-center gap-2">
              <span className="w-6 h-0.5 bg-white/40 inline-block" />
              Proven Outcomes
              <span className="w-6 h-0.5 bg-white/40 inline-block" />
            </div>
            <h2 className="text-[34px] font-black text-white tracking-[-0.5px]">Results That Enterprise Buyers Care About</h2>
            <p className="text-white/70 text-[15px] mt-3 max-w-[500px] mx-auto">
              Specific numbers from live deployments — not projections.
            </p>
          </FadeIn>

          {/* 2-col: dashboard left, stats right */}
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <FadeIn delay={100}>
              <DashboardMockup />
            </FadeIn>
            <FadeIn delay={200} className="flex flex-col gap-4">
              {/* Featured case study */}
              <div className="relative bg-white/[0.12] border border-white/[0.2] rounded-2xl px-8 py-8 text-center overflow-hidden">
                <svg className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none" viewBox="0 0 400 160" preserveAspectRatio="none">
                  <polyline points="0,150 80,120 160,90 240,55 320,30 400,10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="0,150 80,120 160,90 240,55 320,30 400,10 400,160 0,160" fill="white" fillOpacity="0.25" />
                </svg>
                <div className="relative z-10">
                  <div className="text-white/50 text-[11px] font-bold tracking-[2px] uppercase mb-3">Client Outcome · HRSD</div>
                  <div className="text-white/80 text-[15px] font-semibold mb-1">Employee onboarding time</div>
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <span className="text-[40px] font-black text-white/50 leading-none tracking-[-1px]">3 wks</span>
                    <span className="text-white/40 text-[22px] font-black">→</span>
                    <span className="text-[52px] font-black text-white leading-none tracking-[-2px]">2 days</span>
                  </div>
                  <div className="text-white/55 text-[13px]">Banking client — HRSD portal deployment with Workday integration</div>
                </div>
              </div>
              {/* Metrics 2-col grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { metric: "45%→87%", label: "CMDB health accuracy improvement" },
                  { metric: "38%→77%", label: "SLA compliance uplift" },
                  { metric: "70%",     label: "Reduction in incident volume via NowAssist" },
                  { metric: "28%",     label: "Cost saving from SAM implementation" },
                  { metric: "93%",     label: "Employee eSAT after portal deployment" },
                  { metric: "84%",     label: "CSM & HR self-service adoption" },
                  { metric: "68%",     label: "Accurate assignment via skill-based routing" },
                  { metric: "+37%",    label: "Knowledge base search accuracy improvement" },
                ].map((o, i) => (
                  <div key={o.label} className="bg-white/[0.1] border border-white/[0.15] rounded-xl px-5 py-4">
                    <div className="text-[22px] font-black text-white leading-none mb-1">{o.metric}</div>
                    <div className="text-white/65 text-[12px] leading-[1.4]">{o.label}</div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ── TEAM ─────────────────────────────────────────────────────────── */}
        <section className="bg-[#f8f9fa] px-[60px] py-[90px]">
          <FadeIn className="mb-12">
            <Label>Practice Leadership</Label>
            <h2 className="text-[34px] font-black text-[#212121] tracking-[-0.5px]">Led by Former ServiceNow Insiders</h2>
            <p className="text-[#555] text-[15px] mt-3 max-w-[560px] leading-[1.75]">
              Our ServiceNow practice is built by people who were at ServiceNow — not just certified on it. That's a different level of depth.
            </p>
          </FadeIn>
          <div className="grid md:grid-cols-2 gap-6 mb-10">
            {[
              {
                photo: "/team/raj-palorkar.jpg",
                name: "Raj Palorkar",
                role: "ServiceNow Practice Lead",
                company: "Ex-ServiceNow VP Apps Dev",
                bio: "Served as VP of Application Development and IT Site Leader at ServiceNow India. 10+ years inside the ServiceNow ecosystem — knows the platform from the inside out.",
                highlight: "Former ServiceNow VP Apps Dev",
                linkedin: "https://www.linkedin.com/in/rajendra-palorkar/",
              },
              {
                photo: "/team/patrick-stonelake.jpg",
                name: "Patrick Stonelake",
                role: "GTM & Solutions",
                company: "Founder, Fruition Partners",
                bio: "Founded Fruition Partners — the first large-scale ServiceNow integrator. 20+ years building and scaling ServiceNow practices from the ground up.",
                highlight: "Founded the first large ServiceNow SI",
                linkedin: "https://www.linkedin.com/in/stonelake/",
              },
            ].map((m) => (
              <FadeIn key={m.name}>
                <a
                  href={m.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block bg-white rounded-xl border border-[#dde8f8] p-8 hover:border-[#2196F3] hover:shadow-[0_4px_20px_rgba(33,150,243,0.1)] transition-all no-underline group"
                >
                  <div className="flex items-start gap-5 mb-5">
                    <img
                      src={m.photo}
                      alt={m.name}
                      className="w-16 h-16 rounded-xl object-cover shrink-0 border-2 border-[#dde8f8] group-hover:border-[#2196F3] transition-colors"
                    />
                    <div>
                      <h4 className="text-[16px] font-extrabold text-[#212121] mb-0.5 flex items-center gap-2">
                        {m.name}
                        <svg className="w-3.5 h-3.5 text-[#2196F3] opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                        </svg>
                      </h4>
                      <div className="text-[#2196F3] text-[11px] font-bold tracking-[1px] uppercase mb-1">{m.role}</div>
                      <div className="text-[12px] text-[#888]">{m.company}</div>
                    </div>
                  </div>
                  <p className="text-[13px] text-[#555] leading-[1.7] mb-4">{m.bio}</p>
                  <div className="bg-[#E3F2FD] border border-[#d0e8fb] border-l-[3px] border-l-[#2196F3] rounded px-4 py-2.5 text-[12px] font-semibold text-[#2196F3]">
                    {m.highlight}
                  </div>
                </a>
              </FadeIn>
            ))}
          </div>
          {/* Supporting team cards */}
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { name: "Shajan T. Koshy",  role: "CEO",            note: "Former Senior Partner, IBM Consulting. 25+ years enterprise IT.",          photo: "/team/shajan-koshy.jpg",   linkedin: "https://www.linkedin.com/in/shajan-koshy-9a43272/" },
              { name: "Raghu Kottamasu",  role: "COO",            note: "Ex-ADP, Goldman Sachs, Broadridge. Operational delivery backbone.",       photo: "/team/raghu-kottamasu.jpg", linkedin: "https://www.linkedin.com/in/raghukottamasu/" },
              { name: "Walter Yosafat",   role: "Advisory Chair", note: "Former Global CIO at Capri Holdings, Wyndham, Genpact.",                  photo: "/team/walter-yosafat.jpg",  linkedin: "https://www.linkedin.com/in/walteryosafat/" },
            ].map((m, i) => (
              <FadeIn key={m.name} delay={i * 70}>
                <a href={m.linkedin} target="_blank" rel="noopener noreferrer" className="block bg-white rounded-xl border border-[#dde8f8] px-6 py-6 hover:border-[#2196F3] hover:shadow-[0_4px_20px_rgba(33,150,243,0.08)] transition-all no-underline group">
                  <img src={m.photo} alt={m.name} className="w-10 h-10 rounded-lg object-cover mb-3 border border-[#dde8f8] group-hover:border-[#2196F3] transition-colors" />
                  <h4 className="text-[14px] font-extrabold text-[#212121] mb-0.5">{m.name}</h4>
                  <div className="text-[#2196F3] text-[10px] font-bold tracking-[1px] uppercase mb-2">{m.role}</div>
                  <p className="text-[12px] text-[#555] leading-[1.6]">{m.note}</p>
                </a>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ── PARTNERS ─────────────────────────────────────────────────────── */}
        <section className="overflow-hidden bg-[#f8f9fa]">
          <div className="flex flex-col md:flex-row-reverse" style={{ minHeight: "500px" }}>
            <div className="relative md:w-1/2 h-[300px] md:h-auto flex-shrink-0">
              <img src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=900&q=80" alt="Partner collaboration" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-[#f8f9fa]/15" />
            </div>
            <FadeIn className="md:w-1/2 flex flex-col justify-center px-14 py-16">
              <Label>Ecosystem</Label>
              <h2 className="text-[34px] font-black text-[#212121] tracking-[-0.5px] leading-[1.2] mb-5">
                GSI Partnerships<br />That Open Doors
              </h2>
              <p className="text-[#555] text-[15px] leading-[1.8] mb-8">
                Our partnerships with Genpact and IBM give clients access to enterprise delivery capacity and relationships that independent consultants simply cannot replicate.
              </p>
              <div className="flex flex-col gap-3">
                {[
                  { name: "Genpact", desc: "Global process transformation — deep enterprise delivery across regulated industries.", color: "#FF0066" },
                  { name: "IBM", desc: "Strategic technology partner — integrated delivery for complex multi-platform environments.", color: "#1F70C1" },
                  { name: "ServiceNow", desc: "Direct partner ecosystem — faster escalations, beta access, and certified delivery.", color: "#00BF6F" },
                  { name: "Deloitte", desc: "Alliance partnership — enterprise advisory reach and global programme delivery at scale.", color: "#86BC25" },
                ].map((p) => (
                  <div key={p.name} className="flex items-start gap-4 bg-white border border-[#dde8f8] rounded-lg px-5 py-4">
                    <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: p.color }} />
                    <div>
                      <span className="text-[14px] font-bold text-[#212121]">{p.name}</span>
                      <span className="text-[14px] text-[#777]"> — {p.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ── Image Split ── */}
        <div className="flex flex-col md:flex-row" style={{ minHeight: "520px" }}>
          <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
            <img src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=900&q=80" alt="ServiceNow enterprise team" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-[#212121]/35" />
          </div>
          <div className="md:w-1/2 bg-[#1a2030] flex items-center px-16 py-20">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold tracking-[3px] uppercase text-[#2196F3] mb-5">
                <span className="w-5 h-0.5 bg-[#2196F3]" />ServiceNow Practice · GSI Partnerships
              </div>
              <h2 className="text-[34px] font-black text-white tracking-[-0.5px] mb-5 leading-[1.2]">Enterprise-Grade Delivery. Backed by Genpact & IBM.</h2>
              <p className="text-white/60 text-[15px] leading-[1.85] mb-8">Our GSI partnerships give you access to global delivery capacity, pre-built accelerators, and platform-certified talent — without the overhead of a Big 4 engagement. 130+ professionals. Full lifecycle coverage.</p>
              <div className="flex flex-col gap-3">
                {[
                  "130+ certified ServiceNow professionals",
                  "Full lifecycle: advisory → ITSM → Agentic AI",
                  "GSI partnerships: Genpact + IBM",
                  "40+ projects delivered",
                ].map(b => (
                  <div key={b} className="flex items-center gap-3">
                    <span className="text-[#2196F3] font-black text-[14px] flex-shrink-0">✓</span>
                    <span className="text-white/75 text-[14px]">{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section className="bg-[#2196F3] px-[60px] py-[100px] text-center">
          <FadeIn>
            <h2 className="text-[44px] font-black text-white mb-4 tracking-[-1px]">Ready to Move Your ServiceNow Forward?</h2>
            <p className="text-white/75 text-[17px] max-w-[480px] mx-auto mb-10 leading-[1.7]">
              Book a 30-minute discovery call. We'll map your current state, identify the fastest path to value, and tell you exactly what working with CBS looks like.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <a
                href="https://calendly.com/raghu-cloudbasesolutions/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-[#2196F3] text-[15px] font-extrabold px-10 py-4 rounded-md inline-block hover:opacity-90 transition-opacity no-underline"
              >
                Book a Discovery Call
              </a>
              <a
                href="/"
                className="border border-white/30 text-white text-[15px] font-semibold px-8 py-4 rounded-md inline-block hover:border-white/60 transition-colors no-underline"
              >
                Back to Home
              </a>
            </div>
          </FadeIn>
        </section>

      </main>
      <Footer />
    </>
  );
}
