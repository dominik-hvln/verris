"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { potwierdz } from "@/components/potwierdz";
import { Pomoc } from "@/components/pomoc";
import { OpisKolejki, POLE, TabelaKolejki, kiedy, type StanKolejki } from "@/components/kolejka-poczty";
import { brakUprawnienia, type DostepDoAkcji } from "@/lib/akcje/wezel";
import { plForm } from "@/lib/pl";
import { odczytPocztyAction, zapisPocztyAction, type Wynik } from "./poczta-konta-actions";

/**
 * F3.1 (D4, 10.10) — sekcja „Poczta” w zakładce „Konto” karty usługi: blokada wysyłki konta na serwerze (MAIL_SEND_BLOCK,
 * L3/NOC/abuse) i kolejka konta — nagłówki bez treści (MAIL_QUEUE_VIEW, L2), usunięcie zaznaczonych wiadomości
 * (MAIL_SEND_BLOCK, nieodwracalne, z potwierdzeniem). Powód obowiązkowy, numer zgłoszenia opcjonalny; klient widzi
 * w aktywności „obsługa Verris”. Bez uprawnienia przycisk jest wyszarzony z informacją, czego brakuje.
 */
export type StanWysylki = {
  zablokowana: boolean;
  od: string | null;
  przez: string | null;
  powod: string | null;
  naWezle: boolean | null;
  obslugiwana: boolean | null;
  bladWezla: string | null;
};

const MIN_POWOD = 10;
const ODSWIEZANIE_MS = 5000;

export function PocztaKontaPanel({ subscriptionId, dostep }: { subscriptionId: string; dostep: DostepDoAkcji }) {
  const brakBlokady = brakUprawnienia("MAIL_SEND_BLOCK", dostep);
  const brakKolejki = brakUprawnienia("MAIL_QUEUE_VIEW", dostep);
  const brakStanu = brakUprawnienia(["MAIL_QUEUE_VIEW", "MAIL_SEND_BLOCK"], dostep);
  const [wysylka, setWysylka] = useState<StanWysylki | null>(null);
  const [kolejka, setKolejka] = useState<StanKolejki | null>(null);
  const [powod, setPowod] = useState("");
  const [zgloszenie, setZgloszenie] = useState("");
  const [szukaj, setSzukaj] = useState("");
  const [zaznaczone, setZaznaczone] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();

  const pobierz = useCallback(
    (co: "wysylka" | "kolejka"): Promise<Wynik> =>
      odczytPocztyAction(subscriptionId, co).catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę." })),
    [subscriptionId],
  );
  const pokaz = useCallback((co: "wysylka" | "kolejka", r: Wynik) => {
    if (!r.ok) return setMsg({ ok: false, tekst: r.error });
    if (co === "wysylka") setWysylka(r.wynik as StanWysylki);
    else setKolejka(r.wynik as StanKolejki);
  }, []);
  const odczyt = useCallback(async (co: "wysylka" | "kolejka") => pokaz(co, await pobierz(co)), [pobierz, pokaz]);

  useEffect(() => {
    if (!brakStanu) void pobierz("wysylka").then((r) => pokaz("wysylka", r));
    if (!brakKolejki) void pobierz("kolejka").then((r) => pokaz("kolejka", r));
  }, [brakStanu, brakKolejki, pobierz, pokaz]);

  const trwa = !!kolejka && (kolejka.wToku || !!kolejka.usuwanie?.wToku);
  useEffect(() => {
    if (!trwa) return;
    const t = setInterval(() => void odczyt("kolejka"), ODSWIEZANIE_MS);
    return () => clearInterval(t);
  }, [trwa, odczyt]);

  const zapisz = (co: "zablokuj" | "zwolnij" | "wczytaj" | "usun", ids?: string[]) =>
    start(async () => {
      setMsg(null);
      let r: Wynik;
      try {
        r = await zapisPocztyAction(subscriptionId, co, { powod, zgloszenie, szukaj, ids });
      } catch {
        r = { ok: false, error: "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę." };
      }
      if (!r.ok) return setMsg({ ok: false, tekst: r.error });
      if (co === "wczytaj") return setKolejka(r.wynik as StanKolejki);
      setPowod("");
      setZgloszenie("");
      if (co === "usun") {
        setZaznaczone(new Set());
        setMsg({ ok: true, tekst: "Usuwanie zlecone — serwer usunie wiadomości w ciągu minuty; liczba usuniętych pojawi się poniżej." });
        return odczyt("kolejka");
      }
      setMsg({ ok: true, tekst: co === "zablokuj" ? "Wysyłka konta zablokowana na serwerze." : "Wysyłka konta przywrócona." });
      await odczyt("wysylka");
    });

  // Okno potwierdzenia PRZED transition (React 19: okno otwarte w środku async transition się nie pokazuje).
  const blokada = async (zablokuj: boolean) => {
    const tresc = zablokuj
      ? "Zablokować wysyłkę poczty konta? Skrzynki i skrypty PHP przestaną wysyłać, odbiór poczty i strona działają dalej."
      : "Zwolnić wysyłkę poczty konta? Skrzynki i skrypty PHP znów będą wysyłać.";
    if (!(await potwierdz(`${tresc} Klient zobaczy w aktywności konta wpis „obsługa Verris”.`, { akcja: zablokuj ? "Zablokuj" : "Zwolnij", niebezpieczne: zablokuj }))) return;
    zapisz(zablokuj ? "zablokuj" : "zwolnij");
  };

  const usun = async () => {
    const lista = kolejka?.wiadomosci.filter((m) => zaznaczone.has(m.id)) ?? [];
    if (!lista.length) return;
    const podglad = lista
      .slice(0, 8)
      .map((m) => `• ${m.nadawca || "<>"} → ${m.odbiorcy}: ${m.temat || "—"}`)
      .join("\n");
    const reszta = lista.length > 8 ? `\n…i ${lista.length - 8} kolejnych` : "";
    const ile = `${lista.length} ${plForm(lista.length, "wiadomość", "wiadomości", "wiadomości")}`;
    if (!(await potwierdz(`Usunąć z kolejki ${ile} konta? Tego nie da się cofnąć — nie wyjdą i nie wrócą do nadawcy.\n\n${podglad}${reszta}`, { akcja: "Usuń", niebezpieczne: true, tytul: "Usunąć wiadomości z kolejki?" }))) return;
    zapisz("usun", lista.map((m) => m.id));
  };

  const powodOk = powod.trim().length >= MIN_POWOD;
  const przycisk = "rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50";
  const w = wysylka;

  return (
    <div className="space-y-5 rounded-2xl border border-white/10 bg-black/35 p-5" role="region" aria-labelledby="poczta-konta-naglowek">
      <div>
        <div className="flex items-center gap-2">
          <h2 id="poczta-konta-naglowek" className="text-sm font-semibold text-white">
            Poczta: wysyłka i kolejka
          </h2>
          <Pomoc id="blokada-wysylki" />
        </div>
        <p className="text-xs text-muted-foreground">Blokada działa na serwerze dla całego konta. Kolejka pokazuje tylko nagłówki — treści wiadomości nie widać.</p>
      </div>

      <section className="space-y-2" data-sekcja="wysylka">
        {brakStanu ? (
          <p className="text-xs text-muted-foreground">{brakStanu} — stan wysyłki niedostępny.</p>
        ) : w ? (
          <div className="space-y-1 text-sm">
            <p data-wysylka={w.zablokowana ? "zablokowana" : "dziala"} className={w.zablokowana ? "text-rose-200" : "text-emerald-300"}>
              {w.zablokowana ? `Wysyłka zablokowana od ${kiedy(w.od)}${w.przez ? ` (${w.przez})` : ""}${w.powod ? ` — ${w.powod}` : ""}.` : "Wysyłka działa."}
            </p>
            {w.naWezle !== null && w.naWezle !== w.zablokowana ? (
              <p role="alert" className="text-xs text-amber-200" data-rozjazd="tak">
                Na serwerze wysyłka jest {w.naWezle ? "zablokowana" : "odblokowana"} — inaczej niż w panelu. Użyj ponownie „{w.zablokowana ? "Zablokuj" : "Zwolnij"}”, by wyrównać.
              </p>
            ) : null}
            {w.obslugiwana === false ? <p className="text-xs text-amber-200">Serwer nie obsługuje blokady (exim.conf bez blacklist_usernames) — zaktualizuj exim.conf przez CustomBuild.</p> : null}
            {w.bladWezla ? <p className="text-xs text-amber-200">Nie udało się sprawdzić stanu na serwerze: {w.bladWezla}</p> : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Wczytywanie…</p>
        )}
      </section>

      <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Powód do dziennika (obowiązkowy, min. {MIN_POWOD} znaków)</span>
          <input value={powod} onChange={(e) => setPowod(e.target.value)} maxLength={500} disabled={pending} placeholder="np. spam z formularza, IP na liście RBL" className={POLE} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Numer zgłoszenia klienta (jeśli jest)</span>
          <input value={zgloszenie} onChange={(e) => setZgloszenie(e.target.value)} maxLength={64} disabled={pending} placeholder="#ab12cd34" className={`${POLE} font-mono`} />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {w?.zablokowana ? null : (
          <button type="button" data-akcja="zablokuj" className={przycisk} disabled={!!brakBlokady || pending || !powodOk} title={brakBlokady ?? (powodOk ? undefined : "Najpierw wpisz powód")} onClick={() => void blokada(true)}>
            Zablokuj wysyłkę
          </button>
        )}
        {w?.zablokowana || w?.naWezle ? (
          <button type="button" data-akcja="zwolnij" className={przycisk} disabled={!!brakBlokady || pending || !powodOk} title={brakBlokady ?? (powodOk ? undefined : "Najpierw wpisz powód")} onClick={() => void blokada(false)}>
            Zwolnij wysyłkę
          </button>
        ) : null}
        {w?.zablokowana && w.naWezle === false ? (
          <button type="button" data-akcja="zablokuj" className={przycisk} disabled={!!brakBlokady || pending || !powodOk} title={brakBlokady ?? undefined} onClick={() => void blokada(true)}>
            Zablokuj ponownie
          </button>
        ) : null}
      </div>

      <section id="kolejka-poczty" className="scroll-mt-24 space-y-2 border-t border-white/10 pt-4" data-sekcja="kolejka">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Kolejka poczty konta</h3>
          <Pomoc id="kolejka-poczty" />
        </div>
        {brakKolejki ? (
          <p className="text-xs text-muted-foreground">{brakKolejki}.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <input value={szukaj} onChange={(e) => setSzukaj(e.target.value)} maxLength={100} disabled={pending} placeholder="Fraza (opcjonalnie): nadawca, odbiorca, temat" aria-label="Fraza wyszukiwania na serwerze" className={`${POLE} max-w-sm`} />
              <button type="button" data-akcja="wczytaj" className={przycisk} disabled={pending || !!kolejka?.wToku} onClick={() => zapisz("wczytaj")}>
                {kolejka?.wToku ? "Wczytywanie…" : "Wczytaj kolejkę z serwera"}
              </button>
            </div>
            {kolejka ? (
              <>
                <OpisKolejki stan={kolejka} />
                {kolejka.blad ? <p className="text-xs text-rose-200">Ostatni odczyt nie powiódł się: {kolejka.blad}</p> : null}
                <TabelaKolejki stan={kolejka} zaznaczone={brakBlokady ? undefined : zaznaczone} onZaznacz={brakBlokady ? undefined : setZaznaczone} />
                {kolejka.wiadomosci.length ? (
                  <button
                    type="button"
                    data-akcja="usun"
                    className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
                    disabled={!!brakBlokady || pending || !powodOk || zaznaczone.size === 0 || !!kolejka.usuwanie?.wToku}
                    title={brakBlokady ?? (powodOk ? undefined : "Najpierw wpisz powód")}
                    onClick={() => void usun()}
                  >
                    Usuń zaznaczone z kolejki ({zaznaczone.size})
                  </button>
                ) : null}
                {kolejka.usuwanie ? (
                  <p className="text-xs text-muted-foreground" data-usuwanie="wynik">
                    Ostatnie usuwanie ({kiedy(kolejka.usuwanie.kiedy)}):{" "}
                    {kolejka.usuwanie.wToku
                      ? "w toku…"
                      : kolejka.usuwanie.blad
                        ? `nie powiodło się — ${kolejka.usuwanie.blad}`
                        : `usunięto ${kolejka.usuwanie.usunieto ?? 0}, pominięto ${kolejka.usuwanie.pominieto ?? 0} (już wysłane albo nie z tego konta).`}
                  </p>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </section>

      {msg ? (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.tekst}
        </p>
      ) : null}
    </div>
  );
}
