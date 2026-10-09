import type { ReactNode } from 'react';
import './globals.css';

// Fonty z własnego serwera (public/fonts, @font-face w globals.css), jak w panelach — build nie
// pobiera ich z Google. next/font/google wywracał build w CI 09.10 (Turbopack: „next/font/google
// queries have exactly one entry” przy odpowiedzi Google dla Schibsted Grotesk).

export const metadata = {
  title: 'Verris — status usług',
  description: 'Aktualny stan usług Verris — dostępność z ostatnich 90 dni, czas odpowiedzi, zdarzenia i planowane prace.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
