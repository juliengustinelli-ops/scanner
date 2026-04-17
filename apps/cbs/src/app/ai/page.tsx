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

function AgentFlowMockup() {
  const agents = [
    { name: "Orchestrator", color: "#2196F3", status: "Running" },
    { name: "Data Agent", color: "#00BCD4", status: "Active" },
    { name: "Reasoning Agent", color: "#9C27B0", status: "Active" },
    { name: "Action Agent", color: "#4CAF50", status: "Done" },
  ];
  return (
    <div className="bg-[#0f1117] border border-white/[0.1] rounded-xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.4)]">
      <div className="bg-[#161b24] border-b border-white/[0.07] px-4 py-2.5 flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[11px] text-white/30 font-mono">agentic-runtime · live</span>
        <span className="ml-auto w-2 h-2 rounded-full bg-[#4CAF50] animate-pulse" />
      </div>
      <div className="p-5">
        <div className="text-[10px] text-white/30 font-mono mb-4 tracking-wider">MULTI-AGENT PIPELINE</div>
        <div className="flex flex-col gap-3">
          {agents.map((a, i) => (
            <div key={a.name} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.color }} />
              <div className="flex-1 bg-white/[0.04] rounded px-3 py-2 border border-white/[0.05]">
                <div className="flex justify-between items-center">
                  <span className="text-[12px] text-white/70 font-mono">{a.name}</span>
                  <span className="text-[10px] font-bold" style={{ color: a.status === "Done" ? "#4CAF50" : a.color }}>{a.status}</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: a.status === "Done" ? "100%" : i === 0 ? "72%" : i === 1 ? "88%" : "55%", background: a.color, opacity: 0.7 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 pt-4 border-t border-white/[0.06] grid grid-cols-3 gap-3">
          {[
            { label: "KB Accuracy", val: "90%+" },
            { label: "Self-Service", val: "95%+" },
            { label: "MTTR Reduction", val: "35%+" },
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

export default function AIPage() {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <Nav />

      {/* ── Hero ── */}
      <section className="min-h-screen pt-0 pb-0 relative overflow-hidden flex flex-col" style={{ background: "#212121" }}>
        <img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=80" alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.22]" />
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative z-10 flex-1 px-6 pt-32 pb-10 md:px-16 md:pt-44 md:pb-16 grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          <FadeIn>
            <Label>AI Practice · Innovation Hub</Label>
            <h1 className="text-[28px] md:text-[52px] font-black text-white leading-[1.08] tracking-[-1.5px] mb-6">
              Agentic AI.<br />
              <span className="text-[#2196F3]">From Discovery<br />to Production</span><br />
              in 12 Weeks.
            </h1>
            <p className="text-white/55 text-[16px] leading-[1.8] mb-10 max-w-[440px]">
              We design, build, and deploy autonomous multi-agent AI systems for enterprise workflows — LLM-agnostic, enterprise-grade, with measurable ROI before you scale.
            </p>
            <div className="flex gap-3 flex-wrap">
              <a href="#process" className="bg-[#2196F3] hover:bg-[#42a5f5] text-white text-[14px] font-bold px-8 py-3.5 rounded-md transition-colors no-underline">
                See Our Process
              </a>
              <a href="https://calendly.com/raghu-cloudbasesolutions/30min" target="_blank" rel="noopener noreferrer" className="border border-white/[0.15] hover:border-white/30 text-white text-[14px] font-bold px-8 py-3.5 rounded-md transition-colors no-underline">
                Book a Discovery Call
              </a>
            </div>
          </FadeIn>
          <FadeIn delay={150}>
            <AgentFlowMockup />
          </FadeIn>
        </div>

        {/* Stat bar */}
        <div className="relative z-10 border-t border-white/[0.06] grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-white/[0.06]">
          {[
            { val: "12", label: "Weeks to Production" },
            { val: "70%", label: "of AI Projects Fail to Scale*" },
            { val: "90%+", label: "KB Generation Accuracy" },
            { val: "35%+", label: "MTTR Reduction" },
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
        <FadeIn className="max-w-[700px] mx-auto text-center mb-16">
          <Label center>The Challenge</Label>
          <h2 className="text-[36px] font-black text-[#212121] tracking-[-0.5px] mb-5">
            70% of AI Projects Fail to Scale
          </h2>
          <p className="text-[#555] text-[16px] leading-[1.8]">
            Most enterprises run proof-of-concepts that never reach production. The gap between a demo and a deployed, measurable system is where value gets lost — because organizations lack a systematic approach.
          </p>
        </FadeIn>
        <div className="grid md:grid-cols-4 gap-5">
          {[
            {
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
              title: "No Systematic Approach",
              desc: "Traditional AI projects lack the rapid experimentation frameworks needed to identify high-value use cases before committing.",
            },
            {
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
              title: "Constant Human Oversight",
              desc: "Traditional AI requires manual intervention at every step. Agentic systems plan, execute, and adapt autonomously.",
            },
            {
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>,
              title: "No Guardrails",
              desc: "Autonomous agents without safety layers create compliance risk. Enterprises need enterprise-grade security — SSO, audit trails, access governance.",
            },
            {
              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>,
              title: "Scarce AI Talent",
              desc: "Building an internal agentic AI team takes years. Most enterprises can't hire fast enough to keep pace with the technology.",
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

      {/* ── Process ── */}
      <section
        id="process"
        className="overflow-hidden"
        style={{ background: "#212121", backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
      >
        <div className="flex flex-col md:flex-row-reverse" style={{ minHeight: "560px" }}>
          <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
            <img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80" alt="AI team working together" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-[#212121]/40" />
          </div>
          <FadeIn className="md:w-1/2 flex flex-col justify-center px-14 py-16">
            <Label>Our Method</Label>
            <h2 className="text-[34px] font-black text-white tracking-[-0.5px] leading-[1.2] mb-5">
              The Agent Factory<br />Process
            </h2>
            <p className="text-white/60 text-[15px] leading-[1.8] mb-8">
              A repeatable framework that takes you from problem statement to a live agentic system — in weeks, not quarters. Enterprise-grade, with measurable ROI before you scale.
            </p>
            <div className="flex flex-col gap-4 mb-8">
              {[
                { phase: "Discovery & Setup", desc: "Architecture design, infrastructure setup, data source integration." },
                { phase: "Agent Development", desc: "Autonomous agents with planning logic and feedback loops." },
                { phase: "Training & Optimization", desc: "Agents trained on your data, parameters fine-tuned." },
                { phase: "Validation & Safety", desc: "Business testing, guardrails, access governance, compliance." },
                { phase: "Deployment & Scale", desc: "Production launch, monitoring dashboards, continuous improvement." },
              ].map((s) => (
                <div key={s.phase} className="flex gap-4 items-start">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#2196F3] mt-2 flex-shrink-0" />
                  <div>
                    <span className="text-white text-[14px] font-bold">{s.phase}</span>
                    <span className="text-white/50 text-[14px]"> — {s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {["12 weeks to production", "Robust governance", "Platform agnostic", "Quick deployment", "Measurable ROI"].map((f) => (
                <span key={f} className="text-[11px] text-[#2196F3] bg-[rgba(33,150,243,0.1)] border border-[rgba(33,150,243,0.18)] px-3 py-1 rounded-full font-medium">✓ {f}</span>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Agentic AI Featured Use Cases ── */}
      <section id="use-cases" className="bg-white px-[60px] py-[100px]">
        <FadeIn className="text-center mb-14">
          <Label center>Agentic AI Use Cases</Label>
          <h2 className="text-[36px] font-black text-[#212121] tracking-[-0.5px]">Multi-Agent Systems That Work Autonomously</h2>
          <p className="text-[#555] text-[15px] mt-4 max-w-[560px] mx-auto leading-[1.8]">Each solution is a coordinated system of AI agents — not a single model — handling planning, execution, and adaptation end-to-end.</p>
        </FadeIn>
        <div className="flex flex-col gap-6">
          {[
            {
              title: "Lead Nurturing Engine",
              img: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&q=80",
              problem: "Sales teams lose high-intent leads due to delayed follow-ups, inconsistent engagement, and lack of personalization.",
              agents: ["Lead Qualification Agent", "Engagement Agent", "Conversation Agent", "Offer Optimization Agent", "Sales Copilot Agent"],
              benefits: ["2–3x increase in lead conversion rates", "40% reduction in manual follow-ups", "Always-on personalized engagement at scale"],
              color: "#2196F3",
              tag: "Sales",
            },
            {
              title: "AI-Powered SDLC",
              img: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&q=80",
              problem: "Software and ML development cycles are slow, fragmented, and heavily reliant on manual coordination across teams.",
              agents: ["Data Science Agent", "Feature Engineering Agent", "Model Optimization Agent", "MLOps Agent", "SRE Agent", "Release Notes Agent", "Scrum Master Agent", "Diagnostic Agent"],
              benefits: ["30–40% faster development cycles", "Reduced dependency on manual coordination", "Continuous optimization of models and systems"],
              color: "#9C27B0",
              tag: "Engineering",
            },
            {
              title: "Customer Support Resolution Agent",
              img: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=800&q=80",
              problem: "Traditional chatbots handle only FAQs while complex issues still require manual intervention, leading to delays and high costs.",
              agents: ["Intent Agent", "Resolution Agent", "Backend Action Agent", "Escalation Agent"],
              benefits: ["30% ticket resolution automation", "Reduced average handling time by 30–40%", "Improved customer satisfaction with faster resolution"],
              color: "#00BCD4",
              tag: "CX / Support",
            },
          ].map((uc, i) => (
            <FadeIn key={uc.title} delay={i * 80}>
              <div className="flex flex-col md:flex-row rounded-[16px] overflow-hidden border border-[#e8eef7] shadow-sm hover:shadow-lg transition-shadow bg-white">
                <div className="relative flex-shrink-0 h-[260px] md:h-auto md:w-[42%] overflow-hidden" style={{ order: i % 2 === 1 ? 2 : 0 }}>
                  <img src={uc.img} alt={uc.title} className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${uc.color}cc 0%, rgba(0,0,0,0.55) 100%)` }} />
                  <div className="absolute inset-0 flex flex-col justify-end p-8">
                    <span className="text-[10px] font-bold tracking-[3px] uppercase mb-2 inline-block px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.2)" }}>{uc.tag}</span>
                    <h3 className="text-[26px] font-black text-white leading-[1.15] tracking-[-0.5px]">{uc.title}</h3>
                  </div>
                </div>
                <div className="flex-1 p-8 flex flex-col justify-center" style={{ order: i % 2 === 1 ? 1 : 0 }}>
                  <div className="mb-5">
                    <div className="text-[10px] font-bold text-[#aaa] tracking-[2px] uppercase mb-1.5">The Problem</div>
                    <p className="text-[14px] text-[#444] leading-[1.75]">{uc.problem}</p>
                  </div>
                  <div className="mb-5">
                    <div className="text-[10px] font-bold text-[#aaa] tracking-[2px] uppercase mb-2.5">Agent Roster</div>
                    <div className="flex flex-wrap gap-1.5">
                      {uc.agents.map(a => (
                        <span key={a} className="text-[11px] px-2.5 py-1 rounded-full font-semibold" style={{ background: `${uc.color}14`, color: uc.color, border: `1px solid ${uc.color}28` }}>{a}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#aaa] tracking-[2px] uppercase mb-2.5">Key Benefits</div>
                    <div className="flex flex-col gap-2">
                      {uc.benefits.map(b => (
                        <div key={b} className="flex items-start gap-2.5">
                          <span className="text-[13px] font-black mt-0.5 flex-shrink-0" style={{ color: uc.color }}>✓</span>
                          <span className="text-[13px] text-[#333] leading-[1.5] font-medium">{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── Use Cases by Industry ── */}
      <section className="bg-[#f8f9fa] px-[60px] py-[100px]">
        <FadeIn className="text-center mb-14">
          <Label center>Real-World Applications</Label>
          <h2 className="text-[36px] font-black text-[#212121] tracking-[-0.5px]">Deployed Across Every Industry</h2>
          <p className="text-[#555] text-[15px] mt-4 max-w-[560px] mx-auto leading-[1.8]">Proven use cases from live client deployments — each with measurable outcomes.</p>
        </FadeIn>
        <div className="flex flex-col gap-14">
          {[
            {
              category: "Accounting & Finance",
              img: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1400&q=80",
              color: "#1565C0",
              cases: [
                { title: "Smart Expense Receipt Capture & Auto-Accounting", problem: "Finance teams manually re-entering receipt details and tax codes, causing reimbursement delays and frequent coding errors.", benefit: "Faster reimbursements, reduced coding errors, improved VAT/GST reclaim accuracy." },
                { title: "Vendor Master Data De-duplication", problem: "Duplicate vendor records and incorrect entries led to increased reconciliation effort at month-end.", benefit: "Improved vendor data quality, enhanced spend analytics, stronger audit governance." },
                { title: "Customer Retention Program", problem: "Regional bank losing customers after fee changes with no visibility into who was at risk or why.", benefit: "Increased retention, reduced incentive spending, clear guidance for targeted service actions." },
                { title: "Process Automation (KYC & Claims)", problem: "Life insurer manually processing KYC, invoice, and claims data — long cycle times and SLA misses during high-volume periods.", benefit: "Significant reduction in processing time, improved accuracy, and lower operational costs." },
                { title: "Anomaly Detection", problem: "Payment platform's critical failures were hidden in noisy dashboards — customers reported issues before internal teams.", benefit: "Faster root-cause identification, reduced customer impact, improved service reliability." },
              ],
            },
            {
              category: "Retail",
              img: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1400&q=80",
              color: "#6A1B9A",
              cases: [
                { title: "Sales Forecasting for QSR", problem: "Leading US quick-service chain with under-forecasting issues directly impacting labor and inventory planning.", benefit: "Improved forecast accuracy by 7%, better labor & inventory planning, enhanced profitability." },
                { title: "Call Center Agent Assist (RAG)", problem: "Support agents unable to find real-time product, inventory, and policy info — causing long calls and inconsistent answers.", benefit: "20% reduction in handle time, improved first-contact resolution, new agents performing like veterans from day one." },
                { title: "Demand Prediction", problem: "National grocery chain experiencing stockouts on promoted items and excess inventory on slow movers, especially around holidays.", benefit: "Higher product availability, lower inventory holding costs, improved customer satisfaction." },
                { title: "Customer Segmentation", problem: "Beauty e-commerce brand using generic campaigns for all customers — low repeat purchases and high unsubscribe rates.", benefit: "Lower acquisition costs, higher message relevance, improved repeat purchase rates." },
                { title: "Cross-sell Prediction", problem: "Checkout add-on recommendations lacked relevance — low attach rates and customer disengagement.", benefit: "Increased average basket value, higher recommendation relevance, reduced customer fatigue." },
              ],
            },
            {
              category: "Healthcare",
              img: "https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&w=1400&q=80",
              color: "#1B5E20",
              cases: [
                { title: "AI-Powered Conversational Chatbot", problem: "Regional health insurer overwhelmed with routine coverage and claims calls — over 60% of calls were simple, repetitive questions.", benefit: "35% call deflection, reduced average handle time, lower operational costs, improved CSAT scores." },
                { title: "Patient Burden Analysis in Clinical Trials", problem: "Manual burden assessment from trial protocol documents was time-consuming, inconsistent, and slowed trial design.", benefit: "Automated and objective burden scoring, reduced manual effort, improved trial design, higher patient participation." },
                { title: "Smart Recordkeeping", problem: "Physicians spending hours after-hours finalizing notes and correcting billing codes — productivity loss and revenue leakage.", benefit: "More time for patient care, fewer claim denials, higher-quality clinical documentation." },
              ],
            },
            {
              category: "Manufacturing",
              img: "https://images.unsplash.com/photo-1565514020179-026b92b84bb6?auto=format&fit=crop&w=1400&q=80",
              color: "#BF360C",
              cases: [
                { title: "IoT-based Backflow Preventer Health Monitoring", problem: "Manual field engineer inspections for backflow preventer health — time-consuming, labor-intensive, error-prone, and costly.", benefit: "Automated monitoring saving up to USD 8M annually. Early visibility through Power BI dashboards and Power Apps." },
                { title: "Customer Contact Data Management", problem: "Warehouse company with redundant contact records causing wrong-person communication failures and increased marketing costs.", benefit: "Golden records with 95%+ precision, reduced marketing expenses, improved campaign hit rates, stronger data governance." },
              ],
            },
          ].map((group, gi) => (
            <FadeIn key={group.category} delay={gi * 60}>
              <div>
                {/* Category Header with Image */}
                <div className="relative rounded-[16px] overflow-hidden mb-6 h-[180px]">
                  <img src={group.img} alt={group.category} className="w-full h-full object-cover" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(100deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 100%)" }} />
                  <div className="absolute inset-0 flex items-center px-10 gap-5">
                    <div className="w-[3px] h-10 rounded-full flex-shrink-0" style={{ background: group.color === "#1565C0" ? "#2196F3" : group.color === "#6A1B9A" ? "#CE93D8" : group.color === "#1B5E20" ? "#66BB6A" : "#FF8A65" }} />
                    <div>
                      <div className="text-[10px] font-bold text-white/40 tracking-[3px] uppercase mb-1">Industry</div>
                      <h3 className="text-[30px] font-black text-white tracking-[-0.5px]">{group.category}</h3>
                    </div>
                    <div className="ml-auto">
                      <span className="text-[12px] font-bold text-white/50 bg-white/10 px-3 py-1.5 rounded-full border border-white/10">{group.cases.length} use cases</span>
                    </div>
                  </div>
                </div>
                {/* Use Case Cards */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.cases.map((uc) => (
                    <div key={uc.title} className="bg-white rounded-[12px] border-l-[3px] border border-[#e8eef7] p-6 hover:shadow-md transition-all" style={{ borderLeftColor: group.color === "#1565C0" ? "#2196F3" : group.color === "#6A1B9A" ? "#9C27B0" : group.color === "#1B5E20" ? "#4CAF50" : "#FF5722" }}>
                      <h5 className="text-[13px] font-bold text-[#1a1a1a] mb-2.5 leading-[1.4]">{uc.title}</h5>
                      <p className="text-[12px] text-[#666] leading-[1.65] mb-3">{uc.problem}</p>
                      <div className="pt-3 border-t border-[#f0f0f0]">
                        <p className="text-[11px] font-semibold leading-[1.5]" style={{ color: group.color === "#1565C0" ? "#2196F3" : group.color === "#6A1B9A" ? "#9C27B0" : group.color === "#1B5E20" ? "#4CAF50" : "#FF5722" }}>✓ {uc.benefit}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── Proven Outcomes ── */}
      <section className="bg-[#f8f9fa] px-[60px] py-[100px]">
        <FadeIn className="text-center mb-14">
          <Label center>Proven Outcomes</Label>
          <h2 className="text-[36px] font-black text-[#212121] tracking-[-0.5px]">Measurable Results, Not Just Demos</h2>
          <p className="text-[#555] text-[15px] mt-4 max-w-[560px] mx-auto leading-[1.8]">These are real outcomes from CBS-deployed Automation & Agentic systems — ROI-based delivery, not research papers.</p>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { metric: "90%+", label: "Automatic KB Generation Accuracy", desc: "Agents auto-generate knowledge base articles from resolved tickets — dramatically reducing analyst workload." },
            { metric: "90%+", label: "Resolution Notes Accuracy", desc: "AI-generated resolution notes and plan summaries accepted by service teams on first pass." },
            { metric: "95%+", label: "Software Deployment Self-Service", desc: "Employees self-serve software requests without IT intervention through autonomous deployment agents." },
            { metric: "70%+", label: "Repeat Incident Coverage", desc: "Self-service resolution for repeat incidents, with 80%+ accuracy on automated responses." },
            { metric: "35%+", label: "MTTR Reduction", desc: "Mean time to resolution cut by over a third through autonomous incident routing and resolution." },
            { metric: "80%", label: "Customer Prep Acceptance Rate", desc: "AI-generated prep decks for customer calls — pulled from internal sources — accepted without major edits." },
          ].map((o, i) => (
            <FadeIn key={o.label} delay={i * 70}>
              <div className="bg-white rounded-[10px] border border-[#dde8f8] p-7">
                <div className="text-[36px] font-black text-[#2196F3] tracking-[-1px] mb-1">{o.metric}</div>
                <div className="text-[13px] font-bold text-[#212121] mb-2">{o.label}</div>
                <p className="text-[12px] text-[#555] leading-[1.65]">{o.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── Image Split ── */}
      <div className="flex flex-col md:flex-row-reverse" style={{ minHeight: "520px" }}>
        <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
          <img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80" alt="AI team building systems" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-[#212121]/30" />
        </div>
        <div className="md:w-1/2 bg-[#1a2030] flex items-center px-16 py-20">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[3px] uppercase text-[#2196F3] mb-5">
              <span className="w-5 h-0.5 bg-[#2196F3]" />Agentic AI Practice · Agent Factory
            </div>
            <h2 className="text-[34px] font-black text-white tracking-[-0.5px] mb-5 leading-[1.2]">From Whiteboard to Working Agent in 12 Weeks.</h2>
            <p className="text-white/60 text-[15px] leading-[1.85] mb-8">Our Agent Factory is a repeatable framework that delivers working autonomous systems — with measurable ROI — before you commit to scale. Enterprise-grade. Platform agnostic. Built for production, not demos.</p>
            <div className="flex flex-col gap-3">
              {[
                "LLM-agnostic: OpenAI, Llama, Claude, or your stack",
                "Enterprise security: SSO, audit trails, access governance",
                "Pre-built agent templates across 6+ industries",
                "Phased delivery with ROI gates at each milestone",
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

      {/* ── Why CBS ── */}
      <section className="bg-white px-[60px] py-[100px]">
        <FadeIn className="text-center mb-14">
          <Label center>Why Cloud Base Solutions</Label>
          <h2 className="text-[36px] font-black text-[#212121] tracking-[-0.5px]">Built for Enterprise. Delivered Fast.</h2>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { title: "LLM-Agnostic", desc: "OpenAI, Llama, Claude, or your existing model — we build on the best stack for your use case, not what we're locked into.", badge: "OpenAI · Llama · Claude" },
            { title: "Enterprise Security", desc: "SSO, audit trails, access governance, and data residency compliance built in from day one — not retrofitted.", badge: "SSO · Audit Trails · Governance" },
            { title: "ROI Before You Scale", desc: "We use an ROI-based delivery approach. Not every use case needs an agent — we help you find the ones that do.", badge: "Measured Outcomes" },
          ].map((c, i) => (
            <FadeIn key={c.title} delay={i * 100}>
              <div className="bg-[#f8f9fa] rounded-[10px] border border-[#dde8f8] p-8">
                <div className="text-[10px] font-bold text-[#2196F3] tracking-[2px] bg-[#E3F2FD] px-2.5 py-1 rounded inline-block mb-4">{c.badge}</div>
                <h4 className="text-[16px] font-black text-[#212121] mb-2">{c.title}</h4>
                <p className="text-[13px] text-[#555] leading-[1.7]">{c.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="bg-[#2196F3] px-[60px] py-[100px] text-center">
        <FadeIn>
          <h2 className="text-[46px] font-black text-white mb-4 tracking-[-1px]">Ready to Build Your First Agent?</h2>
          <p className="text-white/78 text-[17px] max-w-[500px] mx-auto mb-10 leading-[1.7]">
            Start with a 2-week discovery sprint. We&apos;ll map your highest-value AI use case and deliver a working prototype.
          </p>
          <a href="https://calendly.com/raghu-cloudbasesolutions/30min" target="_blank" rel="noopener noreferrer" className="bg-white text-[#2196F3] text-[15px] font-extrabold px-10 py-4 rounded-md inline-block hover:opacity-90 transition-opacity no-underline">
            Start the Conversation
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
