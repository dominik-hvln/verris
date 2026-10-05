"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/select";

/** Sortowanie kart węzłów — adresy liczy strona (parametr `sort`), tu tylko przejście. */
export function Sortowanie({ wartosc, opcje }: { wartosc: string; opcje: { value: string; label: string; href: string }[] }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2.5">
      <label htmlFor="sort-wezlow" className="text-[13px] text-muted-foreground">
        Sortuj
      </label>
      <Select
        id="sort-wezlow"
        value={wartosc}
        options={opcje}
        onChange={(v) => router.push(opcje.find((o) => o.value === v)!.href, { scroll: false })}
        className="h-[38px] rounded-lg border border-line-strong bg-card px-3 text-[13.5px] font-medium text-foreground"
      />
    </div>
  );
}
