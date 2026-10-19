"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { SCENARIUSZE_BETA } from "@verris/contracts";
import type { TesterRow } from "./actions";

/** Co ile odświeżamy listę testerów, gdy karta jest widoczna. */
export const ODSWIEZANIE_BETA_MS = 15_000;
const KOLUMNY = 8;

const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "short", timeZone: "Europe/Warsaw" }) : "—";
const kiedy = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" })
    : null;

const STAN: Record<TesterRow["stan"], { text: string; cls: string }> = {
  CZEKA: { text: "czeka na użycie", cls: "border-white/15 text-neutral-300" },
  UZYTY: { text: "kod użyty", cls: "border-emerald-400/30 text-emerald-200" },
  WYCOFANY: { text: "wyłączony", cls: "border-rose-500/30 text-rose-200" },
  WYGASL: { text: "wygasł", cls: "border-amber-500/30 text-amber-200" },
};

/** Postęp testerów na żywo: lista odświeża się sama, gdy karta jest na wierzchu. */
export function OdswiezanieNaZywo() {
  const router = useRouter();
  const [ostatnio, setOstatnio] = useState<string | null>(null);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setOstatnio(new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Warsaw" }));
    }, ODSWIEZANIE_BETA_MS);
    return () => clearInterval(t);
  }, [router]);
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
      Postęp na żywo — odświeżanie co {ODSWIEZANIE_BETA_MS / 1000} s{ostatnio ? ` · ostatnio ${ostatnio}` : ""}
    </span>
  );
}

/** Scenariusze testera: ile kroków odhaczył w każdym i jego uwagi. */
export function szczegolyPostepu(p: NonNullable<TesterRow["postep"]>) {
  return SCENARIUSZE_BETA.map((s) => ({
    id: s.id,
    tytul: s.tytul,
    zrobione: s.kroki.filter((k) => p.kroki[k.id]).length,
    wszystkie: s.kroki.length,
    uwaga: p.uwagi[s.id] ?? null,
  }));
}

/** Wiersz testera z kolumną „Postęp” i rozwijanymi szczegółami pod spodem. */
export function WierszTestera({ r, akcja }: { r: TesterRow; akcja?: ReactNode }) {
  const [otwarte, setOtwarte] = useState(false);
  const p = r.postep;
  const pct = p?.wszystkie ? Math.round((p.zrobione / p.wszystkie) * 100) : 0;
  const uwag = p ? Object.keys(p.uwagi).length : 0;
  return (
    <Fragment>
      <tr>
        <td className="px-4 py-3">
          <div className="font-medium">{r.name || r.email}</div>
          {r.name ? <div className="text-xs text-muted-foreground">{r.email}</div> : null}
          <div className="text-xs text-muted-foreground">{r.wyslane ? `mail ${data(r.wyslane)}` : "mail niewysłany"}</div>
        </td>
        <td className="px-4 py-3 font-mono text-xs">
          {r.code}
          <div className="text-muted-foreground">do {data(r.waznyDo)}</div>
        </td>
        <td className="px-4 py-3">
          <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STAN[r.stan].cls}`}>{STAN[r.stan].text}</span>
        </td>
        <td className="px-4 py-3 text-xs">{r.konto ? `${r.konto.email} · od ${data(r.konto.od)}` : "—"}</td>
        <td className="px-4 py-3">
          {p ? (
            <button
              type="button"
              onClick={() => setOtwarte((o) => !o)}
              aria-expanded={otwarte}
              data-postep-testera={r.id}
              className="flex w-full min-w-[160px] flex-col gap-1.5 text-left"
            >
              <span className="flex items-center justify-between gap-2">
                <span>
                  {p.zrobione}/{p.wszystkie}
                  {uwag ? <span className="text-xs text-muted-foreground"> · uwagi: {uwag}</span> : null}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${otwarte ? "rotate-180" : ""}`} aria-hidden />
              </span>
              <span className="block h-1 w-full overflow-hidden rounded bg-white/10">
                <span className="block h-full bg-emerald-400" style={{ width: `${pct}%` }} />
              </span>
              <span className="text-xs text-muted-foreground">{kiedy(p.zaktualizowano) ?? "jeszcze nic nie odhaczył(a)"}</span>
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-4 py-3">{r.aktywneUslugi}</td>
        <td className="px-4 py-3">
          {r.zgloszenia}
          {r.zgloszeniaOtwarte ? <span className="text-xs text-amber-200"> ({r.zgloszeniaOtwarte} otwarte)</span> : null}
        </td>
        <td className="px-4 py-3 text-right">{akcja}</td>
      </tr>
      {otwarte && p ? (
        <tr className="bg-white/[0.02]">
          <td colSpan={KOLUMNY} className="px-4 pb-4 pt-1">
            <ul className="grid gap-x-8 gap-y-2 md:grid-cols-2" data-szczegoly-testera={r.id}>
              {szczegolyPostepu(p).map((s) => (
                <li key={s.id} className="border-b border-white/5 py-1.5 text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={s.zrobione === s.wszystkie ? "text-emerald-200" : "text-neutral-200"}>{s.tytul}</span>
                    <span className="font-mono text-muted-foreground">{s.zrobione}/{s.wszystkie}</span>
                  </div>
                  {s.uwaga ? <p className="mt-1 whitespace-pre-wrap text-neutral-300">„{s.uwaga}”</p> : null}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
