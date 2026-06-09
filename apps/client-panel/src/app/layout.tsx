import { Toaster } from "sonner";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { hanken, jetbrains, schibsted } from "./fonts";

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
      className={`dark ${schibsted.variable} ${hanken.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background antialiased text-foreground">
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
