import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EkoHost Support",
  description: "Panel obsługi klienta (BOK)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className="dark">
      <body className="antialiased bg-[#070b14] text-white min-h-screen selection:bg-cyan-500/30">{children}</body>
    </html>
  );
}
