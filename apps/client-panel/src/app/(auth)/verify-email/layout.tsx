import type { Metadata } from "next";
import type { ReactNode } from "react";

// WCAG 2.4.2: każda strona logowania ma własny, opisowy tytuł (strony są komponentami klienta — metadata tylko tu).
export const metadata: Metadata = { title: "Potwierdzenie e-mail — Verris" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
