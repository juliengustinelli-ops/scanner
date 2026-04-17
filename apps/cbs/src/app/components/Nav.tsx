"use client";

import { useState } from "react";
import Link from "next/link";

function LogoIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      {/* Three stacked parallelogram bars — ascending, enterprise stack */}
      <path d="M2 36 L22 36 L26 28 L6 28 Z" fill="#2196F3" opacity="0.32" />
      <path d="M7 26 L27 26 L31 18 L11 18 Z" fill="#2196F3" opacity="0.62" />
      <path d="M12 16 L32 16 L36 8 L16 8 Z" fill="#2196F3" />
    </svg>
  );
}

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const links = [
    { label: "ServiceNow", href: "/servicenow" },
    { label: "Agentic AI", href: "/ai" },
    { label: "HR Transformation", href: "/hr" },
    { label: "Tech Staffing", href: "/staffing" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-10 py-[18px] bg-[rgba(33,33,33,0.97)] border-b border-white/[0.06] backdrop-blur-md">
      <Link href="/" className="flex items-center gap-3 no-underline">
        <LogoIcon />
        <div className="leading-tight">
          <div className="text-[17px] font-black text-white tracking-[0.3px] leading-[1.1]">CLOUD BASE</div>
          <div className="text-[10px] font-semibold text-white/45 tracking-[4px] uppercase mt-[3px]">SOLUTIONS</div>
        </div>
      </Link>

      {/* Desktop Links */}
      <div className="hidden md:flex items-center gap-8">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-white/88 hover:text-white text-[15px] font-semibold transition-colors no-underline"
          >
            {l.label}
          </Link>
        ))}

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
                  { label: "Company", href: "/#about" },
                  { label: "Team", href: "/#team" },
                ].map((item, i, arr) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setAboutOpen(false)}
                    className={`block px-[18px] py-[11px] text-white/80 hover:text-white hover:bg-[rgba(33,150,243,0.15)] text-[14px] font-medium no-underline transition-colors ${i < arr.length - 1 ? "border-b border-white/[0.06]" : ""}`}
                  >
                    {item.label}
                  </Link>
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

      {menuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-[#1a1a1a] px-6 pt-4 pb-4 flex flex-col gap-3 border-t border-white/[0.06]">
          {[...links, { label: "Company", href: "/#about" }, { label: "Team", href: "/#team" }].map((l) => (
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
