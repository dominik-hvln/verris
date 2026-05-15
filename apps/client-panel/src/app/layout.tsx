import { Toaster } from "sonner";
import "./globals.css";
import { Inter } from "next/font/google";
import { ReactNode } from "react";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Verris - Menadżer Hostingu",
  description: "Zarządzaj swoim hostingiem i serwerami łatwiej niż kiedykolwiek.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className="dark" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-background antialiased text-foreground`}>
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
