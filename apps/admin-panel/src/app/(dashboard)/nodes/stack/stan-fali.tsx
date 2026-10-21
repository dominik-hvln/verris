"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { pobierzStanFali, type StanFali } from "./actions";

const STAN: Record<StanFali["stan"], { tekst: string; klasa: string }> = {
  trwa: { tekst: "Trwa", klasa: "text-amber-300" },
  zakonczona: { tekst: "Zakończona", klasa: "text-emerald-300" },
  zatrzymana: { tekst: "Zatrzymana na błędzie", klasa: "text-rose-300" },
  przerwana: { tekst: "Przerwana — nie zlecono kolejnego węzła", klasa: "text-rose-300" },
};

const ZADANIE: Record<StanFali["wezly"][number]["status"], string> = {
  QUEUED: "w kolejce",
  RUNNING: "w toku",
  COMPLETED: "zakończone",
  FAILED: "błąd",
  CANCELLED: "anulowane",
};

const WYNIK: Record<NonNullable<StanFali["wezly"][number]["wynik"]>, string> = {
  ok: "OK",
  "needs-reboot": "OK, wymaga restartu",
  failed: "błąd aktualizacji",
};

const czas = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" }) : "—";

/**
 * PB-32 — „status w panelu zgodny z logiem”: przebieg ostatniej fali po węzłach (kanarek pierwszy), stan zadania
 * i wynik z logu skryptu. Odświeża się sam co 15 s, dopóki fala trwa.
 */
export function StanFaliPanel() {
  const [stan, setStan] = useState<StanFali | null | undefined>(undefined);
  const [blad, setBlad] = useState<string | null>(null);

  const zastosuj = useCallback((w: Awaited<ReturnType<typeof pobierzStanFali>>) => {
    if (w.ok) {
      setStan(w.data);
      setBlad(null);
    } else setBlad(w.error);
  }, []);
  const odswiez = useCallback(() => pobierzStanFali().then(zastosuj), [zastosuj]);

  useEffect(() => {
    let aktywny = true;
    void pobierzStanFali().then((w) => aktywny && zastosuj(w));
    return () => {
      aktywny = false;
    };
  }, [zastosuj]);

  useEffect(() => {
    if (stan?.stan !== "trwa") return;
    const t = setInterval(() => void odswiez(), 15_000);
    return () => clearInterval(t);
  }, [stan?.stan, odswiez]);

  if (blad) return <p className="text-xs text-rose-300">Stan fali: {blad}</p>;
  if (stan === undefined) return <p className="text-xs text-muted-foreground">Wczytywanie stanu fali…</p>;
  if (stan === null) return <p className="text-xs text-muted-foreground">Nie było jeszcze fali aktualizacji.</p>;

  const s = STAN[stan.stan];
  return (
    <div className="flex flex-col gap-2" data-fala={stan.stan}>
      <p className="text-sm">
        Ostatnia fala
        {stan.wyrownaj ? " (wyrównanie do manifestu)" : ""}
        {stan.tryb === "bezpieczenstwo" ? ` (poprawki bezpieczeństwa${stan.cve?.length ? `: ${stan.cve.join(", ")}` : ""})` : ""} z {czas(stan.rozpoczeta)}:{" "}
        <span className={`font-semibold ${s.klasa}`}>{s.tekst}</span>
        {stan.pozostale > 0 ? ` · pozostało węzłów: ${stan.pozostale} z ${stan.razem}` : ` · węzłów: ${stan.razem}`}
        <button type="button" onClick={() => void odswiez()} className="ml-3 text-xs underline text-muted-foreground hover:text-foreground">
          Odśwież
        </button>
      </p>
      {stan.wymagaRestartu.length ? (
        <p className="text-xs text-amber-300">Wymaga restartu: {stan.wymagaRestartu.join(", ")} — zaplanuj restart w oknie serwisowym.</p>
      ) : null}
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-medium">#</th>
            <th className="py-1 pr-3 font-medium">Węzeł</th>
            <th className="py-1 pr-3 font-medium">Zadanie</th>
            <th className="py-1 pr-3 font-medium">Wynik z logu</th>
            <th className="py-1 pr-3 font-medium">Koniec</th>
          </tr>
        </thead>
        <tbody>
          {stan.wezly.map((w) => (
            <tr key={w.taskId} className="border-t border-line">
              <td className="py-1 pr-3">{w.nr > 1 ? w.nr : "1 (kanarek)"}</td>
              <td className="py-1 pr-3">
                <Link href={`/nodes/${w.serverId}`} className="underline">
                  {w.nazwa}
                </Link>
              </td>
              <td className="py-1 pr-3">{ZADANIE[w.status]}</td>
              <td className="py-1 pr-3">
                {w.wynik ? WYNIK[w.wynik] : "—"}
                {w.blad ? <span className="block text-rose-300">{w.blad}</span> : null}
              </td>
              <td className="py-1 pr-3">{czas(w.koniec)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
