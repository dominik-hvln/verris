"use client";

import { Printer } from "lucide-react";

/** Wydruk dokumentu (także „Zapisz jako PDF” w oknie drukowania) — styl wydruku w globals.css (.legal-doc). */
export function PrintButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      <Printer aria-hidden className="h-4 w-4" />
      Drukuj lub zapisz PDF
    </button>
  );
}
