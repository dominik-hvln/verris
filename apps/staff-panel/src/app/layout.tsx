import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verris Support",
  description: "Panel obsługi klienta (BOK)",
};

export const viewport: Viewport = {
  themeColor: "#0c1a14",
};

// PB-34 — obsługa: menu boczne ciemne, treść domyślnie jasna (makieta); wybór pracownika w localStorage.
const MOTYW = "try{if(localStorage.getItem('verris-staff-theme')!=='dark')document.documentElement.dataset.vtheme='light'}catch(e){document.documentElement.dataset.vtheme='light'}";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce z proxy (CSP bez 'unsafe-inline'); odczyt nagłówków renderuje każdą stronę dynamicznie.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="pl" className="dark" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: MOTYW }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
