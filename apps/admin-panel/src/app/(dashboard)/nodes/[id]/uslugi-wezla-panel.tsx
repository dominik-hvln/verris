"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { LOGI_WEZLA, LOG_WEZLA_LINIE_MAX, LOG_WEZLA_LINIE_MIN, logWezla, logWymagaDomeny, uslugaWezla } from "@verris/contracts";
import { potwierdz, zapytaj } from "@/components/potwierdz";
import { Pomoc } from "@/components/pomoc";
import { Select } from "@/components/select";
import { PoleDaty } from "@/components/pole-daty";
import { WyslijWniosek } from "@/components/wniosek-operacji";
import { KARTA, Pigulka } from "@/components/v2";
import { POLE, kiedy } from "@/components/kolejka-poczty";
import { plForm } from "@/lib/pl";
import { uslugiWezlaAction, type AkcjaUslug, type Wynik } from "./uslugi-wezla-actions";

/**
 * F3.4 — zakładka „Usługi i logi” karty węzła (NODE_SERVICES: NOC i ADMIN). Stan usług z białej listy (zlecany na
 * węźle) i watchdog z telemetrii agenta (co minutę), restart z powodem, ogon logu z białej listy plików.
 * Usługa wspólna (WWW, poczta, bazy, DNS, FTP): NOC ją uruchamia, gdy stoi; działającą restartuje administrator
 * (z nazwą węzła jako potwierdzeniem), zespół — wnioskiem. Logi (14.10): filtry tekst, domena (także ruch jednej
 * strony), użytkownik, zakres czasu; zespół widzi adresy e-mail i IP zamaskowane we wszystkich logach.
 */
type StanUslugi = "dziala" | "stoi" | "blad" | "brak" | "zmienia";
type Usluga = {
  klucz: string;
  etykieta: string;
  przerwa: boolean;
  restart: boolean;
  jednostka: string | null;
  stan: StanUslugi;
  activeState: string | null;
  od: string | null;
  restarty: number | null;
};
export type StanUslugWezla = {
  wToku: { status: boolean; restart: boolean; log: boolean };
  uslugi: { kiedy: string; lista: Usluga[] } | null;
  bladStanu: string | null;
  restart: { usluga: string; etykieta: string; tylkoGdyStoi: boolean; wToku: boolean; kiedy: string; stanPo: StanUslugi | null; blad: string | null } | null;
  log: {
    klucz: string;
    etykieta: string;
    filtr: string | null;
    domena?: string | null;
    uzytkownik?: string | null;
    od?: string | null;
    do?: string | null;
    zakres?: { od: string | null; do: string | null } | null;
    zastosowane?: string[] | null;
    wToku: boolean;
    kiedy: string;
    zrodlo: string | null;
    dopasowanych: number | null;
    pokazano: number | null;
    maska: boolean;
    linie: string[];
    blad: string | null;
  } | null;
  watchdog: { kiedy: string | null; swiezy: boolean; nieDzialaja: string[]; uslugi: { k: string; s: string; e?: string }[] };
};

const MIN_POWOD = 10;
const BLAD_POLACZENIA = "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę.";
const przycisk = "rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50";
const STAN: Record<StanUslugi, { tekst: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  dziala: { tekst: "działa", ton: "ok" },
  stoi: { tekst: "zatrzymana", ton: "warn" },
  blad: { tekst: "padła", ton: "crit" },
  zmienia: { tekst: "zmienia stan", ton: "warn" },
  brak: { tekst: "brak na serwerze", ton: "muted" },
};

const STREFA = "Europe/Warsaw";
const godzina = (iso: string) => new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: STREFA });
const godzinaIDzien = (iso: string) =>
  `${godzina(iso)} ${new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", timeZone: STREFA })}`;
/** Migawkę starszą o tyle od świeżego raportu watchdoga oznaczamy jako starszą, nawet gdy stany się zgadzają. */
const MIGAWKA_STARSZA_MS = 10 * 60_000;

/** Wartość PoleDaty („2026-10-14T00:00”, czas przeglądarki) → ISO UTC dla API; puste albo błędne → undefined. */
export function isoZPola(v: string): string | undefined {
  if (!v) return undefined;
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? undefined : t.toISOString();
}

/**
 * Opis filtrów odczytu logu dla nagłówka wyniku. Agent węzła sprzed 14.10 nie raportuje zastosowanych filtrów —
 * wtedy domena/użytkownik/czas NIE zadziałały (linie są niefiltrowane) i mówimy to wprost.
 */
export function opisFiltrow(l: NonNullable<StanUslugWezla["log"]>): { tekst: string; ostrzezenie: string | null } {
  const czesci: string[] = [];
  if (l.filtr) czesci.push(`tekst „${l.filtr}”`);
  if (l.domena) czesci.push(`domena ${l.domena}`);
  if (l.uzytkownik) czesci.push(`użytkownik ${l.uzytkownik}`);
  if (l.od || l.do) czesci.push(`czas ${l.od ? godzinaIDzien(l.od) : "…"} – ${l.do ? godzinaIDzien(l.do) : "…"}`);
  const nowe = !!(l.domena || l.uzytkownik || l.od || l.do);
  const ostrzezenie =
    nowe && !l.wToku && !l.blad && l.zrodlo && l.zastosowane === null
      ? "Agent na tym węźle jest starszy niż filtry domeny, użytkownika i czasu — linie poniżej NIE są nimi przefiltrowane. Zaktualizuj węzeł (Operacje floty)."
      : null;
  return { tekst: czesci.join(" · "), ostrzezenie };
}

/**
 * Poprawka 12.10 — linijka watchdoga jest aktualna (agent co minutę), a tabela to migawka z ostatniego „Sprawdź na
 * serwerze” (bywa sprzed doby): tabela mówiła „FTP działa”, gdy watchdog „nie działa FTP”. Gdy ŚWIEŻY raport watchdoga
 * jest nowszy od migawki i mówi co innego o działaniu usługi, wiersz pokazuje stan z watchdoga. Zgodne — bez zmian.
 */
export function stanWgWatchdoga(
  u: Pick<Usluga, "klucz" | "stan">,
  wd: StanUslugWezla["watchdog"] | null | undefined,
  migawkaKiedy: string | null | undefined,
): { stan: StanUslugi; kiedy: string } | null {
  if (!wd?.swiezy || !wd.kiedy) return null;
  if (migawkaKiedy && new Date(migawkaKiedy).getTime() >= new Date(wd.kiedy).getTime()) return null;
  const dzialaWgMigawki = u.stan === "dziala" || u.stan === "zmienia";
  const wpis = wd.uslugi.find((w) => w.k === u.klucz);
  if (wd.nieDzialaja.includes(u.klucz) && dzialaWgMigawki) return { stan: wpis?.s === "failed" ? "blad" : "stoi", kiedy: wd.kiedy };
  if (wpis?.s === "active" && (u.stan === "stoi" || u.stan === "blad")) return { stan: "dziala", kiedy: wd.kiedy };
  return null;
}

export function UslugiWezlaPanel({ serverId, nazwaWezla, isAdmin }: { serverId: string; nazwaWezla: string; isAdmin: boolean }) {
  const [stan, setStan] = useState<StanUslugWezla | null>(null);
  const [powod, setPowod] = useState("");
  const [wniosekDla, setWniosekDla] = useState<string | null>(null);
  const [log, setLog] = useState(LOGI_WEZLA[0].klucz);
  const [linie, setLinie] = useState("200");
  const [filtr, setFiltr] = useState("");
  const [domena, setDomena] = useState("");
  const [uzytkownik, setUzytkownik] = useState("");
  const [od, setOd] = useState("");
  const [doCzasu, setDoCzasu] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();

  const wywolaj = useCallback(
    async (co: AkcjaUslug, dane: Parameters<typeof uslugiWezlaAction>[2] = {}) => {
      let r: Wynik;
      try {
        r = await uslugiWezlaAction(serverId, co, dane);
      } catch {
        r = { ok: false, error: BLAD_POLACZENIA };
      }
      if (!r.ok) {
        setMsg({ ok: false, tekst: r.error });
        if (r.wniosek && dane.usluga) setWniosekDla(dane.usluga);
        return false;
      }
      setStan(r.wynik as StanUslugWezla);
      return true;
    },
    [serverId],
  );

  useEffect(() => {
    void uslugiWezlaAction(serverId, "stan")
      .catch(() => ({ ok: false as const, error: BLAD_POLACZENIA }))
      .then((r) => (r.ok ? setStan(r.wynik as StanUslugWezla) : setMsg({ ok: false, tekst: r.error })));
  }, [serverId]);

  const trwa = !!stan && (stan.wToku.status || stan.wToku.restart || stan.wToku.log);
  useEffect(() => {
    if (!trwa) return;
    const t = setInterval(() => void wywolaj("stan"), 5000);
    return () => clearInterval(t);
  }, [trwa, wywolaj]);

  const powodOk = powod.trim().length >= MIN_POWOD;

  const restartuj = async (u: Usluga) => {
    const def = uslugaWezla(u.klucz);
    if (!def) return;
    const dziala = u.stan === "dziala" || u.stan === "zmienia";
    if (def.przerwa && dziala) {
      if (!isAdmin) {
        setWniosekDla(u.klucz);
        return;
      }
      const nazwa = await zapytaj(
        `Restart „${u.etykieta}” przerwie na chwilę pracę WSZYSTKICH kont tego węzła (strony, poczta albo bazy). Przepisz nazwę węzła, żeby potwierdzić.`,
        { akcja: "Restartuj", tytul: "Restart usługi wspólnej", placeholder: nazwaWezla },
      );
      if (nazwa === null) return;
      start(async () => {
        setMsg(null);
        if (await wywolaj("restart-wspolnej", { usluga: u.klucz, powod, potwierdzenie: nazwa })) {
          setPowod("");
          setMsg({ ok: true, tekst: "Zlecone — serwer wykona restart w ciągu minuty." });
        }
      });
      return;
    }
    const tresc = def.przerwa
      ? `Uruchomić „${u.etykieta}”? Usługa stoi, więc start niczego nie przerwie. Jeśli w międzyczasie wstanie, serwer odmówi.`
      : `Zrestartować „${u.etykieta}”? Klienci tego nie odczują.`;
    if (!(await potwierdz(tresc, { akcja: def.przerwa ? "Uruchom" : "Restartuj" }))) return;
    start(async () => {
      setMsg(null);
      if (await wywolaj("restart", { usluga: u.klucz, powod })) {
        setPowod("");
        setMsg({ ok: true, tekst: "Zlecone — serwer wykona to w ciągu minuty." });
      }
    });
  };

  const pokazLog = () =>
    start(async () => {
      setMsg(null);
      const n = Math.min(LOG_WEZLA_LINIE_MAX, Math.max(LOG_WEZLA_LINIE_MIN, Number(linie) || 200));
      await wywolaj("log", { log, linie: n, filtr, domena, uzytkownik, od: isoZPola(od), do: isoZPola(doCzasu) });
    });
  const wymagaDomeny = logWymagaDomeny(logWezla(log));

  const wd = stan?.watchdog;
  const migawkaKiedy = stan?.uslugi?.kiedy ?? null;
  const lista = (stan?.uslugi?.lista ?? []).map((u) => {
    const zWatchdoga = stanWgWatchdoga(u, wd, migawkaKiedy);
    return { u: zWatchdoga ? { ...u, stan: zWatchdoga.stan } : u, migawka: u.stan, zWatchdoga };
  });
  const migawkaStarsza =
    !!migawkaKiedy &&
    !!wd?.swiezy &&
    !!wd.kiedy &&
    (lista.some((x) => x.zWatchdoga) || new Date(wd.kiedy).getTime() - new Date(migawkaKiedy).getTime() > MIGAWKA_STARSZA_MS);
  const r = stan?.restart;
  const l = stan?.log;
  const etykieta = (k: string) => uslugaWezla(k)?.etykieta ?? k;

  return (
    <div className="space-y-4">
      <div className={`${KARTA} space-y-4 p-5`} role="region" aria-labelledby="uslugi-wezla-naglowek">
        <div className="flex items-center gap-2">
          <h2 id="uslugi-wezla-naglowek" className="text-sm font-semibold">
            Usługi
          </h2>
          <Pomoc id="uslugi-wezla" />
        </div>

        <p className="text-xs" data-watchdog={wd?.nieDzialaja.length ? "alarm" : wd?.swiezy ? "ok" : "brak"}>
          {!wd?.kiedy ? (
            <span className="text-muted-foreground">Watchdog: brak raportu agenta — zaktualizuj węzeł, żeby włączyć stały nadzór.</span>
          ) : !wd.swiezy ? (
            <span className="text-amber-200">Watchdog: ostatni raport {kiedy(wd.kiedy)} — agent milczy.</span>
          ) : wd.nieDzialaja.length ? (
            <span className="text-rose-200">
              Watchdog ({kiedy(wd.kiedy)}): nie {plForm(wd.nieDzialaja.length, "działa", "działają", "działa")} {wd.nieDzialaja.map(etykieta).join(", ")}.
            </span>
          ) : (
            <span className="text-emerald-300">Watchdog ({kiedy(wd.kiedy)}): wszystkie usługi działają.</span>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-akcja="sprawdz" className={przycisk} disabled={pending || !!stan?.wToku.status} onClick={() => start(async () => void (await wywolaj("sprawdz")))}>
            {stan?.wToku.status ? "Sprawdzam…" : "Sprawdź na serwerze"}
          </button>
          <span className="text-xs text-muted-foreground">{stan?.uslugi ? `stan z ${kiedy(stan.uslugi.kiedy)}` : "jeszcze nie sprawdzano"}</span>
        </div>
        {stan?.bladStanu ? <p className="text-xs text-rose-200">Sprawdzenie nie powiodło się: {stan.bladStanu}</p> : null}

        <input
          value={powod}
          onChange={(e) => setPowod(e.target.value)}
          maxLength={500}
          disabled={pending}
          placeholder={`Powód restartu do dziennika (min. ${MIN_POWOD} znaków)`}
          aria-label="Powód restartu"
          className={POLE}
        />

        {lista.length && migawkaStarsza ? (
          <p className="text-xs text-amber-200" data-migawka="starsza">
            Szczegóły z {godzinaIDzien(migawkaKiedy!)} (działa od, restarty) — starsze niż watchdog; odśwież „Sprawdź na serwerze”.
          </p>
        ) : null}

        {lista.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1">Usługa</th>
                  <th className="px-2 py-1">Stan</th>
                  <th className="px-2 py-1">Działa od</th>
                  <th className="px-2 py-1">Restarty</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {lista.map(({ u, migawka, zWatchdoga }) => {
                  const dziala = u.stan === "dziala" || u.stan === "zmienia";
                  const tekst = !u.restart || u.stan === "brak" ? null : u.przerwa && !dziala ? "Uruchom" : u.przerwa ? (isAdmin ? "Restart (przerwa)" : "Wniosek o restart") : "Restart";
                  return (
                    <tr key={u.klucz} data-usluga={u.klucz}>
                      <td className="px-2 py-1">
                        {u.etykieta} {u.jednostka ? <span className="font-mono text-muted-foreground">({u.jednostka})</span> : null}
                      </td>
                      <td className="px-2 py-1" title={zWatchdoga ? `Migawka z ${godzinaIDzien(migawkaKiedy!)}: ${STAN[migawka].tekst}` : undefined}>
                        <Pigulka ton={STAN[u.stan].ton}>
                          {zWatchdoga ? `${zWatchdoga.stan === "dziala" ? "działa" : "nie działa"} — wg watchdoga ${godzina(zWatchdoga.kiedy)}` : STAN[u.stan].tekst}
                        </Pigulka>
                      </td>
                      <td className="px-2 py-1">{kiedy(u.od)}</td>
                      <td className="px-2 py-1">{u.restarty ?? "—"}</td>
                      <td className="px-2 py-1 text-right">
                        {tekst ? (
                          <button
                            type="button"
                            data-akcja={`restart-${u.klucz}`}
                            className={przycisk}
                            disabled={pending || !!stan?.wToku.restart || (!powodOk && !(u.przerwa && dziala && !isAdmin))}
                            title={powodOk ? undefined : "Najpierw wpisz powód"}
                            onClick={() => void restartuj(u)}
                          >
                            {tekst}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {wniosekDla && !isAdmin ? (
          <div className="rounded-lg border border-amber-400/30 p-3" data-wniosek-restart={wniosekDla}>
            <WyslijWniosek
              typ="NODE_SERVICE_RESTART"
              payload={{ serverId, usluga: wniosekDla }}
              podpowiedz={`„${etykieta(wniosekDla)}” działa — restart przerwie pracę wszystkich kont węzła, więc robi go administrator.`}
            />
          </div>
        ) : null}

        {r ? (
          <p className="text-xs text-muted-foreground" data-restart="wynik">
            Ostatni {r.tylkoGdyStoi ? "start" : "restart"} „{r.etykieta}” ({kiedy(r.kiedy)}):{" "}
            {r.wToku ? "w toku…" : r.blad ? `nie powiódł się — ${r.blad}` : r.stanPo === "dziala" ? "usługa działa." : "gotowe."}
          </p>
        ) : null}
      </div>

      <div className={`${KARTA} space-y-3 p-5`} role="region" aria-labelledby="logi-wezla-naglowek">
        <div className="flex items-center gap-2">
          <h2 id="logi-wezla-naglowek" className="text-sm font-semibold">
            Logi
          </h2>
          <Pomoc id="logi-wezla" />
        </div>
        <div className="grid gap-2 md:grid-cols-[2fr_1fr_2fr_auto]">
          <Select value={log} onChange={setLog} aria-label="Log" options={LOGI_WEZLA.map((x) => ({ value: x.klucz, label: x.etykieta }))} />
          <input
            value={linie}
            onChange={(e) => setLinie(e.target.value.replace(/\D/g, "").slice(0, 3))}
            inputMode="numeric"
            aria-label="Ile ostatnich linii"
            title={`${LOG_WEZLA_LINIE_MIN}–${LOG_WEZLA_LINIE_MAX} linii`}
            className={POLE}
          />
          <input value={filtr} onChange={(e) => setFiltr(e.target.value)} maxLength={100} placeholder="Filtr: fragment tekstu" aria-label="Filtr logu" className={POLE} />
          <button
            type="button"
            data-akcja="log"
            className={przycisk}
            disabled={pending || !!stan?.wToku.log || (wymagaDomeny && !domena.trim())}
            title={wymagaDomeny && !domena.trim() ? "Ten log dotyczy jednej strony — podaj domenę" : undefined}
            onClick={pokazLog}
          >
            {stan?.wToku.log ? "Czytam…" : "Pokaż"}
          </button>
        </div>
        <div className="grid gap-2 md:grid-cols-4" data-filtry-logu>
          <input
            value={domena}
            onChange={(e) => setDomena(e.target.value.replace(/\s/g, "").toLowerCase())}
            maxLength={253}
            placeholder={wymagaDomeny ? "Domena (wymagana), np. firma.pl" : "Domena, np. firma.pl"}
            aria-label="Domena"
            className={POLE}
          />
          <input
            value={uzytkownik}
            onChange={(e) => setUzytkownik(e.target.value.replace(/\s/g, ""))}
            maxLength={64}
            placeholder="Użytkownik (konto, login SSH/FTP)"
            aria-label="Użytkownik"
            className={POLE}
          />
          <PoleDaty zGodzina value={od} onChange={setOd} aria-label="Od (data i godzina)" placeholder="Od — data i godzina" className={POLE} />
          <PoleDaty zGodzina value={doCzasu} onChange={setDoCzasu} aria-label="Do (data i godzina)" placeholder="Do — data i godzina" className={POLE} />
        </div>
        {l ? (
          <div className="space-y-1.5" data-log={l.klucz}>
            <p className="text-xs text-muted-foreground">
              {l.etykieta}
              {opisFiltrow(l).tekst ? ` · ${opisFiltrow(l).tekst}` : ""} · {kiedy(l.kiedy)}
              {l.dopasowanych !== null && l.pokazano !== null ? ` · ${l.pokazano} z ${l.dopasowanych} ${plForm(l.dopasowanych, "linii", "linii", "linii")}` : ""}
              {l.maska ? " · adresy e-mail i IP zamaskowane" : ""}
            </p>
            {l.zakres?.od && l.zakres.do ? (
              <p className="text-[11px] text-muted-foreground" data-zakres-okna>
                Przeszukano wpisy od {godzinaIDzien(l.zakres.od)} do {godzinaIDzien(l.zakres.do)} (ostatnie ~4 MB pliku).
              </p>
            ) : null}
            {opisFiltrow(l).ostrzezenie ? (
              <p className="text-xs text-amber-200" data-filtry="stary-agent">
                {opisFiltrow(l).ostrzezenie}
              </p>
            ) : null}
            {l.wToku ? (
              <p className="text-xs text-muted-foreground">Czytam log na serwerze…</p>
            ) : l.blad ? (
              <p className="text-xs text-rose-200">Nie udało się: {l.blad}</p>
            ) : l.linie.length ? (
              <pre className="max-h-[480px] overflow-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-neutral-200">{l.linie.join("\n")}</pre>
            ) : (
              <p className="text-xs text-muted-foreground">Brak linii{opisFiltrow(l).tekst ? " pasujących do filtrów" : ""}.</p>
            )}
          </div>
        ) : null}
      </div>

      {msg ? (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.tekst}
        </p>
      ) : null}
    </div>
  );
}
