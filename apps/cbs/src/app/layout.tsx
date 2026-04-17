import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cloud Base Solutions | Enabling Breakthrough Business Growth",
  description:
    "Cloud-centric digital transformation and AI consulting. ServiceNow, HR Tech, Agentic AI, and Technology Staffing.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
