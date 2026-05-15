import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verris Core",
  description: "Panel administracyjny Verris",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className="dark">
      <body className="antialiased bg-[#0B0D17] text-white min-h-screen selection:bg-indigo-500/30">
        {children}
      </body>
    </html>
  );
}
