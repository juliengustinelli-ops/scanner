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

function HRLifecycleMockup() {
  const stages = [
    { label: "Hire", color: "#2196F3" },
    { label: "Onboard", color: "#42a5f5" },
    { label: "Develop", color: "#7e57c2" },
    { label: "Engage", color: "#26a69a" },
    { label: "Retain", color: "#66bb6a" },
    { label: "Retire", color: "#78909c" },
  ];
  return (
    <div className="bg-[#0f1117] border border-white/[0.1] rounded-xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.4)]">
      <div className="bg-[#161b24] border-b border-white/[0.07] px-4 py-2.5 flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[11px] text-white/30 font-mono">hire-to-retire · platform view</span>
      </div>
      <div className="p-5">
        <div className="text-[10px] text-white/30 font-mono mb-4 tracking-wider">EMPLOYEE LIFECYCLE</div>
        <div className="flex gap-2 mb-5">
          {stages.map((s) => (
            <div key={s.label} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full h-1.5 rounded-full" style={{ background: s.color, opacity: 0.7 }} />
              <span className="text-[9px] text-white/40 font-bold tracking-[0.5px]">{s.label}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2.5 mt-3">
          {[
            { module: "Workday", status: "Connected", color: "#0075C9" },
            { module: "SAP SuccessFactors", status: "170 Countries", color: "#008FD3" },
            { module: "ServiceNow HRSD", status: "Preferred SI", color: "#00BF6F" },
            { module: "DarwinBox", status: "15 Practitioners", color: "#F3414B" },
          ].map((m) => (
            <div key={m.module} className="flex items-center justify-between bg-white/[0.04] rounded px-3 py-2 border border-white/[0.05]">
              <span className="text-[12px] text-white/60 font-mono">{m.module}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ color: m.color, background: `${m.color}22` }}>{m.status}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-3 gap-3">
          {[
            { label: "DB Projects", val: "17+" },
            { label: "Countries Covered", val: "170" },
            { label: "Platforms", val: "4" },
          ].map((k) => (
            <div key={k.label} className="text-center">
              <div className="text-[18px] font-black text-white">{k.val}</div>
              <div className="text-[10px] text-white/30 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HRPage() {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <Nav />

      {/* ── Hero ── */}
      <section className="min-h-screen pt-0 pb-0 relative overflow-hidden flex flex-col" style={{ background: "#212121" }}>
        <img src="https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=80" alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.22]" />
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative z-10 flex-1 px-6 pt-32 pb-10 md:px-16 md:pt-44 md:pb-16 grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          <FadeIn>
            <Label>HR Transformation & Tech Practice</Label>
            <h1 className="text-[28px] md:text-[52px] font-black text-white leading-[1.08] tracking-[-1.5px] mb-6">
              Hire-to-Retire.<br />
              <span className="text-[#2196F3]">Transformed for<br />the Modern Enterprise.</span>
            </h1>
            <p className="text-white/55 text-[16px] leading-[1.8] mb-10 max-w-[440px]">
              40+ years of combined HR transformation leadership. We modernize the full employee lifecycle on Workday, SAP SuccessFactors, ServiceNow HRSD, and DarwinBox.
            </p>
            <div className="flex gap-3 flex-wrap">
              <a href="#approach" className="bg-[#2196F3] hover:bg-[#42a5f5] text-white text-[14px] font-bold px-8 py-3.5 rounded-md transition-colors no-underline">
                Our Approach
              </a>
              <a href="mailto:info@cloudbasesolutions.com" className="border border-white/[0.15] hover:border-white/30 text-white text-[14px] font-bold px-8 py-3.5 rounded-md transition-colors no-underline">
                Book a Strategy Call
              </a>
            </div>
          </FadeIn>
          <FadeIn delay={150}>
            <HRLifecycleMockup />
          </FadeIn>
        </div>

        {/* Stat bar */}
        <div className="relative z-10 border-t border-white/[0.06] grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-white/[0.06]">
          {[
            { val: "40+", label: "Years Combined HR Leadership" },
            { val: "80K+", label: "Employees Managed at Meta" },
            { val: "17+", label: "DarwinBox Projects Delivered" },
            { val: "170", label: "Countries" },
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
          <Label center>The Challenge</Label>
          <h2 className="text-[36px] font-black text-[#212121] tracking-[-0.5px] mb-5">
            HR Transformation is Hard to Get Right
          </h2>
          <p className="text-[#555] text-[16px] leading-[1.8]">
            HRMS implementations fail when the right mix of HR domain expertise, systems knowledge, and change management is missing. Most firms bring one or two — we bring all three.
          </p>
        </FadeIn>
        <div className="grid md:grid-cols-4 gap-5">
          {[
            {
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>,
              title: "Legacy System Debt",
              desc: "Siloed HR tools, manual processes, and disconnected data prevent real-time workforce visibility.",
            },
            {
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
              title: "Change Management",
              desc: "New platforms fail without employee adoption. HR transformations need human-first design and stakeholder alignment.",
            },
            {
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>,
              title: "Global Complexity",
              desc: "Multi-country payroll, compliance, and cultural nuance require seasoned international HR leadership across regions.",
            },
            {
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
              title: "AI-Readiness Gap",
              desc: "Most HRMS deployments don't leverage intelligent automation. We close the gap with agentic HR workflows.",
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

      {/* ── Our Approach ── */}
      <section id="approach" className="overflow-hidden bg-white">
        <div className="flex flex-col md:flex-row-reverse" style={{ minHeight: "560px" }}>
          <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
            <img src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=900&q=80" alt="HR strategy team" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-white/10" />
          </div>
          <FadeIn className="md:w-1/2 flex flex-col justify-center px-14 py-16">
            <Label>What We Do</Label>
            <h2 className="text-[34px] font-black text-[#212121] tracking-[-0.5px] leading-[1.2] mb-5">
              Full Hire-to-Retire.<br />Platform-Agnostic.
            </h2>
            <p className="text-[#555] text-[15px] leading-[1.8] mb-8">
              We embed senior HR practitioners with your team — not just technologists. From platform selection to go-live, we've run this at the world's largest enterprises and bring that real-world experience to every engagement.
            </p>
            <div className="flex flex-col gap-4 mb-10">
              {[
                { step: "Strategy", desc: "HRMS assessment, vendor evaluation, and total cost of ownership analysis." },
                { step: "Implementation", desc: "Core HR, Payroll, Time & Attendance, Leave, and HRSD integration." },
                { step: "Change Management", desc: "Stakeholder alignment, manager enablement, training, and adoption support." },
                { step: "AI & Automation", desc: "Agentic workflows for HR Ops, automated onboarding, and predictive attrition." },
              ].map((p) => (
                <div key={p.step} className="flex gap-4 items-start">
                  <div className="bg-[#2196F3] text-white text-[11px] font-black px-2.5 py-1 rounded tracking-[0.5px] flex-shrink-0 mt-0.5 min-w-[110px] text-center">{p.step}</div>
                  <p className="text-[#555] text-[14px] leading-[1.65]">{p.desc}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { name: "Workday", color: "#0075C9" },
                { name: "SAP SuccessFactors", color: "#008FD3" },
                { name: "ServiceNow HRSD", color: "#00BF6F" },
                { name: "DarwinBox", color: "#F3414B" },
              ].map((pl) => (
                <div key={pl.name} className="flex items-center gap-2 bg-[#f8f9fa] border border-[#dde8f8] rounded-md px-3 py-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: pl.color }} />
                  <span className="text-[12px] font-semibold text-[#212121]">{pl.name}</span>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>


      {/* ── Practice Leadership ── */}
      <section className="overflow-hidden" style={{ background: "#1a2030", backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "28px 28px" }}>
        <div className="flex flex-col md:flex-row" style={{ minHeight: "520px" }}>
          <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
            <img src="https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=80" alt="HR practitioners" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-[#1a2030]/40" />
          </div>
          <FadeIn className="md:w-1/2 flex flex-col justify-center px-14 py-16">
            <Label>Practice Leadership</Label>
            <h2 className="text-[34px] font-black text-white tracking-[-0.5px] leading-[1.2] mb-5">
              Led by Practitioners,<br />Not Consultants
            </h2>
            <p className="text-white/60 text-[15px] leading-[1.8] mb-8">
              Our HR practice leads have managed payroll and workforce operations for tens of thousands of employees across five continents. They don't just know the platforms — they've lived the problems you're trying to solve.
            </p>
            <div className="flex flex-col gap-5">
              {[
                { name: "Safna Putnam", role: "Global Consulting & HRIS Lead", note: "Former Global Head of Hire-to-Retire at Meta for 80,000 employees across 50 countries.", photo: "/team/safna-puttnam.jpg", linkedin: "https://www.linkedin.com/in/safna-puttnam-1431629a/" },
                { name: "Vikas Joshi", role: "Global People Practice Lead", note: "Former Global Head of SuccessFactors at PepsiCo across 170 countries. Ex-VP at Viatris.", photo: "/team/vikas-joshi.jpg", linkedin: "https://www.linkedin.com/in/vikasjoshihr/" },
              ].map((m) => (
                <a key={m.name} href={m.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-start gap-4 no-underline group">
                  <img src={m.photo} alt={m.name} className="w-12 h-12 rounded-xl object-cover border-2 border-white/10 group-hover:border-[#2196F3] transition-colors flex-shrink-0" />
                  <div>
                    <div className="text-[14px] font-bold text-white group-hover:text-[#2196F3] transition-colors">{m.name}</div>
                    <div className="text-[10px] text-[#2196F3] font-bold uppercase tracking-[0.5px] mb-1">{m.role}</div>
                    <div className="text-[13px] text-white/50 leading-[1.55]">{m.note}</div>
                  </div>
                </a>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Darwinbox Deep Dive ── */}
      <section className="bg-[#f8f9fa] px-[60px] py-[100px]">
        <FadeIn className="text-center mb-14">
          <Label center>DarwinBox Practice</Label>
          <h2 className="text-[36px] font-black text-[#212121] tracking-[-0.5px]">The Deepest DarwinBox Bench in the Market</h2>
          <p className="text-[#555] text-[15px] mt-4 max-w-[600px] mx-auto leading-[1.75]">
            Dedicated HRMS professionals — spanning implementation design, cut-over planning, integrations, payroll, talent acquisition, and change management. Every hire is a DarwinBox alumnus.
          </p>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {[
            { stat: "15", label: "DarwinBox Practitioners", desc: "Project Managers, Architects, Developers, Administrators, Testers, Integration experts, and Payroll SMEs." },
            { stat: "17", label: "Projects Within CBS", desc: "Delivered across India, Singapore, Middle East, and US. All hires are DB alumni — minimal learning curve." },
            { stat: "100%", label: "DB Alumni Hires", desc: "We only hire DarwinBox practitioners with direct product experience. 20% bench investment and training ongoing." },
          ].map((s, i) => (
            <FadeIn key={s.label} delay={i * 80}>
              <div className="bg-white rounded-[10px] border border-[#dde8f8] p-8 text-center">
                <div className="text-[48px] font-black text-[#2196F3] tracking-[-2px] mb-2">{s.stat}</div>
                <div className="text-[14px] font-bold text-[#212121] mb-2">{s.label}</div>
                <p className="text-[12px] text-[#555] leading-[1.65]">{s.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Capabilities strip */}
        <FadeIn>
          <div className="bg-white rounded-[10px] border border-[#dde8f8] p-7 mb-10">
            <div className="text-[10px] font-bold text-[#aaa] tracking-[2.5px] uppercase mb-4">Modules Delivered</div>
            <div className="flex flex-wrap gap-2">
              {["Core HR", "Recruitment", "Onboarding", "Time Management", "Travel & Expense", "Reimbursement", "Leave & Attendance", "PMS", "Helpdesk", "Integration & Amplification", "Hypercare", "Payroll"].map((m) => (
                <span key={m} className="text-[12px] text-[#212121] bg-[#E3F2FD] border border-[#d0e8fb] px-3 py-1 rounded-md font-medium">{m}</span>
              ))}
            </div>
          </div>
        </FadeIn>

        {/* Client Story — Featured Card */}
        <FadeIn delay={100}>
          <div className="rounded-[16px] overflow-hidden shadow-xl flex flex-col md:flex-row-reverse mb-10" style={{ minHeight: "480px" }}>
            <div className="relative md:w-[38%] h-[320px] md:h-auto flex-shrink-0">
              <img
                src="/chaitanya-peddi.jpg"
                alt="Chaitanya Peddi, Co-Founder, DarwinBox"
                className="absolute inset-0 w-full h-full object-cover object-top"
              />
              <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.2) 45%, transparent 70%)" }} />
              <div className="absolute bottom-0 left-0 right-0 p-7">
                <p className="text-white text-[15px] italic font-medium leading-[1.6] mb-3">&ldquo;Highly delighted with the rapid Core HR implementation.&rdquo;</p>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-[#2196F3]" />
                  <span className="text-white/60 text-[11px] font-semibold">Chaitanya Peddi</span>
                  <span className="text-white/30 text-[11px]">Co-Founder, DarwinBox</span>
                </div>
              </div>
            </div>
            <div className="flex-1 bg-[#111827] p-10 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-5">
                <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-white/30 bg-white/[0.06] border border-white/[0.08] px-3 py-1 rounded-full">DarwinBox · Core HR</span>
                <span className="text-[10px] font-bold tracking-[2px] uppercase text-white/30 bg-white/[0.06] border border-white/[0.08] px-3 py-1 rounded-full">IT/ITES · 1,800 Employees</span>
              </div>
              <h4 className="text-[28px] font-black text-white leading-[1.15] tracking-[-0.5px] mb-8">No System. No Clean Data. 1,800 Employees Live in 7 Days.</h4>
              <div className="flex flex-col gap-4">
                <p className="text-[13.5px] text-white/55 leading-[1.8]">When this Hyderabad IT firm signed with DarwinBox, they had 1,800 employees, zero HRMS history, and data too inconsistent to import into any system.</p>
                <p className="text-[13.5px] text-white/55 leading-[1.8]">We audited every employee record, resolved data conflicts at the source, configured Core HR around how the business actually operates, and built automations that matched their workflows — not a generic template.</p>
                <p className="text-[13.5px] text-white/55 leading-[1.8]">On day seven, all 1,800 employees were live on DarwinBox. The implementation quality earned a personal commendation from Chaitanya Peddi, Co-Founder of DarwinBox.</p>
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Case Studies — Alliad & Pixxel */}
        <div className="mb-4 flex flex-col gap-8">
          <div className="text-[10px] font-bold text-[#aaa] tracking-[2.5px] uppercase">More DarwinBox Engagements</div>

          {/* Alliad GCC Services */}
          <FadeIn delay={80}>
            <div className="rounded-[16px] overflow-hidden shadow-xl flex flex-col md:flex-row" style={{ minHeight: "420px" }}>
              <div className="relative md:w-[38%] h-[280px] md:h-auto flex-shrink-0">
                <img
                  src="/dubai-skyline.jpg"
                  alt="Dubai skyline"
                  className="absolute inset-0 w-full h-full object-cover object-center"
                />
              </div>
              <div className="flex-1 bg-[#111827] p-10 flex flex-col justify-center">
                <div className="flex flex-wrap items-center gap-2 mb-5">
                  <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-white/30 bg-white/[0.06] border border-white/[0.08] px-3 py-1 rounded-full">DarwinBox · Core HR</span>
                  <span className="text-[10px] font-bold tracking-[2px] uppercase text-white/30 bg-white/[0.06] border border-white/[0.08] px-3 py-1 rounded-full">Logistics · 1,300 Employees · 7 Months</span>
                </div>
                <h4 className="text-[28px] font-black text-white leading-[1.15] tracking-[-0.5px] mb-8">50% Deskless Workforce. One Platform. Zero Paper.</h4>
                <div className="flex flex-col gap-4">
                  <p className="text-[13.5px] text-white/55 leading-[1.8]">When Alliad came to us, every GCC country was running its own HR process. Paper-based attendance, manual leave tracking, and SSO failures were generating duplicate employee records across the board.</p>
                  <p className="text-[13.5px] text-white/55 leading-[1.8]">We resolved the SSO and duplicate-record issues at the data layer, standardized leave and attendance workflows across all locations, and built a mobile-first experience designed specifically for the 50% deskless and blue-collar workforce — a demographic most HRMS rollouts ignore.</p>
                  <p className="text-[13.5px] text-white/55 leading-[1.8]">Now there&apos;s one unified HR platform across the GCC. Field employees have full digital access for the first time, leadership has real-time HR visibility, and the foundation scales cleanly to new countries and modules.</p>
                </div>
              </div>
            </div>
          </FadeIn>

          {/* Pixxel Space Technologies */}
          <FadeIn delay={160}>
            <div className="rounded-[16px] overflow-hidden shadow-xl flex flex-col md:flex-row-reverse" style={{ minHeight: "420px" }}>
              <div className="relative md:w-[38%] h-[280px] md:h-auto flex-shrink-0">
                <img
                  src="/bangalore-skyline.jpg"
                  alt="Bangalore skyline"
                  className="absolute inset-0 w-full h-full object-cover object-center"
                />
              </div>
              <div className="flex-1 bg-[#111827] p-10 flex flex-col justify-center">
                <div className="flex flex-wrap items-center gap-2 mb-5">
                  <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-white/30 bg-white/[0.06] border border-white/[0.08] px-3 py-1 rounded-full">DarwinBox · 10+ Modules</span>
                  <span className="text-[10px] font-bold tracking-[2px] uppercase text-white/30 bg-white/[0.06] border border-white/[0.08] px-3 py-1 rounded-full">SpaceTech · 250 Employees · 3 Months</span>
                </div>
                <h4 className="text-[28px] font-black text-white leading-[1.15] tracking-[-0.5px] mb-8">10 Modules. 3 Months. 95%+ Adoption on Day One.</h4>
                <div className="flex flex-col gap-4">
                  <p className="text-[13.5px] text-white/55 leading-[1.8]">When Pixxel came to us, their engineering team was running HR on email and Google Forms. High automation expectations, zero tolerance for process drag — any rollout that slowed them down wasn&apos;t going to last.</p>
                  <p className="text-[13.5px] text-white/55 leading-[1.8]">We launched Core HR, Time, Onboarding, PMS, R&R, Recruitment, and Workflows in a single phased rollout without disrupting a sprint. Survey automation replaced Google Forms entirely. PMS and MSF workflows were fully automated from day one — no manual follow-ups, ever.</p>
                  <p className="text-[13.5px] text-white/55 leading-[1.8]">10+ modules live in 3 months. 95%+ employee adoption within the first week of launch — and the engineering team never felt a thing.</p>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Clients ── */}
      <section className="bg-white px-[60px] py-[60px] border-t border-[#dde8f8]">
        <FadeIn>
          <div className="text-[10px] font-bold text-[#aaa] tracking-[2.5px] uppercase mb-5 text-center">Clients We&apos;ve Served</div>
          <div className="flex flex-wrap gap-2.5 justify-center">
            {["Ctrl S", "Emirates Retail", "Vedanta", "Tata AIG", "Lionbridge", "Boundless", "Datavolt", "Alliad"].map((c) => (
              <span key={c} className="bg-[#f8f9fa] text-[#555] text-[13px] font-medium px-4 py-2 rounded-md border border-[#dde8f8]">{c}</span>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ── HR Consulting Case Studies ── */}
      <section
        style={{ background: "#181f2a", backgroundImage: "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
        className="px-[60px] py-[100px]"
      >
        <FadeIn className="text-center mb-14">
          <div className="text-[#2196F3] text-[11px] font-bold tracking-[3px] uppercase mb-4 flex items-center justify-center gap-2">
            <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
            HR Consulting in Practice
            <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
          </div>
          <h2 className="text-[36px] font-black text-white tracking-[-0.5px]">Complex HR Problems. Real-World Fixes.</h2>
          <p className="text-white/50 text-[15px] mt-4 max-w-[560px] mx-auto leading-[1.75]">
            Beyond platform implementations — our consulting practice has solved the messy, multi-country, multi-entity HR challenges that most firms won&apos;t touch.
          </p>
        </FadeIn>

        <div className="flex flex-col gap-8">

          {/* Workday — 42 Legal Entities */}
          <FadeIn delay={80}>
            <div className="rounded-[16px] overflow-hidden shadow-xl flex flex-col md:flex-row-reverse" style={{ minHeight: "420px" }}>
              <div className="relative md:w-[38%] h-[280px] md:h-auto flex-shrink-0">
                <img
                  src="/workday-office.jpg"
                  alt="Workday enterprise office"
                  className="absolute inset-0 w-full h-full object-cover object-center"
                />
              </div>
              <div className="flex-1 bg-[#111827] p-10 flex flex-col justify-center">
                <div className="flex flex-wrap items-center gap-2 mb-5">
                  <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-white/30 bg-white/[0.06] border border-white/[0.08] px-3 py-1 rounded-full">Workday · Global Payroll</span>
                  <span className="text-[10px] font-bold tracking-[2px] uppercase text-white/30 bg-white/[0.06] border border-white/[0.08] px-3 py-1 rounded-full">42 Legal Entities</span>
                </div>
                <h4 className="text-[28px] font-black text-white leading-[1.15] tracking-[-0.5px] mb-8">Standardizing Payroll Feeds Across 42 Legal Entities</h4>
                <div className="flex flex-col gap-4">
                  <p className="text-[13.5px] text-white/55 leading-[1.8]">When a global enterprise came to us, their payroll was in chaos. They had Workday, but 42 legal entities each ran their own non-standard feed, causing constant reconciliation failures.</p>
                  <p className="text-[13.5px] text-white/55 leading-[1.8]">We aligned definitions across all 42 entities, eliminated third-party dependencies, and built direct regulatory reporting for pre-hire and leaver workflows.</p>
                  <p className="text-[13.5px] text-white/55 leading-[1.8]">Now payroll is fully centralized in Workday — one reliable source of truth, no single point of failure, and no more constant reconciliation headaches.</p>
                </div>
              </div>
            </div>
          </FadeIn>

          {/* PepsiCo — Asia, Middle East & Europe */}
          <FadeIn delay={160}>
            <div className="rounded-[16px] overflow-hidden shadow-xl flex flex-col md:flex-row" style={{ minHeight: "420px" }}>
              <div className="relative md:w-[38%] h-[280px] md:h-auto flex-shrink-0">
                <img
                  src="/pepsico.jpg"
                  alt="PepsiCo rooftop sign"
                  className="absolute inset-0 w-full h-full object-cover object-center"
                />
              </div>
              <div className="flex-1 bg-[#111827] p-10 flex flex-col justify-center">
                <div className="flex flex-wrap items-center gap-2 mb-5">
                  <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-white/30 bg-white/[0.06] border border-white/[0.08] px-3 py-1 rounded-full">PepsiCo · Payroll Transformation</span>
                  <span className="text-[10px] font-bold tracking-[2px] uppercase text-white/30 bg-white/[0.06] border border-white/[0.08] px-3 py-1 rounded-full">Asia · Middle East · Europe</span>
                </div>
                <h4 className="text-[28px] font-black text-white leading-[1.15] tracking-[-0.5px] mb-8">Payroll Centralization Across Asia, Middle East & Europe</h4>
                <div className="flex flex-col gap-4">
                  <p className="text-[13.5px] text-white/55 leading-[1.8]">When PepsiCo came to us, they were running payroll across Asia, the Middle East, and Europe with no unified platform, too many vendors, and no shared services model in key regions.</p>
                  <p className="text-[13.5px] text-white/55 leading-[1.8]">We deployed KRONOS across India, Philippines, Pakistan, and the EU — fully integrated with payroll and HRMS — collapsed the vendor landscape to a 2-vendor strategy, and stood up greenfield HR Shared Services centres in India, Krakow, and Egypt.</p>
                  <p className="text-[13.5px] text-white/55 leading-[1.8]">The full input-to-payout process is now streamlined. Platforms unified, vendor count reduced, and a scalable shared services model running across three geographies.</p>
                </div>
              </div>
            </div>
          </FadeIn>

        </div>
      </section>

      {/* ── Image Split ── */}
      <div className="flex flex-col md:flex-row" style={{ minHeight: "520px" }}>
        <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
          <img src="/hr-leadership-team.jpg" alt="HR transformation leadership team" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-[#212121]/30" />
        </div>
        <div className="md:w-1/2 bg-[#1a2030] flex items-center px-16 py-20">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[3px] uppercase text-[#2196F3] mb-5">
              <span className="w-5 h-0.5 bg-[#2196F3]" />HR Transformation · 40+ Years of Leadership
            </div>
            <h2 className="text-[34px] font-black text-white tracking-[-0.5px] mb-5 leading-[1.2]">A Team That Has Done This Before — at Scale</h2>
            <p className="text-white/60 text-[15px] leading-[1.85] mb-8">Our HR practice leads bring decades of real-world experience from Meta, PepsiCo, and Viatris. We don't just implement platforms — we've managed payroll for 80,000+ employees and run HR operations across 170 countries.</p>
            <div className="flex flex-col gap-3">
              {[
                "40+ years combined HR transformation leadership",
                "80,000+ employees managed at Meta",
                "17+ DarwinBox projects delivered",
                "170 countries covered",
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

      {/* ── CTA ── */}
      <section className="bg-[#2196F3] px-[60px] py-[100px] text-center">
        <FadeIn>
          <h2 className="text-[46px] font-black text-white mb-4 tracking-[-1px]">Ready to Modernize HR?</h2>
          <p className="text-white/78 text-[17px] max-w-[500px] mx-auto mb-10 leading-[1.7]">
            Start with a 30-minute strategy session. We&apos;ll assess your current HRMS landscape and identify your highest-impact modernization opportunity.
          </p>
          <a href="mailto:safna@cloudbasesolutions.digital" className="bg-white text-[#2196F3] text-[15px] font-extrabold px-10 py-4 rounded-md inline-block hover:opacity-90 transition-opacity no-underline">
            Book a Strategy Session
          </a>
        </FadeIn>
      </section>

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
