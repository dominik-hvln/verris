"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { potwierdz } from "@/components/potwierdz";
import { Pomoc } from "@/components/pomoc";
import { POLE, kiedy } from "@/components/kolejka-poczty";
import { brakUprawnienia, type DostepDoAkcji } from "@/lib/akcje/wezel";
import { odczytPocztyAction, zapisPocztyAction, type Wynik } from "./poczta-konta-actions";

/** Odpowiedź GET admin/subscriptions/:id/konto/wysylka/limit (poczta-konta-operatora.service.ts limit()). */
export interface StanLimitu {
  limitKonta: number | null;
  domyslny: number;
  obowiazuje: number;
  max: number;
  wToku: boolean;
  kiedy: string | null;
  blad: string | null;
  wynik: { login: string; limit: number | null; nieczytelny: boolean; domyslny: number | null } | null;
}

const MIN_POWOD = 10;

/**
 * F3.1 reszta — dobowy limit wysyłki konta na karcie usługi: odczyt z serwera (MAIL_QUEUE_VIEW, L2), zmiana albo powrót
 * do domyślnego z powodem (MAIL_SEND_BLOCK, L3). Panel klienta pokazuje nową wartość dopiero, gdy serwer ją potwierdzi.
 */
export function LimitWysylkiPanel({ subscriptionId, dostep }: { subscriptionId: string; dostep: DostepDoAkcji }) {
  const brakOdczytu = brakUprawnienia(["MAIL_QUEUE_VIEW", "MAIL_SEND_BLOCK"], dostep);
  const brakZmiany = brakUprawnienia("MAIL_SEND_BLOCK", dostep);
  const [stan, setStan] = useState<StanLimitu | null>(null);
  const [wartosc, setWartosc] = useState("");
  const [powod, setPowod] = useState("");
  const [zgloszenie, setZgloszenie] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();

  const pokaz = useCallback((r: Wynik) => (r.ok ? setStan(r.wynik as StanLimitu) : setMsg({ ok: false, tekst: r.error })), []);
  const odczyt = useCallback(
    async () => pokaz(await odczytPocztyAction(subscriptionId, "limit").catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }))),
    [subscriptionId, pokaz],
  );

  useEffect(() => {
    if (brakOdczytu) return;
    void odczytPocztyAction(subscriptionId, "limit")
      .catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }))
      .then(pokaz);
  }, [brakOdczytu, subscriptionId, pokaz]);

  const trwa = !!stan?.wToku;
  useEffect(() => {
    if (!trwa) return;
    const t = setInterval(() => void odczyt(), 5000);
    return () => clearInterval(t);
  }, [trwa, odczyt]);

  if (brakOdczytu) return <p className="text-xs text-muted-foreground">{brakOdczytu} — limit wysyłki niedostępny.</p>;

  const liczba = Number(wartosc);
  const liczbaOk = /^\d+$/.test(wartosc) && liczba >= 1 && liczba <= (stan?.max ?? 100000);
  const powodOk = powod.trim().length >= MIN_POWOD;

  const zapisz = async (limit: number | null) => {
    const tresc = limit === null ? `Przywrócić domyślny limit serwera (${stan?.domyslny ?? "—"} wiadomości na dobę)?` : `Ustawić dobowy limit wysyłki konta na ${limit} wiadomości?`;
    if (!(await potwierdz(`${tresc} Klient zobaczy nowy limit w panelu i wpis „obsługa Verris” w aktywności.`, { akcja: limit === null ? "Przywróć" : "Ustaw" }))) return;
    start(async () => {
      setMsg(null);
      const r = await zapisPocztyAction(subscriptionId, "limit", { powod, zgloszenie, limit }).catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }));
      if (!r.ok) return setMsg({ ok: false, tekst: r.error });
      setPowod("");
      setZgloszenie("");
      setWartosc("");
      setMsg({ ok: true, tekst: "Zlecone — serwer zmieni limit w ciągu minuty." });
      await odczyt();
    });
  };

  const wczytaj = () =>
    start(async () => {
      setMsg(null);
      pokaz(await zapisPocztyAction(subscriptionId, "wczytaj-limit", {}).catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." })));
    });

  const przycisk = "rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50";
  const naSerwerze = stan?.wynik;
  const rozjazd = !!naSerwerze && !naSerwerze.nieczytelny && naSerwerze.limit !== stan?.limitKonta;

  return (
    <section className="space-y-2" data-sekcja="limit">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-white">Limit wysyłki konta</h3>
        <Pomoc id="limit-wysylki" />
      </div>
      {stan ? (
        <p className="text-sm" data-limit={stan.obowiazuje}>
          {stan.obowiazuje} wiadomości na dobę {stan.limitKonta === null ? "(domyślny serwera)" : `(ustawiony przez obsługę; domyślny ${stan.domyslny})`}
          {trwa ? " · zmiana w toku…" : ""}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Wczytywanie…</p>
      )}
      {naSerwerze ? (
        <p className="text-xs text-muted-foreground">
          Serwer ({kiedy(stan?.kiedy ?? null)}): {naSerwerze.nieczytelny ? "plik limitu nieczytelny" : naSerwerze.limit === null ? "domyślny" : naSerwerze.limit}
          {rozjazd ? " — inaczej niż w panelu" : ""}
        </p>
      ) : null}
      {stan?.blad ? <p className="text-xs text-rose-200">Ostatnia operacja nie powiodła się: {stan.blad}</p> : null}
      <div className="grid gap-2 md:grid-cols-[1fr_2fr_1fr]">
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Nowy limit (1–{stan?.max ?? 100000})</span>
          <input value={wartosc} onChange={(e) => setWartosc(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} disabled={pending || !!brakZmiany} className={`${POLE} font-mono`} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Powód do dziennika (min. {MIN_POWOD} znaków)</span>
          <input value={powod} onChange={(e) => setPowod(e.target.value)} maxLength={500} disabled={pending || !!brakZmiany} placeholder="np. kampania klienta po rozmowie" className={POLE} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Zgłoszenie klienta</span>
          <input value={zgloszenie} onChange={(e) => setZgloszenie(e.target.value)} maxLength={64} disabled={pending || !!brakZmiany} placeholder="#ab12cd34" className={`${POLE} font-mono`} />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" data-akcja="ustaw-limit" className={przycisk} disabled={!!brakZmiany || pending || trwa || !powodOk || !liczbaOk} title={brakZmiany ?? (!liczbaOk ? "Wpisz limit" : !powodOk ? "Najpierw wpisz powód" : undefined)} onClick={() => void zapisz(liczba)}>
          Ustaw limit
        </button>
        {stan?.limitKonta !== null ? (
          <button type="button" data-akcja="domyslny-limit" className={przycisk} disabled={!!brakZmiany || pending || trwa || !powodOk} title={brakZmiany ?? (powodOk ? undefined : "Najpierw wpisz powód")} onClick={() => void zapisz(null)}>
            Przywróć domyślny
          </button>
        ) : null}
        <button type="button" data-akcja="wczytaj-limit" className={przycisk} disabled={pending || trwa} onClick={wczytaj}>
          Sprawdź na serwerze
        </button>
      </div>
      {msg ? (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.tekst}
        </p>
      ) : null}
    </section>
  );
}
