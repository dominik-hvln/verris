"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Play, RefreshCw, XCircle } from "lucide-react";
import { potwierdz } from "@/components/potwierdz";
import { pobierzOffsite } from "@/components/kopie-offsite-actions";
import { pobierzStanOnboardu, uruchomOnboard, type StanOnboardu } from "./onboard-actions";

const przycisk =
  "inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50";

const STATUS: Record<string, string> = { QUEUED: "w kolejce", RUNNING: "trwa", COMPLETED: "zakończone", FAILED: "błąd", CANCELLED: "anulowane" };

/**
 * PB-31 — krok 5: Onboard LIVE z panelu. Agent pobiera pakiet, sam bierze klucz admina DA
 * (`da api-url`) i konfigurację kopii, a raport gotowości decyduje o przydziale kont.
 */
export function OnboardLivePanel({ serverId }: { serverId: string }) {
  const [stan, setStan] = useState<StanOnboardu | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  // false — kopie offsite nieskonfigurowane (Onboard LIVE się zatrzyma). Operator bez roli admina dostaje
  // 403 na podgląd konfiguracji — wtedy nic nie pokazujemy.
  const [offsite, setOffsite] = useState<boolean | null>(null);
  const [pending, start] = useTransition();

  const odswiez = useCallback(async () => {
    const r = await pobierzStanOnboardu(serverId);
    if (r.ok) setStan(r.data);
    else setBlad(r.error);
  }, [serverId]);

  useEffect(() => {
    void pobierzStanOnboardu(serverId).then((r) => (r.ok ? setStan(r.data) : setBlad(r.error)));
    void pobierzOffsite().then((r) => (r.ok ? setOffsite(r.data.skonfigurowany) : null));
  }, [serverId]);

  useEffect(() => {
    if (!stan?.trwa) return;
    const t = setInterval(() => void odswiez(), 10_000);
    return () => clearInterval(t);
  }, [stan?.trwa, odswiez]);

  // Okno potwierdzenia PRZED transition (React 19: okno otwarte w środku async transition się nie pokazuje).
  const uruchom = async () => {
    setBlad(null);
    const ok = await potwierdz("Agent wgra na węzeł aktualne skrypty i zabezpieczenia. Trwa kilkanaście minut.", {
      tytul: "Uruchomić Onboard LIVE?",
      akcja: "Uruchom",
    });
    if (!ok) return;
    start(async () => {
      const r = await uruchomOnboard(serverId);
      if (!r.ok) setBlad(r.error);
      await odswiez();
    });
  };

  const raport = stan?.raport;
  return (
    <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={przycisk} disabled={pending || stan?.trwa} onClick={() => void uruchom()}>
          {pending || stan?.trwa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {stan?.trwa ? "Onboard trwa…" : "Uruchom Onboard LIVE z panelu"}
        </button>
        <button type="button" className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-white" onClick={() => void odswiez()}>
          <RefreshCw className="h-3.5 w-3.5" /> Odśwież
        </button>
      </div>
      {offsite === false ? (
        <p className="text-sm text-amber-200" role="status">
          Brak konfiguracji kopii offsite — Onboard LIVE się na niej zatrzyma.{" "}
          <Link href="/settings/kopie-offsite" className="font-semibold underline underline-offset-2">
            Ustaw kopie offsite →
          </Link>
        </p>
      ) : null}
      <p className="text-xs text-zinc-400">
        Agent na węźle pobiera pakiet onboardu do /opt/verris, bierze tymczasowy klucz admina DirectAdmina
        (<code>da api-url</code>) i konfigurację kopii offsite. Trwa kilkanaście minut (profil hostingu).
      </p>
      {stan?.zadanie ? (
        <p className="text-sm text-white">
          Ostatnie zadanie: <strong>{STATUS[stan.zadanie.status] ?? stan.zadanie.status}</strong>{" "}
          <span className="text-zinc-400">({new Date(stan.zadanie.createdAt).toLocaleString("pl-PL")})</span>
          {stan.zadanie.errorMessage ? <span className="block text-xs text-rose-300">{stan.zadanie.errorMessage}</span> : null}
        </p>
      ) : null}
      {stan ? (
        <p className="flex items-center gap-2 text-sm">
          {stan.zweryfikowany ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <XCircle className="h-4 w-4 text-amber-300" />}
          {stan.zweryfikowany
            ? `Węzeł zweryfikowany ${new Date(stan.zweryfikowany).toLocaleString("pl-PL")} — ${stan.noweKonta === false ? "nowe konta wstrzymane (poza pulą)." : "przyjmuje nowe konta."}`
            : "Węzeł nie jest zweryfikowany — nie dostaje nowych kont."}
        </p>
      ) : null}
      {raport?.podsumowanie ? (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/60 p-3 text-xs text-zinc-200">{raport.podsumowanie}</pre>
      ) : null}
      {blad ? <p className="text-sm text-rose-300" role="alert">{blad}</p> : null}
    </div>
  );
}
