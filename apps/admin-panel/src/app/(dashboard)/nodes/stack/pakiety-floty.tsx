"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { potwierdz } from "@/components/potwierdz";
import { PRZYCISK } from "@/components/v2";
import { plForm } from "@/lib/pl";
import { pobierzPakietyFloty, wyslijPakietyNaFlote, type PakietyFloty, type WynikSyncuFloty } from "./actions";

/**
 * Plany z panelu = pakiety DA na każdym węźle. Po zmianie limitów planu admin świadomie wysyła pakiety
 * na flotę (decyzja 28.09: po potwierdzeniu). Wcześniej przycisk był na karcie jednego planu, choć wysyła
 * pakiety wszystkich planów (10.10 — operacje floty w jednym miejscu).
 */
export function PakietyFlotyPanel() {
  const [podglad, setPodglad] = useState<PakietyFloty | null>(null);
  const [wynik, setWynik] = useState<WynikSyncuFloty | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    void pobierzPakietyFloty().then((r) => (r.ok ? setPodglad(r.data) : setBlad(r.error)));
  }, []);

  const wezly = podglad?.wezly.length ?? 0;
  const konta = podglad?.konta ?? 0;

  const wyslij = async () => {
    const tresc = `Nadpisze pakiety wszystkich aktywnych planów na ${wezly} ${plForm(wezly, "węźle", "węzłach", "węzłach")}${
      konta > 0 ? ` i od razu zmieni limity ${konta} ${plForm(konta, "konta", "kont", "kont")}` : ""
    }.`;
    if (!(await potwierdz(tresc, { akcja: "Wyślij pakiety", niebezpieczne: true, tytul: "Pakiety na flocie" }))) return;
    setBlad(null);
    start(async () => {
      const r = await wyslijPakietyNaFlote();
      if (r.ok) setWynik(r.data);
      else setBlad(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {podglad ? (
        <p className="text-sm">
          {konta} {plForm(konta, "konto", "konta", "kont")} na {wezly} {plForm(wezly, "węźle", "węzłach", "węzłach")} z DirectAdminem.
        </p>
      ) : null}
      <div>
        <button type="button" className={PRZYCISK} disabled={pending || wezly === 0} onClick={() => void wyslij()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Wyślij pakiety
        </button>
      </div>
      {wynik ? (
        <ul className="space-y-1 text-xs">
          {wynik.wyniki.map((w) => (
            <li key={w.id} className={w.ok ? "text-data-hi" : "text-crit"}>
              {w.name}: {w.ok ? `zapisano (${(w.pakiety ?? []).join(", ")})` : w.blad}
            </li>
          ))}
        </ul>
      ) : null}
      {blad ? (
        <p className="text-sm text-crit" role="alert">
          {blad}
        </p>
      ) : null}
    </div>
  );
}
