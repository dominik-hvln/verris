import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'EkoHost — Status systemu',
  description: 'Aktualny status serwerów EkoHost — uptime, incydenty, czasy odpowiedzi.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen antialiased`}>{children}</body>
    </html>
  );
}
