"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Pomoc } from "@/components/pomoc";
import { ZASOBY, sumaFaultow, stanRaportu, type Faulty } from "@/components/faulty-limitow";
import { brakUprawnienia, type DostepDoAkcji } from "@/lib/akcje/wezel";
import { zasobyKontaAction, type Wynik, type ZasobyKonta } from "./zasoby-konta-actions";

/**
 * F2.6 — „Zasoby i diagnoza 508” w zakładce „Konto” karty usługi (ACCOUNT_DIAGNOSTICS_VIEW, L2+): faulty limitów konta
 * w dobie i w 7 dni z limitem obok, inody, błędy 5xx strony i wolne zapytania SQL w jednym miejscu. „Wczytaj z serwera”
 * zleca świeży odczyt SQL i 5xx (tylko czyta logi); faulty przysyła agent węzła co ~10 min.
 */
const ODSWIEZANIE_MS = 5000;
const liczba = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pl-PL"));
const kiedy = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pl-PL") : "—");
const TON = { ok: "text-muted-foreground", warn: "text-amber-200", crit: "text-rose-200" } as const;
// Czas odczytu (klient) — reguła purity nie przepuszcza Date.now() w ciele komponentu.
const chwila = () => Date.now();

function limitZasobu(klucz: keyof Faulty, l: ZasobyKonta["limity"]): string {
  switch (klucz) {
    case "cpu":
      return `${liczba(l.cpuProcent)}% rdzenia`;
    case "ep":
      return liczba(l.ep);
    case "nproc":
      return liczba(l.nproc);
    case "pmem":
      return `${liczba(l.ramMb)} MB`;
    case "io":
      return `${liczba(l.ioKbps)} KB/s`;
    case "iops":
      return liczba(l.iops);
  }
}

/** Jedno zdanie diagnozy: które limity odcinały stronę w ostatniej dobie (albo w tygodniu). */
function diagnoza(d: ZasobyKonta): string | null {
  const f = d.faulty;
  if (!f.doba && !f.tydzien) return null;
  const doba = ZASOBY.filter((z) => (f.doba?.[z.klucz] ?? 0) > 0);
  if (doba.length) return `W ostatniej dobie konto odbijało się od limitu: ${doba.map((z) => `${z.nazwa} — ${z.skutek}`).join("; ")}.`;
  const tydzien = ZASOBY.filter((z) => (f.tydzien?.[z.klucz] ?? 0) > 0);
  if (tydzien.length) return `W dobie bez przekroczeń; w 7 dni: ${tydzien.map((z) => z.nazwa).join(", ")}.`;
  // Brak okna (węzeł go nie podał albo raport ucięty bez tego konta) to nie „zero” — nie twierdzimy, że było czysto.
  if (!f.doba || !f.tydzien) return f.doba ? "W dobie bez przekroczeń; 7 dni — brak danych z węzła." : "Doba — brak danych z węzła.";
  return "Bez przekroczeń limitów w 7 dni — przyczyny szukaj w błędach 5xx i wolnych zapytaniach.";
}

export function ZasobyKontaPanel({ subscriptionId, dostep }: { subscriptionId: string; dostep: DostepDoAkcji }) {
  const brak = brakUprawnienia("ACCOUNT_DIAGNOSTICS_VIEW", dostep);
  const [dane, setDane] = useState<ZasobyKonta | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [teraz, setTeraz] = useState(0);
  const [pending, start] = useTransition();

  const pokaz = useCallback((r: Wynik<ZasobyKonta>) => {
    setTeraz(chwila());
    if (!r.ok) return setBlad(r.error);
    setBlad(null);
    setDane(r.wynik);
  }, []);
  const pobierz = useCallback(
    (zSerwera = false) =>
      zasobyKontaAction(subscriptionId, zSerwera).catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę." })),
    [subscriptionId],
  );

  useEffect(() => {
    if (!brak) void pobierz().then(pokaz);
  }, [brak, pobierz, pokaz]);

  const trwa = !!dane && (dane.wolneSql.wToku || !!dane.strona?.wToku);
  useEffect(() => {
    if (!trwa) return;
    const t = setInterval(() => void pobierz().then(pokaz), ODSWIEZANIE_MS);
    return () => clearInterval(t);
  }, [trwa, pobierz, pokaz]);

  const wczytaj = () =>
    start(async () => {
      pokaz(await pobierz(true));
    });

  const ramka = "space-y-4 rounded-2xl border border-white/10 bg-black/35 p-5";
  const naglowek = (
    <div className="flex flex-wrap items-center gap-2">
      <h2 id="zasoby-konta-naglowek" className="text-sm font-semibold text-white">
        Zasoby i diagnoza 508
      </h2>
      <Pomoc id="zasoby-508" />
      {brak ? null : (
        <button
          type="button"
          data-akcja="wczytaj"
          className="ml-auto rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50"
          disabled={pending || trwa || !dane}
          onClick={wczytaj}
        >
          {trwa ? "Wczytywanie z serwera…" : "Wczytaj SQL i 5xx z serwera"}
        </button>
      )}
    </div>
  );

  if (brak) {
    return (
      <div className={ramka} role="region" aria-labelledby="zasoby-konta-naglowek">
        {naglowek}
        <p className="text-xs text-muted-foreground" data-zablokowane={brak}>
          {brak} — faulty limitów, inody, 5xx i wolne SQL konta są dla L2 i wyżej.
        </p>
      </div>
    );
  }

  const d = dane;
  const raport = d ? stanRaportu(d.faulty, teraz) : null;
  const opis = d ? diagnoza(d) : null;
  const st = d?.strona?.statystyki ?? null;
  const bledy5xx = st ? st.ruch.reduce((s, r) => s + r.bledy5xx, 0) : null;
  const zadania = st ? st.ruch.reduce((s, r) => s + r.zadania, 0) : null;
  const inodyProc = d?.inody.uzyte != null && d.inody.limit ? Math.round((d.inody.uzyte / d.inody.limit) * 100) : null;

  return (
    <div className={ramka} role="region" aria-labelledby="zasoby-konta-naglowek">
      {naglowek}
      {blad ? (
        <p role="alert" className="text-sm text-rose-300">
          {blad}
        </p>
      ) : null}
      {!d ? (
        blad ? null : <p className="text-xs text-muted-foreground">Wczytywanie…</p>
      ) : (
        <>
          {opis ? (
            <p className="text-sm text-white" data-diagnoza>
              {opis}
            </p>
          ) : null}

          <section className="space-y-1.5" data-sekcja="faulty">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Odbicia od limitów</h3>
            <table className="w-full text-xs">
              <thead className="text-left text-neutral-400">
                <tr>
                  <th className="py-1 font-medium">Zasób</th>
                  <th className="py-1 font-medium">Limit konta</th>
                  <th className="py-1 text-right font-medium">Doba</th>
                  <th className="py-1 text-right font-medium">7 dni</th>
                </tr>
              </thead>
              <tbody>
                {ZASOBY.map((z) => {
                  const doba = d.faulty.doba?.[z.klucz];
                  const tydzien = d.faulty.tydzien?.[z.klucz];
                  return (
                    <tr key={z.klucz} className="border-t border-white/5" data-zasob={z.klucz}>
                      <td className="py-1 text-neutral-200">{z.nazwa}</td>
                      <td className="py-1 font-mono text-neutral-300">{limitZasobu(z.klucz, d.limity)}</td>
                      <td className={`py-1 text-right font-mono ${doba ? "text-rose-200" : "text-neutral-300"}`}>{doba == null ? "—" : liczba(doba)}</td>
                      <td className={`py-1 text-right font-mono ${tydzien ? "text-amber-200" : "text-neutral-300"}`}>{tydzien == null ? "—" : liczba(tydzien)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {d.faulty.pozaRaportem ? (
              <p className="text-xs text-amber-200" data-raport="poza">
                Konto nie jest aktywne — węzeł nie raportuje jego odbić od limitów (brak danych, także sprzed zawieszenia).
              </p>
            ) : raport ? (
              <p className={`text-xs ${TON[raport.ton]}`} data-raport={raport.ton}>
                {raport.tekst}
                {d.faulty.doba ? ` Razem w dobie: ${liczba(sumaFaultow(d.faulty.doba))}.` : ""}
              </p>
            ) : null}
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            <section className="space-y-1 rounded-lg border border-white/10 bg-white/[0.03] p-3" data-sekcja="inody">
              <h3 className="text-xs font-semibold text-neutral-300">Inody (pliki)</h3>
              {d.inody.blad ? (
                <p className="text-xs text-amber-200">Nie udało się odczytać: {d.inody.blad}</p>
              ) : (
                <p className={`font-mono text-sm ${inodyProc != null && inodyProc >= 90 ? "text-rose-200" : "text-white"}`}>
                  {liczba(d.inody.uzyte)} / {d.inody.limit ? liczba(d.inody.limit) : "bez limitu"}
                  {inodyProc != null ? <span className="text-xs text-muted-foreground"> ({inodyProc}%)</span> : null}
                </p>
              )}
            </section>

            <section className="space-y-1 rounded-lg border border-white/10 bg-white/[0.03] p-3" data-sekcja="5xx">
              <h3 className="text-xs font-semibold text-neutral-300">Błędy 5xx strony (7 dni){d.strona?.domena ? ` · ${d.strona.domena}` : ""}</h3>
              {!d.strona ? (
                <p className="text-xs text-muted-foreground">Konto bez domeny głównej.</p>
              ) : d.strona.blad ? (
                <p className="text-xs text-amber-200">{d.strona.blad}</p>
              ) : st ? (
                <>
                  <p className="font-mono text-sm text-white">
                    {st.log ? `${liczba(bledy5xx)} z ${liczba(zadania)} żądań` : "brak logu domeny"}
                    {st.ttfbMs ? <span className="text-xs text-muted-foreground"> · TTFB {st.ttfbMs.mediana} ms</span> : null}
                  </p>
                  {st.top5xx.length ? (
                    <ul className="space-y-0.5 text-[11px] text-neutral-300">
                      {st.top5xx.map((x) => (
                        <li key={x.sciezka} className="truncate font-mono">
                          {x.liczba}× {x.sciezka}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground">odczyt {kiedy(d.strona.odczytano)}</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{d.strona.wToku ? "Odczyt w toku…" : "Jeszcze nie odczytano — „Wczytaj SQL i 5xx z serwera”."}</p>
              )}
            </section>

            <section className="space-y-1 rounded-lg border border-white/10 bg-white/[0.03] p-3" data-sekcja="sql">
              <h3 className="text-xs font-semibold text-neutral-300">Wolne zapytania SQL</h3>
              {d.wolneSql.blad ? <p className="text-xs text-amber-200">{d.wolneSql.blad}</p> : null}
              {d.wolneSql.odczytano ? (
                d.wolneSql.wlaczony === false ? (
                  <p className="text-xs text-amber-200">Dziennik wolnych zapytań jest wyłączony na serwerze.</p>
                ) : d.wolneSql.grupy.length === 0 ? (
                  <p className="text-xs text-neutral-300">Brak wolnych zapytań{d.wolneSql.progSekund != null ? ` (próg ${d.wolneSql.progSekund} s)` : ""}.</p>
                ) : (
                  <ul className="space-y-1 text-[11px] text-neutral-300">
                    {d.wolneSql.grupy.slice(0, 5).map((g, i) => (
                      <li key={i} title={g.sql}>
                        <span className="font-mono text-white">
                          {g.liczba}× · max {g.max.toLocaleString("pl-PL")} s
                        </span>{" "}
                        <span className="text-muted-foreground">{g.baza}</span>
                        <span className="block truncate font-mono">{g.sql}</span>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <p className="text-xs text-muted-foreground">{d.wolneSql.wToku ? "Odczyt w toku…" : "Jeszcze nie odczytano — „Wczytaj SQL i 5xx z serwera”."}</p>
              )}
              {d.wolneSql.odczytano ? <p className="text-[11px] text-muted-foreground">odczyt {kiedy(d.wolneSql.odczytano)}</p> : null}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
