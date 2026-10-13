"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { LOG_WEZLA_DOMENA, LOG_WEZLA_UZYTKOWNIK } from "@verris/contracts";
import { Select } from "@/components/select";
import { plForm } from "@/lib/pl";
import { logiStronyAction, type ZamowienieLogu } from "./logi-strony-actions";

/**
 * 14.10 — „Logi strony” na karcie usługi w panelu obsługi (NODE_SERVICES). Gotowe zestawy dla konta klienta: ruch
 * i błędy strony (log domeny), poczta domeny, logowania FTP i SSH konta — plus tekst i zakres czasu. Odczyt zleca
 * zadanie na węźle (ok. minuty); wynik to ostatni odczyt logu na tym węźle, więc nagłówek mówi, czego dotyczy.
 * Adresy e-mail i IP zespół widzi zamaskowane (API, z roli).
 */
type WynikLogu = {
  klucz: string;
  etykieta: string;
  filtr: string | null;
  domena?: string | null;
  uzytkownik?: string | null;
  od?: string | null;
  do?: string | null;
  wToku: boolean;
  kiedy: string;
  zrodlo: string | null;
  dopasowanych: number | null;
  pokazano: number | null;
  maska: boolean;
  linie: string[];
  zakres?: { od: string | null; do: string | null } | null;
  zastosowane?: string[] | null;
  blad: string | null;
};
type StanLogow = { wToku: { log: boolean }; log: WynikLogu | null };

export interface ZestawLogu {
  id: string;
  etykieta: string;
  log: string;
  domena?: string;
  uzytkownik?: string;
}

/** Zestawy dla konta: domena tylko poprawna (konto bez domeny — bez logów strony), użytkownik konta do FTP/SSH. */
export function zestawyDlaKonta(domena: string | null | undefined, daUser: string | null | undefined): ZestawLogu[] {
  const d = (domena ?? "").trim().toLowerCase();
  const u = (daUser ?? "").trim();
  const out: ZestawLogu[] = [];
  if (LOG_WEZLA_DOMENA.test(d)) {
    out.push(
      { id: "ruch", etykieta: `Ruch strony (${d})`, log: "www-domena", domena: d },
      { id: "bledy", etykieta: `Błędy strony (${d})`, log: "www-domena-bledy", domena: d },
      { id: "poczta", etykieta: `Poczta domeny — wysyłka i odbiór (${d})`, log: "exim-main", domena: d },
      { id: "skrzynki", etykieta: `Skrzynki — logowania IMAP/POP3 (${d})`, log: "maillog", domena: d },
    );
  }
  if (LOG_WEZLA_UZYTKOWNIK.test(u)) {
    out.push(
      { id: "ftp", etykieta: `FTP konta (${u})`, log: "ftp-pureftpd", uzytkownik: u },
      { id: "ssh", etykieta: `SSH konta (${u})`, log: "ssh", uzytkownik: u },
    );
  }
  return out;
}

const STREFA = "Europe/Warsaw";
const czas = (iso: string) =>
  new Date(iso).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: STREFA });
/** Zakres czasu z gotowych przedziałów (panel obsługi nie ma natywnych pól daty — bez-systemowych-list.spec.ts). */
export const ZAKRESY = [
  { value: "", label: "Cały przeszukany log", godzin: 0 },
  { value: "1h", label: "Ostatnia godzina", godzin: 1 },
  { value: "24h", label: "Ostatnie 24 godziny", godzin: 24 },
  { value: "7d", label: "Ostatnie 7 dni", godzin: 24 * 7 },
] as const;
export function odDlaZakresu(zakres: string, teraz: number): string | undefined {
  const z = ZAKRESY.find((x) => x.value === zakres);
  return z && z.godzin ? new Date(teraz - z.godzin * 3600_000).toISOString() : undefined;
}
const POLE = "rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-muted-foreground";

export function LogiStronyPanel({ serverId, domena, daUser }: { serverId: string; domena: string | null; daUser: string | null }) {
  const zestawy = zestawyDlaKonta(domena, daUser);
  const [zestaw, setZestaw] = useState(zestawy[0]?.id ?? "");
  const [filtr, setFiltr] = useState("");
  const [zakresCzasu, setZakresCzasu] = useState("24h");
  const [stan, setStan] = useState<StanLogow | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const odswiez = useCallback(async () => {
    const r = await logiStronyAction(serverId, "stan").catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }));
    if (r.ok) setStan(r.wynik as StanLogow);
    else setBlad(r.error);
  }, [serverId]);

  useEffect(() => {
    void logiStronyAction(serverId, "stan")
      .catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }))
      .then((r) => (r.ok ? setStan(r.wynik as StanLogow) : setBlad(r.error)));
  }, [serverId]);

  const trwa = !!stan?.wToku.log;
  useEffect(() => {
    if (!trwa) return;
    const t = setInterval(() => void odswiez(), 5000);
    return () => clearInterval(t);
  }, [trwa, odswiez]);

  if (!zestawy.length) return null;

  const pokaz = () =>
    start(async () => {
      setBlad(null);
      const z = zestawy.find((x) => x.id === zestaw) ?? zestawy[0];
      const zam: ZamowienieLogu = { log: z.log, linie: 200, filtr, domena: z.domena, uzytkownik: z.uzytkownik, od: odDlaZakresu(zakresCzasu, Date.now()) };
      const r = await logiStronyAction(serverId, "log", zam).catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }));
      if (r.ok) setStan(r.wynik as StanLogow);
      else setBlad(r.error);
    });

  const l = stan?.log ?? null;
  const filtry = l
    ? [l.domena ? `domena ${l.domena}` : null, l.uzytkownik ? `użytkownik ${l.uzytkownik}` : null, l.filtr ? `tekst „${l.filtr}”` : null]
        .filter(Boolean)
        .join(" · ")
    : "";
  const staryAgent = !!l && !l.wToku && !l.blad && !!l.zrodlo && l.zastosowane === null && !!(l.domena || l.uzytkownik || l.od || l.do);

  return (
    <section className="rounded-2xl border border-white/10 bg-black/35 p-5" aria-labelledby="logi-strony-naglowek" data-logi-strony>
      <h2 id="logi-strony-naglowek" className="text-sm font-semibold text-white">
        Logi strony
      </h2>
      <p className="text-xs text-muted-foreground">
        Odczyt z serwera klienta (ok. minuty). Adresy e-mail i IP są zamaskowane.
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-[2fr_2fr_1fr_auto]">
        <Select value={zestaw} onChange={setZestaw} aria-label="Log" options={zestawy.map((z) => ({ value: z.id, label: z.etykieta }))} />
        <input value={filtr} onChange={(e) => setFiltr(e.target.value)} maxLength={100} placeholder="Fragment tekstu, np. 500 albo wp-login" aria-label="Filtr logu" className={POLE} />
        <Select value={zakresCzasu} onChange={setZakresCzasu} aria-label="Zakres czasu" options={ZAKRESY.map((z) => ({ value: z.value, label: z.label }))} />
        <button
          type="button"
          data-akcja="pokaz-log"
          onClick={pokaz}
          disabled={pending || trwa}
          className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
        >
          {trwa ? "Czytam…" : "Pokaż"}
        </button>
      </div>

      {blad ? <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{blad}</p> : null}

      {l ? (
        <div className="mt-3 space-y-1.5" data-log={l.klucz}>
          <p className="text-xs text-muted-foreground">
            Ostatni odczyt na tym serwerze: {l.etykieta}
            {filtry ? ` · ${filtry}` : ""} · {czas(l.kiedy)}
            {l.dopasowanych !== null && l.pokazano !== null ? ` · ${l.pokazano} z ${l.dopasowanych} ${plForm(l.dopasowanych, "linii", "linii", "linii")}` : ""}
          </p>
          {l.zakres?.od && l.zakres.do ? (
            <p className="text-[11px] text-muted-foreground">
              Przeszukano wpisy od {czas(l.zakres.od)} do {czas(l.zakres.do)}.
            </p>
          ) : null}
          {staryAgent ? (
            <p className="text-xs text-amber-200" data-filtry="stary-agent">
              Serwer ma starszego agenta — filtry domeny, użytkownika i czasu nie zadziałały. Zgłoś administratorowi aktualizację węzła.
            </p>
          ) : null}
          {l.wToku ? (
            <p className="text-xs text-muted-foreground">Czytam log na serwerze…</p>
          ) : l.blad ? (
            <p className="text-xs text-rose-200">Nie udało się: {l.blad}</p>
          ) : l.linie.length ? (
            <pre className="max-h-[420px] overflow-auto rounded-lg bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-neutral-200">{l.linie.join("\n")}</pre>
          ) : (
            <p className="text-xs text-muted-foreground">Brak linii pasujących do filtrów.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
