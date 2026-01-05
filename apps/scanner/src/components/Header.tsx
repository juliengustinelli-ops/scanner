import Link from "next/link";

export default function Header() {
  return (
    <header className="bg-gradient-to-r from-[#722f37] to-[#4a1c24] text-white">
      <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-3">
          <svg
            className="w-8 h-8 text-[#d4af37]"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M11 2v4H9v2h2v2H9v2h2v8H2v-6h4v-2H2v-2h9V8H9V6h2V2h2zm2 0v4h2v2h-2v2h2v2h-2v8h9v-6h-4v-2h4v-2h-9V8h2V6h-2V2h-2z" />
          </svg>
          <span className="text-xl font-normal text-[#d4af37]">
            Sacred Heart Parish
          </span>
        </Link>
        <nav className="flex gap-8">
          <Link
            href="/"
            className="text-[#e8d5b7] hover:text-[#d4af37] transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/collections"
            className="text-[#e8d5b7] hover:text-[#d4af37] transition-colors"
          >
            Collections
          </Link>
          <Link
            href="/donors"
            className="text-[#e8d5b7] hover:text-[#d4af37] transition-colors"
          >
            Donors
          </Link>
          <Link
            href="/scan"
            className="text-[#e8d5b7] hover:text-[#d4af37] transition-colors"
          >
            Scanner
          </Link>
        </nav>
      </div>
    </header>
  );
}
