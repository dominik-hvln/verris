import type { ReactNode } from 'react';
import { Hanken_Grotesk, JetBrains_Mono, Schibsted_Grotesk } from 'next/font/google';
import './globals.css';

// latin-ext: polskie znaki (ą ę ł ń ó ś ź ż) nie mieszczą się w podzbiorze latin.
// Opcje next/font muszą być literałami (bez spreadu i wspólnych stałych).
const display = Schibsted_Grotesk({ subsets: ['latin', 'latin-ext'], weight: ['600', '700', '800'], variable: '--font-display', display: 'swap' });
const text = Hanken_Grotesk({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600'], variable: '--font-text', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin', 'latin-ext'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

export const metadata = {
  title: 'Verris — status usług',
  description: 'Aktualny stan usług Verris — dostępność z ostatnich 90 dni, czas odpowiedzi, zdarzenia i planowane prace.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body className={`${display.variable} ${text.variable} ${mono.variable} min-h-screen antialiased`}>{children}</body>
    </html>
  );
}
