"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MAKS_DLUGOSC_UWAGI_BETA, SCENARIUSZE_BETA, policzPostepBeta, type PostepBetaDto } from "@verris/contracts";
import { Checkbox } from "@/components/panel/checkbox";
import { Meter } from "@/components/panel/v2";
import { plForm } from "@/lib/pl";
import { ustawKrokBetaAction, ustawUwageBetaAction } from "./beta-actions";
import { nastepnyScenariusz, postepScenariusza, zastosujKrok } from "./postep-beta";

/** Ile czekamy od ostatniego naciśnięcia klawisza, zanim zapiszemy uwagę. */
export const ODSTEP_ZAPISU_UWAGI_MS = 1200;

type StanUwagi = "zapisywanie" | "zapisano" | "blad";

function godzina(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * PB-26 — lista scenariuszy testów. Odhaczenie zapisuje się od razu (widok nie czeka na API; błąd cofa ptaszek),
 * uwagi — po chwili bez pisania albo po wyjściu z pola. Postęp widzi zespół Verris w panelu admina.
 */
export function ListaTestowBeta({ poczatkowy }: { poczatkowy: PostepBetaDto }) {
  const [postep, setPostep] = useState(poczatkowy);
  const [szkice, setSzkice] = useState<Record<string, string>>(poczatkowy.uwagi);
  const [stanUwag, setStanUwag] = useState<Record<string, StanUwagi>>({});
  const zapisane = useRef<Record<string, string>>({ ...poczatkowy.uwagi });
  const timery = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const numerKroku = useRef(0);

  useEffect(() => {
    const t = timery.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const przelacz = async (krokId: string, zrobione: boolean) => {
    const nr = ++numerKroku.current;
    setPostep((p) => zastosujKrok(p, krokId, zrobione));
    const w = await ustawKrokBetaAction(krokId, zrobione);
    if (!w.ok) {
      setPostep((p) => zastosujKrok(p, krokId, !zrobione));
      toast.error(w.blad);
      return;
    }
    // Starsza odpowiedź nie nadpisuje nowszych kliknięć.
    if (nr === numerKroku.current) setPostep((p) => ({ ...p, kroki: w.postep.kroki, zaktualizowano: w.postep.zaktualizowano }));
  };

  const zapiszUwage = useCallback(async (id: string, tekst: string) => {
    clearTimeout(timery.current[id]);
    if ((zapisane.current[id] ?? "") === tekst.trim()) return;
    setStanUwag((s) => ({ ...s, [id]: "zapisywanie" }));
    const w = await ustawUwageBetaAction(id, tekst);
    if (!w.ok) {
      setStanUwag((s) => ({ ...s, [id]: "blad" }));
      toast.error(w.blad);
      return;
    }
    zapisane.current[id] = w.postep.uwagi[id] ?? "";
    setStanUwag((s) => ({ ...s, [id]: "zapisano" }));
    setPostep((p) => ({ ...p, uwagi: w.postep.uwagi, zaktualizowano: w.postep.zaktualizowano }));
  }, []);

  const pisz = (id: string, tekst: string) => {
    setSzkice((s) => ({ ...s, [id]: tekst }));
    clearTimeout(timery.current[id]);
    timery.current[id] = setTimeout(() => void zapiszUwage(id, tekst), ODSTEP_ZAPISU_UWAGI_MS);
  };

  const { zrobione, wszystkie } = policzPostepBeta(postep.kroki);
  const pct = wszystkie ? Math.round((zrobione / wszystkie) * 100) : 0;
  const dalej = nastepnyScenariusz(postep.kroki);
  const ostatnio = godzina(postep.zaktualizowano);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-[10px] border border-line bg-card px-5 py-4" aria-label="Twój postęp">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-display text-[26px] font-bold leading-none text-foreground" data-postep-beta>
              {zrobione} <span className="text-[15px] font-semibold text-muted-foreground">z {wszystkie} {plForm(wszystkie, "kroku", "kroków", "kroków")}</span>
            </div>
            <p className="mt-1.5 text-[13.5px] text-muted-foreground">
              {zrobione === wszystkie
                ? "Wszystko odhaczone — dziękujemy! Uwagi możesz dopisywać do końca testów."
                : ostatnio
                  ? `Ostatni zapis: ${ostatnio}. Zapisujemy na bieżąco, możesz wrócić w dowolnej chwili.`
                  : "Zapisujemy na bieżąco, możesz przerwać i wrócić w dowolnej chwili."}
            </p>
          </div>
          {dalej ? (
            <a href={`#${dalej.id}`} className="inline-flex min-h-[40px] items-center rounded-md border border-line-strong px-3.5 text-sm font-semibold text-foreground hover:bg-raised">
              Kontynuuj: {dalej.tytul}
            </a>
          ) : null}
        </div>
        <Meter pct={pct} />
      </section>

      {SCENARIUSZE_BETA.map((s, i) => {
        const ps = postepScenariusza(s, postep.kroki);
        const stan = stanUwag[s.id];
        const szkic = szkice[s.id] ?? "";
        return (
          <section key={s.id} id={s.id} className="scroll-mt-24 border-t border-line pt-6" aria-labelledby={`${s.id}-tytul`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[12px] text-data">{String(i + 1).padStart(2, "0")}</span>
              <h2 id={`${s.id}-tytul`} className="m-0 font-display text-[18px] font-bold leading-tight text-foreground">{s.tytul}</h2>
              <span className="font-mono text-[11.5px] text-muted-foreground">{s.czas}</span>
              <span className={ps.gotowy ? "ml-auto text-[12.5px] font-semibold text-data-hi" : "ml-auto text-[12.5px] text-muted-foreground"}>
                {ps.zrobione}/{ps.wszystkie}
              </span>
            </div>
            <p className="mt-1.5 max-w-[70ch] text-pretty text-[14px] text-muted-foreground">{s.cel}</p>

            <ul className="mt-3 flex flex-col">
              {s.kroki.map((k) => {
                const jest = Boolean(postep.kroki[k.id]);
                return (
                  <li key={k.id} className="border-b border-line/60 last:border-b-0">
                    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2.5 text-[14.5px]">
                      <Checkbox className="mt-0.5 h-[18px] w-[18px]" checked={jest} data-krok={k.id} onChange={(e) => void przelacz(k.id, e.target.checked)} />
                      <span className={jest ? "text-muted-foreground line-through decoration-line-strong" : "text-foreground"}>{k.tekst}</span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Zaliczone, gdy</div>
              <ul className="mt-1.5 space-y-1 text-[13.5px] text-foreground/90">
                {s.weryfikacja.map((w) => (
                  <li key={w} className="flex gap-2"><span className="text-data" aria-hidden>→</span><span>{w}</span></li>
                ))}
              </ul>
            </div>

            {s.uwagi.length ? (
              <div className="mt-3">
                <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Na co zwrócić uwagę</div>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13.5px] text-muted-foreground marker:text-line-strong">
                  {s.uwagi.map((u) => <li key={u}>{u}</li>)}
                </ul>
              </div>
            ) : null}

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`${s.id}-uwaga`} className="text-[13px] font-semibold text-foreground">Twoje uwagi</label>
                <span className="text-[12px] text-muted-foreground" aria-live="polite">
                  {stan === "zapisywanie" ? "Zapisywanie…" : stan === "zapisano" ? "Zapisano" : stan === "blad" ? "Nie zapisano — spróbuj jeszcze raz" : ""}
                </span>
              </div>
              <textarea
                id={`${s.id}-uwaga`}
                data-uwaga={s.id}
                rows={3}
                maxLength={MAKS_DLUGOSC_UWAGI_BETA}
                value={szkic}
                onChange={(e) => pisz(s.id, e.target.value)}
                onBlur={(e) => void zapiszUwage(s.id, e.target.value)}
                placeholder="Co działało, co nie, co Cię zaskoczyło. Błąd z konkretnego ekranu najlepiej od razu „Zgłoś uwagę” (dołącza zrzut)."
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
