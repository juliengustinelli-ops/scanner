"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

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
          const duration = 1500;
          const steps = 60;
          const increment = end / steps;
          let current = 0;
          const timer = setInterval(() => {
            current += increment;
            if (current >= end) {
              setCount(end);
              clearInterval(timer);
            } else {
              setCount(Math.floor(current));
            }
          }, duration / steps);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [end]);

  return (
    <span ref={ref}>
      {count}
      {suffix}
    </span>
  );
}

// ─── Section Fade-In ──────────────────────────────────────────────────────────
function FadeIn({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setVisible(true), delay);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
      }}
    >
      {children}
    </div>
  );
}

// ─── Section Label ────────────────────────────────────────────────────────────
function SectionLabel({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-[11px] font-bold tracking-[3px] uppercase mb-4 ${light ? "text-[#2196F3]" : "text-[#2196F3]"}`}>
      <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
      {children}
    </div>
  );
}

// ─── CBS Logo Icon ────────────────────────────────────────────────────────────
function LogoIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M2 36 L22 36 L26 28 L6 28 Z" fill="#2196F3" opacity="0.32" />
      <path d="M7 26 L27 26 L31 18 L11 18 Z" fill="#2196F3" opacity="0.62" />
      <path d="M12 16 L32 16 L36 8 L16 8 Z" fill="#2196F3" />
    </svg>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-10 py-[18px] bg-[rgba(33,33,33,0.97)] border-b border-white/[0.06] backdrop-blur-md">
      {/* Logo */}
      <a href="#" className="flex items-center gap-3 no-underline">
        <LogoIcon />
        <div className="leading-tight">
          <div className="text-[17px] font-black text-white tracking-[0.3px] leading-[1.1]">CLOUD BASE</div>
          <div className="text-[10px] font-semibold text-white/45 tracking-[4px] uppercase mt-[3px]">SOLUTIONS</div>
        </div>
      </a>

      {/* Desktop Links */}
      <div className="hidden md:flex items-center gap-8">
        {[
          { label: "ServiceNow", href: "/servicenow" },
          { label: "Agentic AI", href: "/ai" },
          { label: "HR Transformation", href: "/hr" },
          { label: "Tech Staffing", href: "/staffing" },
        ].map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="text-white/88 hover:text-white text-[15px] font-semibold transition-colors no-underline"
          >
            {l.label}
          </a>
        ))}

        {/* About Dropdown */}
        <div
          className="relative"
          onMouseEnter={() => setAboutOpen(true)}
          onMouseLeave={() => setAboutOpen(false)}
        >
          <button className="flex items-center gap-1 text-white/88 hover:text-white text-[15px] font-semibold transition-colors cursor-pointer bg-transparent border-none">
            About <span className="text-[10px] opacity-60">▾</span>
          </button>
          {aboutOpen && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-[14px] min-w-[160px] z-50">
              <div className="bg-[rgba(20,20,20,0.97)] border border-white/10 rounded-lg overflow-hidden backdrop-blur-md">
                {[
                  { label: "Company", href: "#about" },
                  { label: "Team", href: "#team" },
                ].map((item, i, arr) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setAboutOpen(false)}
                    className={`block px-[18px] py-[11px] text-white/80 hover:text-white hover:bg-[rgba(33,150,243,0.15)] text-[14px] font-medium no-underline transition-colors ${i < arr.length - 1 ? "border-b border-white/[0.06]" : ""}`}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <a
          href="https://calendly.com/raghu-cloudbasesolutions/30min"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-[#2196F3] hover:bg-[#42a5f5] text-white text-[15px] font-bold px-[26px] py-[10px] rounded-md transition-colors no-underline"
        >
          Book a Call
        </a>
      </div>

      {/* Mobile Toggle */}
      <button
        className="md:hidden text-white bg-transparent border-none cursor-pointer"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {menuOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-[#1a1a1a] px-6 pt-4 pb-4 flex flex-col gap-3 border-t border-white/[0.06]">
          {[
            { label: "ServiceNow", href: "/servicenow" },
            { label: "Agentic AI", href: "/ai" },
            { label: "HR Transformation", href: "/hr" },
            { label: "Tech Staffing", href: "/staffing" },
            { label: "Company", href: "#about" },
            { label: "Team", href: "#team" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="text-white/80 hover:text-white text-sm font-medium py-1 no-underline transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <a
            href="https://calendly.com/raghu-cloudbasesolutions/30min"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className="bg-[#2196F3] text-white text-sm font-bold px-4 py-2 rounded-md text-center no-underline mt-2"
          >
            Book a Call
          </a>
        </div>
      )}
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="grid md:grid-cols-2 min-h-screen">
      {/* Left */}
      <div className="bg-[#f8f9fa] px-6 pt-32 pb-12 md:px-16 md:pt-40 md:pb-20 flex flex-col justify-center relative overflow-hidden">
        <div className="absolute bottom-[-100px] left-[-100px] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(33,150,243,0.07)_0%,transparent_70%)]" />
        <FadeIn>
          <div className="text-[#2196F3] text-[11px] font-bold tracking-[3px] uppercase mb-7 flex items-center gap-2">
            One Integrated Partner · 12-Week Delivery
          </div>
          <h1 className="text-[28px] md:text-[54px] font-black leading-[1.1] text-[#212121] mb-6 tracking-[-1.5px]">
            Enterprise AI &amp; Cloud Transformation.<br />
            <em className="not-italic text-[#2196F3]">Deployed in Weeks,</em><br />
            Not Years.
          </h1>
          <p className="text-[#555555] text-[16px] leading-[1.75] max-w-[420px] mb-10">
            One partner for ServiceNow, Agentic AI, HR Transformation, and Tech Staffing. Built for enterprise scale. Flexible as a startup.
          </p>
          <div className="flex gap-3 flex-wrap">
            <a href="#cta" className="bg-[#2196F3] hover:bg-[#42a5f5] text-white text-[14px] font-bold px-8 py-3.5 rounded-md transition-colors no-underline">
              Book a Discovery Call
            </a>
            <a href="#services" className="border border-[#212121]/20 hover:border-[#2196F3] hover:text-[#2196F3] text-[#212121] text-[14px] font-semibold px-8 py-3.5 rounded-md transition-colors no-underline">
              Explore Services
            </a>
          </div>
        </FadeIn>
      </div>

      {/* Right */}
      <div className="bg-[#2196F3] px-6 pt-12 pb-12 md:px-16 md:pt-40 md:pb-20 flex flex-col justify-center relative overflow-hidden">
        <img src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=900&q=80" alt="" className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-30" />
        <div className="absolute top-[-80px] right-[-80px] w-[300px] h-[300px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.1)_0%,transparent_70%)]" />
        <FadeIn delay={200}>
          <div className="grid grid-cols-2 gap-3 relative z-10">
            {[
              { num: "130+", label: "ServiceNow\nProfessionals" },
              { num: "75+", label: "ServiceNow\nCertifications" },
              { num: "40+", label: "AI Projects\nDelivered" },
              { num: "70+", label: "Years Combined\nLeadership" },
            ].map((s) => (
              <div key={s.label} className="bg-black/[0.22] border border-black/[0.15] rounded-[10px] px-4 py-5 md:px-7 md:py-8 hover:bg-black/[0.32] transition-colors">
                <div className="text-[32px] md:text-[48px] font-black text-white leading-none mb-2 tracking-[-1px]">{s.num}</div>
                <div className="text-white/80 text-[11px] md:text-[12px] font-medium leading-[1.5] whitespace-pre-line">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-7 relative z-10">
            <div className="text-[10px] font-bold text-white/40 tracking-[2.5px] uppercase mb-3.5">Partners &amp; Ecosystem</div>
            <div className="flex items-center gap-5 flex-wrap">
              {["Genpact", "IBM", "ServiceNow", "Deloitte"].map((p) => (
                <div key={p} className="bg-white/12 border border-white/15 rounded-md px-[18px] py-2 text-[14px] font-extrabold text-white tracking-[0.3px]">
                  {p}
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Services Strip ───────────────────────────────────────────────────────────
function ServicesStrip() {
  const items = [
    "ServiceNow · All Modules incl. Agentic AI",
    "HR Tech & Transformation",
    "Agentic AI · Agent Factory",
    "Technology Staffing · US · India · Mexico",
  ];
  return (
    <div className="bg-[#1c1c1c] px-4 md:px-10 py-[18px] flex items-center gap-6 md:gap-10 overflow-x-auto border-b border-white/[0.05]">
      {items.map((item, i) => (
        <span key={item} className="whitespace-nowrap text-white/60 text-[12px] font-semibold tracking-[1px] uppercase flex items-center gap-3">
          {item}
          {i < items.length - 1 && <span className="text-white/20 text-[20px]">·</span>}
        </span>
      ))}
    </div>
  );
}

// ─── Partners Strip ───────────────────────────────────────────────────────────
function PartnersStrip() {
  return (
    <div className="bg-[#f8f9fa] px-4 md:px-10 py-5 md:py-7 border-b border-[#eaecf0] flex flex-wrap items-center gap-4 md:gap-12">
      <div className="text-[10px] font-bold text-[#aaa] tracking-[2.5px] uppercase whitespace-nowrap">Trusted Partners</div>
      <div className="hidden md:block w-px h-7 bg-[#ddd]" />
      {["Genpact", "IBM", "ServiceNow", "Deloitte"].map((p) => (
        <div key={p} className="text-[14px] font-extrabold text-[#777] hover:text-[#2196F3] transition-colors tracking-[0.3px] cursor-default">
          {p}
        </div>
      ))}
    </div>
  );
}

// ─── About ────────────────────────────────────────────────────────────────────
function About() {
  return (
    <section id="about" className="overflow-hidden bg-white">
      <div className="flex flex-col md:flex-row" style={{ minHeight: "540px" }}>
        {/* Left — Photo */}
        <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
          <img
            src="/india-office-team.jpg"
            alt="Indian professionals in a modern office"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-white/5" />
        </div>

        {/* Right — Content */}
        <FadeIn className="md:w-1/2 flex flex-col justify-center px-6 py-10 md:px-14 md:py-16">
          <SectionLabel>About CBS</SectionLabel>
          <h2 className="text-[26px] md:text-[34px] font-black text-[#212121] leading-[1.2] mb-5 tracking-[-0.5px]">
            Built to Deliver Outcomes.<br />Not Just Implementations.
          </h2>
          <p className="text-[#555] text-[15px] leading-[1.8] mb-8">
            Cloud Base Solutions brings together a global team of domain experts and a carefully curated partner ecosystem — combining the scale of a large firm with the flexibility and focus of a specialist.
          </p>
          <div className="flex flex-col gap-5">
            {[
              { title: "Curated Partner Ecosystem", desc: "Hand-picked GSI and technology partners that drive scale and nimbleness without the overhead." },
              { title: "Manically Client-Centric", desc: "Flexible, agile, and price-competitive — we adapt to your needs, not the other way around." },
              { title: "Domain Expertise-Led", desc: "Solutions designed by practitioners who have run these platforms at the world's largest enterprises." },
              { title: "Best of Breed Approach", desc: "Enterprise-grade capability with the speed and accountability of a specialist firm." },
            ].map((c) => (
              <div key={c.title} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#2196F3] mt-2 flex-shrink-0" />
                <div>
                  <span className="text-[#212121] text-[14px] font-bold">{c.title}</span>
                  <span className="text-[#777] text-[14px]"> — {c.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Services ─────────────────────────────────────────────────────────────────
function Services() {
  const cards = [
    {
      icon: "⚙️",
      title: "ServiceNow",
      sub: "All Modules · Agentic AI",
      desc: "Full platform coverage from advisory to deployment. 130+ professionals, 75+ certifications across all verticals.",
      href: "/servicenow",
    },
    {
      icon: "🤖",
      title: "Agentic AI",
      sub: "Innovation Hub · Agent Factory",
      desc: "We build multi-agentic systems that work. Case studies across insurance, logistics, financial services, and healthcare — from discovery to production in 12 weeks.",
      href: "/ai",
    },
    {
      icon: "👥",
      title: "HR Transformation",
      sub: "Darwinbox · Workday · SAP",
      desc: "40+ years of combined HR leadership. Hire-to-retire across global enterprises on any HRMS platform.",
      href: "/hr",
    },
    {
      icon: "🌐",
      title: "Tech Staffing",
      sub: "US · India · Mexico",
      desc: "20+ recruiters. Cloud, AI/GenAI, Cybersecurity, and ServiceNow talent — contractors to direct hires.",
      href: "/staffing",
    },
  ];

  return (
    <section
      id="services"
      className="px-4 py-16 md:px-[60px] md:py-[100px]"
      style={{
        background: "#212121",
        backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      <FadeIn className="text-center mb-14">
        <div className="flex items-center justify-center gap-2 text-[11px] font-bold tracking-[3px] uppercase text-[#2196F3] mb-3">
          <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
          Core Capabilities
          <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
        </div>
        <h2 className="text-[26px] md:text-[36px] font-black text-white tracking-[-0.5px]">Four Practice Areas. One Integrated Partner.</h2>
      </FadeIn>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <FadeIn key={c.title} delay={i * 80}>
            <a
              href={c.href}
              className="bg-[#2a2a2a] rounded-xl p-9 flex flex-col border border-white/[0.06] hover:bg-[rgba(33,150,243,0.12)] hover:border-[rgba(33,150,243,0.3)] hover:border-t-[3px] hover:border-t-[#2196F3] transition-all no-underline group"
            >
              <div className="w-[46px] h-[46px] rounded-[10px] bg-[rgba(33,150,243,0.18)] flex items-center justify-center text-[22px] mb-5">
                {c.icon}
              </div>
              <h3 className="text-[17px] font-extrabold text-white mb-1.5">{c.title}</h3>
              <div className="text-[#2196F3] text-[11px] font-semibold tracking-[1px] uppercase mb-3">{c.sub}</div>
              <p className="text-white/45 text-[13px] leading-[1.7] flex-1">{c.desc}</p>
              <div className="mt-5 text-[#2196F3] text-[18px] font-bold">→</div>
            </a>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}

// ─── Delivery Model ───────────────────────────────────────────────────────────
function DeliveryModel() {
  return (
    <section className="bg-[#f8f9fa] px-4 py-16 md:px-[60px] md:py-[100px]">
      <FadeIn className="text-center mb-16">
        <div className="flex items-center justify-center gap-2 text-[11px] font-bold tracking-[3px] uppercase text-[#2196F3] mb-3">
          <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
          Delivery Excellence
          <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
        </div>
        <h2 className="text-[26px] md:text-[36px] font-black text-[#212121] tracking-[-0.5px]">Our Delivery Model</h2>
        <p className="text-[#555] text-[15px] mt-4 max-w-[560px] mx-auto leading-[1.75]">
          A structured and proven, four-phase process — built to reduce risk, accelerate go-live, and ensure adoption from day one.
        </p>
      </FadeIn>

      {/* Phase stepper */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-0 mb-12 relative">
        {/* connector line */}
        <div className="hidden md:block absolute top-[28px] left-[12.5%] right-[12.5%] h-0.5 bg-[#dde8f8] z-0" />
        {[
          {
            num: "01",
            phase: "Discovery",
            color: "#2196F3",
            duration: "Weeks 1–2",
            objective: "Understand the full landscape before a single configuration is touched.",
          },
          {
            num: "02",
            phase: "Development & Configuration",
            color: "#7c3aed",
            duration: "Weeks 3–8",
            objective: "Build and configure exactly what was agreed — nothing more, nothing less.",
          },
          {
            num: "03",
            phase: "Testing & Validation",
            color: "#059669",
            duration: "Weeks 9–10",
            objective: "Validate every component — with real data, real users, real scenarios.",
          },
          {
            num: "04",
            phase: "Deployment & Hypercare",
            color: "#ea580c",
            duration: "Weeks 11–12",
            objective: "Go live with confidence — and stay on-site until it's stable.",
          },
        ].map((p, i) => (
          <FadeIn key={p.phase} delay={i * 80}>
            <div className="flex flex-col items-center text-center px-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-white text-[13px] font-black mb-4 relative z-10 shadow-md"
                style={{ background: p.color }}
              >
                {p.num}
              </div>
              <div className="text-[11px] font-bold tracking-[2px] uppercase mb-1" style={{ color: p.color }}>{p.duration}</div>
              <h4 className="text-[15px] font-black text-[#212121] mb-2">{p.phase}</h4>
              <p className="text-[12px] text-[#777] leading-[1.6]">{p.objective}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </section>
  );
}

// ─── ServiceNow ───────────────────────────────────────────────────────────────
function ServiceNow() {
  return (
    <section id="servicenow" className="overflow-hidden bg-[#f8f9fa]">
      <div className="flex flex-col md:flex-row-reverse" style={{ minHeight: "560px" }}>
        {/* Right — Photo */}
        <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
          <img
            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80"
            alt="ServiceNow professionals collaborating"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-[#f8f9fa]/20" />
        </div>

        {/* Left — Content */}
        <FadeIn className="md:w-1/2 flex flex-col justify-center px-6 py-10 md:px-14 md:py-16">
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[3px] uppercase text-[#2196F3] mb-4">
            <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
            ServiceNow Practice
          </div>
          <h2 className="text-[26px] md:text-[34px] font-black text-[#212121] tracking-[-0.5px] leading-[1.2] mb-5">
            30+ Years of<br />ServiceNow Leadership
          </h2>
          <p className="text-[#555] text-[15px] leading-[1.8] mb-8">
            Full platform coverage from advisory to deployment — including Agentic AI, ITSM, HRSD, and more. Backed by GSI partnerships with Genpact and IBM for enterprise-grade delivery.
          </p>
          <div className="flex flex-col gap-4 mb-10">
            {[
              { label: "130+ Professionals", detail: "Across all ServiceNow modules" },
              { label: "75+ Certifications", detail: "Deep platform expertise" },
              { label: "40% faster resolution", detail: "Fortune 500 ITSM client outcome" },
            ].map((p) => (
              <div key={p.label} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#2196F3] mt-2 flex-shrink-0" />
                <div>
                  <span className="text-[#212121] text-[14px] font-bold">{p.label}</span>
                  <span className="text-[#888] text-[14px]"> — {p.detail}</span>
                </div>
              </div>
            ))}
          </div>
          <a
            href="/servicenow"
            className="inline-flex items-center gap-2 bg-[#2196F3] text-white text-[13px] font-bold px-6 py-3 rounded-lg hover:bg-[#1976D2] transition-colors self-start no-underline"
          >
            Explore ServiceNow →
          </a>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── HR Transformation ────────────────────────────────────────────────────────
function HRTransformation() {
  return (
    <section
      id="hr"
      className="overflow-hidden"
      style={{
        background: "#1a2030",
        backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      <div className="flex flex-col md:flex-row-reverse" style={{ minHeight: "560px" }}>
        {/* Right — Photo */}
        <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
          <img
            src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=900&q=80"
            alt="Diverse HR professionals in a collaborative meeting"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-[#1a2030]/30" />
        </div>

        {/* Left — Content */}
        <FadeIn className="md:w-1/2 flex flex-col justify-center px-6 py-10 md:px-14 md:py-16">
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[3px] uppercase text-[#2196F3] mb-4">
            <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
            HR Transformation
          </div>
          <h2 className="text-[26px] md:text-[34px] font-black text-white tracking-[-0.5px] leading-[1.2] mb-5">
            Hire-to-Retire,<br />Built for Global Scale
          </h2>
          <p className="text-white/60 text-[15px] leading-[1.8] mb-8">
            From HRMS implementation to full workforce transformation — on Darwinbox, Workday, SAP, and more. Led by practitioners who've run HR for the world's largest enterprises.
          </p>
          <div className="flex flex-col gap-4 mb-10">
            {[
              { label: "40+ Years Combined", detail: "HR leadership across Fortune 500 companies" },
              { label: "80,000+ Employees", detail: "Managed through Meta's global hire-to-retire" },
              { label: "US · India · UAE", detail: "Global delivery footprint" },
            ].map((p) => (
              <div key={p.label} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#2196F3] mt-2 flex-shrink-0" />
                <div>
                  <span className="text-white text-[14px] font-bold">{p.label}</span>
                  <span className="text-white/50 text-[14px]"> — {p.detail}</span>
                </div>
              </div>
            ))}
          </div>
          <a
            href="/hr"
            className="inline-flex items-center gap-2 bg-[#2196F3] text-white text-[13px] font-bold px-6 py-3 rounded-lg hover:bg-[#1976D2] transition-colors self-start no-underline"
          >
            Explore HR Services →
          </a>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Tech Staffing ────────────────────────────────────────────────────────────
function TechStaffing() {
  return (
    <section id="staffing" className="overflow-hidden bg-[#f8f9fa]">
      <div className="flex flex-col md:flex-row" style={{ minHeight: "560px" }}>
        {/* Left — Photo */}
        <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
          <img
            src="https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80"
            alt="Diverse technology professionals in a team meeting"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-[#f8f9fa]/10" />
        </div>

        {/* Right — Content */}
        <FadeIn className="md:w-1/2 flex flex-col justify-center px-6 py-10 md:px-14 md:py-16">
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[3px] uppercase text-[#2196F3] mb-4">
            <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
            Technology Staffing
          </div>
          <h2 className="text-[26px] md:text-[34px] font-black text-[#212121] tracking-[-0.5px] leading-[1.2] mb-5">
            Practitioner-Led Recruiting.<br />US, India &amp; Mexico.
          </h2>
          <p className="text-[#555] text-[15px] leading-[1.8] mb-8">
            We staff the roles we know — Cloud, AI/GenAI, Cybersecurity, and ServiceNow. No resume matching. Real domain expertise, fast placement, and a global talent bench.
          </p>
          <div className="flex flex-col gap-4 mb-10">
            {[
              { label: "20+ Recruiters", detail: "Specialized by technology and vertical" },
              { label: "18-Day Average", detail: "Time-to-fill for tech placements" },
              { label: "Cloud · AI · ServiceNow · Cyber", detail: "Core specializations" },
            ].map((p) => (
              <div key={p.label} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#2196F3] mt-2 flex-shrink-0" />
                <div>
                  <span className="text-[#212121] text-[14px] font-bold">{p.label}</span>
                  <span className="text-[#888] text-[14px]"> — {p.detail}</span>
                </div>
              </div>
            ))}
          </div>
          <a
            href="/staffing"
            className="inline-flex items-center gap-2 bg-[#2196F3] text-white text-[13px] font-bold px-6 py-3 rounded-lg hover:bg-[#1976D2] transition-colors self-start no-underline"
          >
            Find Talent →
          </a>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Agentic AI ───────────────────────────────────────────────────────────────
function AgenticAI() {
  return (
    <section
      id="ai"
      className="overflow-hidden"
      style={{
        background: "#212121",
        backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      <div className="flex flex-col md:flex-row" style={{ minHeight: "560px" }}>
        {/* Left — Photo */}
        <div className="relative md:w-1/2 h-[320px] md:h-auto flex-shrink-0">
          <img
            src="https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=80"
            alt="Diverse team collaborating on AI project"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-[#212121]/30" />
        </div>

        {/* Right — Content */}
        <FadeIn className="md:w-1/2 flex flex-col justify-center px-6 py-10 md:px-14 md:py-16">
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-[3px] uppercase text-[#2196F3] mb-4">
            <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
            AI Practice · Agent Factory
          </div>
          <h2 className="text-[26px] md:text-[34px] font-black text-white tracking-[-0.5px] leading-[1.2] mb-5">
            Agentic AI
          </h2>
          <p className="text-white/60 text-[15px] leading-[1.8] mb-8">
            We turn AI ambitions into working agents — fast. Our structured delivery model takes you from discovery to a production-ready autonomous system in 12 weeks, with measurable ROI at every stage.
          </p>
          <div className="flex flex-col gap-4 mb-10">
            {[
              { label: "12 Weeks", detail: "Discovery to production deployment" },
              { label: "Multi-Agent Design", detail: "Planning, decision logic, and feedback loops built in" },
              { label: "Proven Use Cases", detail: "Finance, HR, operations, customer service, and more" },
            ].map((p) => (
              <div key={p.label} className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#2196F3] mt-2 flex-shrink-0" />
                <div>
                  <span className="text-white text-[14px] font-bold">{p.label}</span>
                  <span className="text-white/50 text-[14px]"> — {p.detail}</span>
                </div>
              </div>
            ))}
          </div>
          <a
            href="/ai#use-cases"
            className="inline-flex items-center gap-2 bg-[#2196F3] text-white text-[13px] font-bold px-6 py-3 rounded-lg hover:bg-[#1976D2] transition-colors self-start no-underline"
          >
            Explore Use Cases →
          </a>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Team ─────────────────────────────────────────────────────────────────────
function Team() {
  const members = [
    { initial: "S", name: "Shajan T. Koshy", role: "CEO", bio: "Former Senior Partner at IBM Consulting. Led Global Payroll & HR at Meta across 50+ countries.", photo: "/team/shajan-koshy.jpg", linkedin: "https://www.linkedin.com/in/shajan-koshy-9a43272/" },
    { initial: "R", name: "Raghu Kottamasu", role: "COO", bio: "Ex-ADP, Goldman Sachs, Broadridge, and Unqork. Deep operational leadership.", photo: "/team/raghu-kottamasu.jpg", linkedin: "https://www.linkedin.com/in/raghukottamasu/" },
    { initial: "R", name: "Raj Palorkar", role: "CTO, ServiceNow Practice Lead", bio: "Ex-ServiceNow VP Apps Dev. IT Site Leader, ServiceNow India. 10+ years ecosystem experience.", photo: "/team/raj-palorkar.jpg", linkedin: "https://www.linkedin.com/in/rajendra-palorkar/" },
    { initial: "P", name: "Patrick Stonelake", role: "GTM & Solutions", bio: "Founder, Fruition Partners — first large ServiceNow integrator. 20+ years experience.", photo: "/team/patrick-stonelake.jpg", linkedin: "https://www.linkedin.com/in/stonelake/" },
    { initial: "S", name: "Safna Putnam", role: "HRIS Lead", bio: "Facebook/Meta Global Head of Hire-to-Retire for 80,000 employees across 50 countries.", photo: "/team/safna-puttnam.jpg", linkedin: "https://www.linkedin.com/in/safna-puttnam-1431629a/" },
    { initial: "V", name: "Vikas Joshi", role: "People Practice Lead", bio: "Ex-VP at PepsiCo & Viatris. Global Head of SuccessFactors across 170 countries.", photo: "/team/vikas-joshi.jpg", linkedin: "https://www.linkedin.com/in/vikasjoshihr/" },
    { initial: "W", name: "Walter Yosafat", role: "Advisory Chair", bio: "Former Global CIO at Capri Holdings, Wyndham Hotels, and Genpact.", photo: "/team/walter-yosafat.jpg", linkedin: "https://www.linkedin.com/in/walteryosafat/" },
  ];

  return (
    <section id="team" className="bg-[#f8f9fa] px-4 py-16 md:px-[60px] md:py-[100px]">
      <FadeIn className="text-center mb-14">
        <div className="flex items-center justify-center gap-2 text-[11px] font-bold tracking-[3px] uppercase text-[#2196F3] mb-3">
          <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
          Leadership
          <span className="w-6 h-0.5 bg-[#2196F3] inline-block" />
        </div>
        <h2 className="text-[26px] md:text-[36px] font-black text-[#212121] tracking-[-0.5px]">World-Class Expertise</h2>
      </FadeIn>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {members.map((m, i) => (
          <FadeIn key={m.name} delay={i * 60}>
            {m.linkedin ? (
              <a href={m.linkedin} target="_blank" rel="noopener noreferrer" className="block bg-white rounded-[10px] border border-[#dde8f8] px-[22px] py-7 shadow-sm hover:border-[#2196F3] hover:shadow-[0_4px_20px_rgba(33,150,243,0.1)] transition-all no-underline group">
                {m.photo ? (
                  <img src={m.photo} alt={m.name} className="w-20 h-20 rounded-xl object-cover object-top mb-4 border-2 border-[#dde8f8] group-hover:border-[#2196F3] transition-colors" />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-[#2196F3] text-white flex items-center justify-center text-[24px] font-black mb-4">{m.initial}</div>
                )}
                <h4 className="text-[14px] font-extrabold text-[#212121] mb-0.5">{m.name}</h4>
                <div className="text-[#2196F3] text-[10px] font-bold tracking-[1px] uppercase mb-2.5">{m.role}</div>
                <p className="text-[12px] text-[#555] leading-[1.6]">{m.bio}</p>
              </a>
            ) : (
              <div className="bg-white rounded-[10px] border border-[#dde8f8] px-[22px] py-7 shadow-sm hover:border-[#2196F3] hover:shadow-[0_4px_20px_rgba(33,150,243,0.1)] transition-all">
                <div className="w-20 h-20 rounded-xl bg-[#2196F3] text-white flex items-center justify-center text-[24px] font-black mb-4">{m.initial}</div>
                <h4 className="text-[14px] font-extrabold text-[#212121] mb-0.5">{m.name}</h4>
                <div className="text-[#2196F3] text-[10px] font-bold tracking-[1px] uppercase mb-2.5">{m.role}</div>
                <p className="text-[12px] text-[#555] leading-[1.6]">{m.bio}</p>
              </div>
            )}
          </FadeIn>
        ))}
      </div>
    </section>
  );
}

// ─── Global ───────────────────────────────────────────────────────────────────
function Global() {
  return (
    <section id="global" className="overflow-hidden bg-white">
      <div className="flex flex-col md:flex-row-reverse" style={{ minHeight: "540px" }}>
        {/* Right — Photo */}
        <div className="relative md:w-1/2 h-[360px] md:h-auto flex-shrink-0">
          <img
            src="/india-taj-mahal.jpg"
            alt="Taj Mahal, India"
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
        </div>

        {/* Left — Content */}
        <FadeIn className="md:w-1/2 flex flex-col justify-center px-6 py-10 md:px-14 md:py-16">
          <SectionLabel>Global Presence</SectionLabel>
          <h2 className="text-[26px] md:text-[36px] font-black text-[#212121] mb-5 tracking-[-0.5px]">
            Serving Clients<br />Across the Globe
          </h2>
          <p className="text-[#555] text-[15px] leading-[1.8] mb-9">
            Offices across the US, India, and Dubai. Servicing enterprise clients across North America, Middle East, Southeast Asia, and India.
          </p>
          <div className="flex flex-col gap-2.5 mb-8">
            {[
              { flag: "🇺🇸", city: "New Jersey", label: "Registered Office" },
              { flag: "🇮🇳", city: "Gurgaon + Hyderabad", label: "Registered & Regional Office" },
              { flag: "🇦🇪", city: "Dubai", label: "Registered Office" },
            ].map((o) => (
              <div key={o.city} className="flex items-center gap-4 px-[18px] py-3.5 rounded-lg bg-[#E3F2FD] border border-[#d0e8fb]">
                <span className="text-[22px]">{o.flag}</span>
                <div>
                  <h5 className="text-[14px] font-bold text-[#212121]">{o.city}</h5>
                  <span className="text-[11px] text-[#999]">{o.label}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="text-[10px] font-bold text-[#aaa] tracking-[2.5px] uppercase mb-3">Clients Include</div>
          <div className="flex flex-wrap gap-2">
            {["Ctrl S", "Emirates Retail", "Vedanta", "Tata AIG", "Lionbridge", "Boundless", "Datavolt", "Alliad"].map((c) => (
              <span key={c} className="bg-[#212121] text-white/65 text-[12px] font-medium px-3.5 py-1.5 rounded-md border border-white/[0.06]">{c}</span>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────────
function CTA() {
  return (
    <section id="cta" className="bg-[#2196F3] px-6 py-16 md:px-[60px] md:py-[100px] text-center">
      <FadeIn>
        <h2 className="text-[32px] md:text-[46px] font-black text-white mb-4 tracking-[-1px]">Start Your Transformation</h2>
        <p className="text-white/78 text-[17px] max-w-[500px] mx-auto mb-10 leading-[1.7]">
          Whether it&apos;s ServiceNow, Agentic AI, HR Tech, or staffing — let&apos;s build something that moves your business forward.
        </p>
        <a
          href="mailto:info@cloudbasesolutions.com"
          className="bg-white text-[#2196F3] text-[15px] font-extrabold px-10 py-4 rounded-md inline-block hover:opacity-90 transition-opacity no-underline"
        >
          Contact Us Today
        </a>
      </FadeIn>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-[#1a1a1a] px-4 py-5 md:px-[60px] md:py-7 flex flex-col md:flex-row items-center gap-3 md:justify-between border-t border-white/[0.05]">
      <div className="flex items-center gap-3">
        <LogoIcon size={32} />
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
export default function Home() {
  return (
    <>
      <Nav />
      <main className="overflow-x-hidden">
        <Hero />
        <ServicesStrip />
        <PartnersStrip />
        <About />
        <Services />
        <DeliveryModel />
        <ServiceNow />
        <AgenticAI />
        <HRTransformation />
        <TechStaffing />
        <Team />
        <Global />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
