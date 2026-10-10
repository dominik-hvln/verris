"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { potwierdz } from "@/components/potwierdz";
import { PRZYCISK } from "@/components/v2";
import { uruchomZadanie } from "./actions";

export function UruchomZadanie({ klucz, nazwa }: { klucz: string; nazwa: string }) {
  const router = useRouter();
  const [trwa, start] = useTransition();
  const klik = async () => {
    if (!(await potwierdz(`Uruchomić teraz „${nazwa}”? Zadanie biegnie w tle, wynik pojawi się na liście.`, { akcja: "Uruchom" }))) return;
    start(async () => {
      const r = await uruchomZadanie(klucz);
      if (!r.ok) await potwierdz(r.error, { akcja: "OK", tytul: "Nie udało się" });
      router.refresh();
    });
  };
  return (
    <button type="button" onClick={() => void klik()} disabled={trwa} className={`${PRZYCISK} !text-xs`}>
      {trwa ? "Uruchamiam…" : "Uruchom teraz"}
    </button>
  );
}
