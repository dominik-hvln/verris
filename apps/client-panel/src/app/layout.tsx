import { Toaster } from "sonner";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AnalyticsScripts } from "@/components/analytics-scripts";
import { CookieConsentManager } from "@/components/cookie-consent";

export const metadata: Metadata = {
  title: "Verris — Panel klienta",
  description: "Hosting, który liczy realne zużycie.",
};

export const viewport: Viewport = {
  themeColor: "#091410",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pl"
      className="dark"
      suppressHydrationWarning
    >
      <head>
        {/* Motyw jasny/ciemny treści panelu — przed malowaniem, bez mignięcia. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(localStorage.getItem('verris-theme')==='light')document.documentElement.dataset.vtheme='light'}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-screen bg-background antialiased text-foreground">
        {/* WCAG 2.4.1 — skip link: pierwszy element fokusowalny na stronie. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black"
        >
          Przejdź do treści
        </a>
        <AnalyticsScripts />
        {children}
        <CookieConsentManager />
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
