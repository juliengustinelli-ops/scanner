import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "LionTree AI Tools",
  description: "AI-powered tools for LionTree investment bankers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen" style={{ background: "#0d0d0d", color: "white" }}>
        <Sidebar />
        <div className="ml-56 min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
