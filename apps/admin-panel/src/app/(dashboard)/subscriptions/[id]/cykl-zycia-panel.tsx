"use client";

import { useEffect, useState, useTransition } from "react";
import { potwierdz } from "@/components/potwierdz";
import { Pomoc } from "@/components/pomoc";
import { Select } from "@/components/select";
import { PoleDaty } from "@/components/pole-daty";
import { WyslijWniosek } from "@/components/wniosek-operacji";
import { POLE } from "@/components/kolejka-poczty";
import { dzienOGodziniePl, dzienPl, naTekst, przesun, rozbierz, STREFA_PL } from "@/lib/kalendarz";
import { brakUprawnienia, type DostepDoAkcji } from "@/lib/akcje/wezel";
import { cyklZyciaAction, dodajDodatekAction, dodatkiUslugiAction, type DodatkiUslugi, type OperacjaCyklu, type WynikCyklu } from "./cykl-zycia-actions";

/** Stan usługi potrzebny sekcji (z GET admin/subscriptions/:id). */
export interface UslugaCyklu {
  id: string;
  userId: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  paymentPromiseUntil: string | null;
  /** Karta cykliczna (Stripe) — datę odnowienia ustala system płatności. */
  kartaCykliczna: boolean;
}

const MIN_POWOD = 10;
const OBIETNICA_MAKS_DNI = 7;
const DZIEN = 86_400_000;
const KOSZT = { wszystkie: ["BILLING_MANAGE", "SUBSCRIPTIONS_MANAGE"] } as const;
// Dni w Polsce, nie w UTC ani w strefie przeglądarki (przegląd 12.10): koniec okresu 23:30 UTC to już następny dzień.
const dzien = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { timeZone: STREFA_PL }) : "—");
/** Dzień (w Polsce) `n` dni kalendarzowych po `iso` — do przycisków „+7/+14”. */
export const plusDni = (iso: string, n: number) => naTekst(przesun(rozbierz(dzienPl(new Date(iso)))!.dzien, n));
const przycisk = "rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50";

/**
 * Nowy koniec okresu z dnia z kalendarza (dzień w Polsce): godzina jak w obecnym końcu okresu w Polsce (odnowienie
 * o tej samej porze), żeby „+7 dni” dawało 7 dni, a nie przesunięcie o strefę czasową.
 */
export function nowyKoniec(dzienIso: string, staryKoniec: string | null): Date | null {
  const r = /^\d{4}-\d{2}-\d{2}$/.test(dzienIso) ? rozbierz(dzienIso) : null;
  if (!r || !staryKoniec) return null;
  const s = new Date(staryKoniec);
  if (Number.isNaN(s.getTime())) return null;
  return dzienOGodziniePl(r.dzien, s);
}

/**
 * F3.5 — cykl życia usługi na karcie (sekcja „Operacje”): anulacja na koniec okresu i cofnięcie (L2), data odnowienia
 * i przedłużenie gratis (L4, niżej wniosek), obietnica zapłaty przy zaległości (L3), dodatki od obsługi (L4, niżej
 * wniosek). Wspólny powód i numer zgłoszenia klienta; klient widzi zmiany jako „obsługa Verris (zgłoszenie #…)”.
 */
export function CyklZyciaPanel({ u, dostep }: { u: UslugaCyklu; dostep: DostepDoAkcji }) {
  const [powod, setPowod] = useState("");
  const [zgloszenie, setZgloszenie] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();
  const teraz = useState(() => Date.now())[0];

  const brakAnulacji = brakUprawnienia("SUBSCRIPTIONS_MANAGE", dostep);
  const brakDaty = brakUprawnienia(KOSZT, dostep);
  const wniosekDaty = !!brakDaty && !brakAnulacji;
  // Jak w API: SUBSCRIPTIONS_MANAGE + SUBSCRIPTIONS_SUSPEND (L3) — samo SUSPEND ma zespół abuse, który nie rusza rozliczeń.
  const brakObietnicy = brakUprawnienia({ wszystkie: ["SUBSCRIPTIONS_MANAGE", "SUBSCRIPTIONS_SUSPEND"] }, dostep);
  const powodOk = powod.trim().length >= MIN_POWOD;
  const aktywna = u.status === "ACTIVE";
  const anulowana = aktywna && !!u.cancelAt;
  const obietnica = u.status === "PAST_DUE" && u.paymentPromiseUntil && new Date(u.paymentPromiseUntil).getTime() > teraz ? u.paymentPromiseUntil : null;

  const [dataOdn, setDataOdn] = useState("");
  const [dni, setDni] = useState("3");
  const nowa = nowyKoniec(dataOdn, u.currentPeriodEnd);
  const roznica = nowa && u.currentPeriodEnd ? Math.round((nowa.getTime() - new Date(u.currentPeriodEnd).getTime()) / DZIEN) : null;

  const wykonaj = async (co: OperacjaCyklu, pytanie: string, akcja: string, body: Record<string, unknown> = {}, niebezpieczne = false) => {
    if (!(await potwierdz(`${pytanie} Klient zobaczy wpis „obsługa Verris” w aktywności konta.`, { akcja, niebezpieczne }))) return;
    start(async () => {
      setMsg(null);
      const r: WynikCyklu = await cyklZyciaAction(u.id, co, { powod, zgloszenie: zgloszenie.trim() || undefined, ...body }).catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }));
      if (!r.ok) return setMsg({ ok: false, tekst: r.error });
      setMsg({ ok: true, tekst: r.komunikat });
      setPowod("");
      setDataOdn("");
    });
  };

  if (brakAnulacji && brakObietnicy) return <p className="text-sm text-muted-foreground" data-cykl="brak-uprawnien">{brakAnulacji}.</p>;
  if (u.status === "CANCELED" || u.status === "EXPIRED") return <p className="text-sm text-muted-foreground">Usługa jest zakończona — cyklu nie da się już zmienić.</p>;

  return (
    <div className="space-y-4" data-cykl={u.status}>
      <div className="grid gap-2 md:grid-cols-[2fr_1fr]">
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Powód do dziennika (min. {MIN_POWOD} znaków)</span>
          <input value={powod} onChange={(e) => setPowod(e.target.value)} maxLength={500} disabled={pending} placeholder="np. prośba klienta w zgłoszeniu" className={POLE} data-pole="powod" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Zgłoszenie klienta</span>
          <input value={zgloszenie} onChange={(e) => setZgloszenie(e.target.value)} maxLength={64} disabled={pending} placeholder="#ab12cd34" className={`${POLE} font-mono`} data-pole="zgloszenie" />
        </label>
      </div>

      <section className="space-y-1.5" data-sekcja="anulacja">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Anulacja na koniec okresu</h3>
          <Pomoc id="anulacja-uslugi" />
        </div>
        {anulowana ? (
          <>
            <p className="text-sm text-amber-200">Anulowana — działa do {dzien(u.cancelAt)} i nie odnowi się.</p>
            <button type="button" data-akcja="cofnij-anulacje" className={przycisk} disabled={!!brakAnulacji || pending || !powodOk} title={brakAnulacji ?? (powodOk ? undefined : "Najpierw wpisz powód")} onClick={() => void wykonaj("anulacja/cofnij", "Cofnąć anulację? Usługa odnowi się normalnie.", "Cofnij anulację")}>
              Cofnij anulację
            </button>
          </>
        ) : aktywna ? (
          <button
            type="button"
            data-akcja="anuluj"
            className={przycisk}
            disabled={!!brakAnulacji || pending || !powodOk}
            title={brakAnulacji ?? (powodOk ? undefined : "Najpierw wpisz powód")}
            onClick={() => void wykonaj("anulacja", `Anulować usługę na koniec okresu (${dzien(u.currentPeriodEnd)})? Do tego dnia działa, potem się nie odnowi.`, "Anuluj na koniec okresu", {}, true)}
          >
            Anuluj na koniec okresu
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">Na koniec okresu anulujesz tylko aktywną usługę.</p>
        )}
      </section>

      {aktywna && !anulowana ? (
        <section className="space-y-1.5" data-sekcja="data-odnowienia">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">Data odnowienia i przedłużenie gratis</h3>
            <Pomoc id="data-odnowienia" />
          </div>
          <p className="text-xs text-muted-foreground">Teraz: {dzien(u.currentPeriodEnd)}.</p>
          {u.kartaCykliczna ? (
            <p className="text-xs text-muted-foreground">Usługa opłacana kartą cyklicznie — datę ustala system płatności (zmiana czeka na decyzję właściciela).</p>
          ) : brakDaty && !wniosekDaty ? (
            <p className="text-xs text-muted-foreground">{brakDaty}.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <PoleDaty value={dataOdn} onChange={setDataOdn} aria-label="Nowa data odnowienia" placeholder="Nowa data" />
                {[7, 14, 30].map((n) => (
                  <button key={n} type="button" className={przycisk} disabled={pending || !u.currentPeriodEnd} data-akcja={`plus-${n}`} onClick={() => setDataOdn(plusDni(u.currentPeriodEnd!, n))}>
                    +{n} dni
                  </button>
                ))}
              </div>
              {roznica !== null ? (
                <p className="text-xs text-neutral-300" data-roznica={roznica}>
                  {roznica > 0 ? `Przedłużenie gratis o ${roznica} dni (koszt Verris).` : roznica < 0 ? `Skrócenie o ${-roznica} dni — tylko na prośbę klienta (numer zgłoszenia).` : "Bez zmiany."}
                </p>
              ) : null}
              {wniosekDaty ? (
                <WyslijWniosek
                  typ="SUBSCRIPTION_RENEWAL_DATE"
                  userId={u.userId}
                  subscriptionId={u.id}
                  gotowe={!!nowa && roznica !== 0}
                  payload={{ subscriptionId: u.id, nowaData: nowa?.toISOString() ?? "", przed: u.currentPeriodEnd ?? "", ...(zgloszenie.trim() ? { zgloszenie: zgloszenie.trim() } : {}) }}
                  podpowiedz={`${brakDaty}. Zmiana daty ma koszt — wniosek akceptuje kierownik zmiany.`}
                />
              ) : (
                <button
                  type="button"
                  data-akcja="zmien-date"
                  className={przycisk}
                  disabled={pending || !powodOk || !nowa || roznica === 0}
                  title={!nowa ? "Wybierz datę" : powodOk ? undefined : "Najpierw wpisz powód"}
                  onClick={() => void wykonaj("data-odnowienia", `Zmienić datę odnowienia na ${nowa ? nowa.toLocaleDateString("pl-PL") : "—"}?`, "Zmień datę", { nowaData: nowa?.toISOString(), przed: u.currentPeriodEnd })}
                >
                  Zmień datę odnowienia
                </button>
              )}
            </>
          )}
        </section>
      ) : null}

      {u.status === "PAST_DUE" ? (
        <section className="space-y-1.5" data-sekcja="obietnica">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">Obietnica zapłaty</h3>
            <Pomoc id="obietnica-zaplaty" />
          </div>
          {obietnica ? <p className="text-sm text-amber-200">Bez zawieszenia do {new Date(obietnica).toLocaleString("pl-PL")}.</p> : <p className="text-xs text-muted-foreground">Płatność zaległa — bez obietnicy usługa zostanie zawieszona automatycznie.</p>}
          {brakObietnicy ? (
            <p className="text-xs text-muted-foreground">{brakObietnicy}.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <Select
                value={dni}
                onChange={setDni}
                disabled={pending}
                aria-label="Na ile dni"
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-1 text-xs text-white"
                options={Array.from({ length: OBIETNICA_MAKS_DNI }, (_, i) => ({ value: String(i + 1), label: `${i + 1} ${i === 0 ? "dzień" : "dni"}` }))}
              />
              <button type="button" data-akcja="obietnica" className={przycisk} disabled={pending || !powodOk} title={powodOk ? undefined : "Najpierw wpisz powód"} onClick={() => void wykonaj("obietnica-zaplaty", `Wstrzymać automatyczne zawieszenie na ${dni} dni?`, "Wstrzymaj", { dni: Number(dni) })}>
                Wstrzymaj zawieszenie
              </button>
              {obietnica ? (
                <button type="button" data-akcja="odwolaj-obietnice" className={przycisk} disabled={pending || !powodOk} onClick={() => void wykonaj("obietnica-zaplaty/odwolaj", "Odwołać obietnicę? Przy zaległości usługa zostanie zawieszona w najbliższym przebiegu.", "Odwołaj", {}, true)}>
                  Odwołaj
                </button>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      <DodatkiUslugiSekcja u={u} dostep={dostep} powod={powod} zgloszenie={zgloszenie} />

      {msg ? (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.tekst}
        </p>
      ) : null}
    </div>
  );
}

/** Dodatki z katalogu dodawane przez obsługę: z portfela klienta (na jego zgłoszenie) albo gratis. */
function DodatkiUslugiSekcja({ u, dostep, powod, zgloszenie }: { u: UslugaCyklu; dostep: DostepDoAkcji; powod: string; zgloszenie: string }) {
  const brakOdczytu = brakUprawnienia(["CUSTOMERS_VIEW", "SUBSCRIPTIONS_MANAGE"], dostep);
  const brakDodania = brakUprawnienia(KOSZT, dostep);
  const wniosek = !!brakDodania && !brakUprawnienia("SUBSCRIPTIONS_MANAGE", dostep);
  const [dane, setDane] = useState<DodatkiUslugi | null>(null);
  const [slug, setSlug] = useState("");
  const [platnosc, setPlatnosc] = useState<"PORTFEL" | "GRATIS">("GRATIS");
  const [klucz, setKlucz] = useState(() => `d-${Math.random().toString(36).slice(2, 12)}`);
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (brakOdczytu) return;
    void dodatkiUslugiAction(u.id)
      .catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }))
      .then((r) => (r.ok ? setDane(r.wynik) : setMsg({ ok: false, tekst: r.error })));
  }, [brakOdczytu, u.id]);

  if (brakOdczytu) return null;
  const wybrany = dane?.catalog.find((c) => c.slug === slug) ?? null;
  // Weryfikacja 11.10 — aktywny dodatek czasowy: API odmawia drugiego dodania; przedłużenie tylko świadomie.
  const przedluz = slug === "priority_support_30d" && !!dane?.prioritySupport?.active;
  const aktywnyDo = przedluz && dane?.prioritySupport?.until ? new Date(dane.prioritySupport.until).toLocaleDateString("pl-PL") : null;
  const powodOk = powod.trim().length >= MIN_POWOD;
  const zgloszenieOk = platnosc === "GRATIS" || zgloszenie.trim().length > 0;

  const dodaj = async () => {
    if (!wybrany) return;
    const kwota = platnosc === "GRATIS" ? "gratis (koszt Verris)" : `za ${wybrany.price} zł z portfela klienta`;
    const pytanie = przedluz
      ? `Klient ma aktywne „${wybrany.name}”${aktywnyDo ? ` do ${aktywnyDo}` : ""}. Przedłużyć o 30 dni ${kwota}? Klient zobaczy wpis „obsługa Verris” na karcie usługi.`
      : `Dodać „${wybrany.name}” ${kwota}? Klient zobaczy wpis „obsługa Verris” na karcie usługi („Co się działo”) i w aktywności konta.`;
    if (!(await potwierdz(pytanie, { akcja: przedluz ? "Przedłuż" : "Dodaj" }))) return;
    start(async () => {
      setMsg(null);
      const r = await dodajDodatekAction(u.id, { slug, platnosc, powod, zgloszenie, klucz, przedluz }).catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }));
      if (!r.ok) return setMsg({ ok: false, tekst: r.error });
      setMsg({ ok: true, tekst: r.komunikat });
      setKlucz(`d-${Math.random().toString(36).slice(2, 12)}`);
      const odczyt = await dodatkiUslugiAction(u.id);
      if (odczyt.ok) setDane(odczyt.wynik);
    });
  };

  return (
    <section className="space-y-1.5" data-sekcja="dodatki">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-white">Dodatki</h3>
        <Pomoc id="dodatki-uslugi" />
      </div>
      {dane?.purchased.length ? (
        <p className="text-xs text-muted-foreground">Klient ma: {dane.purchased.slice(0, 5).map((p) => `${p.name} (${Number(p.amount) === 0 ? "gratis" : `${p.amount} zł`})`).join(", ")}.</p>
      ) : null}
      {brakDodania && !wniosek ? (
        <p className="text-xs text-muted-foreground">{brakDodania}.</p>
      ) : u.status === "CANCELED" || u.status === "EXPIRED" ? null : (
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            value={slug}
            onChange={setSlug}
            disabled={pending || !dane}
            aria-label="Dodatek"
            placeholder="Wybierz dodatek…"
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-1 text-xs text-white"
            options={(dane?.catalog ?? []).map((c) => ({ value: c.slug, label: `${c.name} — ${c.price} zł` }))}
          />
          <Select
            value={platnosc}
            onChange={(v) => setPlatnosc(v as "PORTFEL" | "GRATIS")}
            disabled={pending}
            aria-label="Kto płaci"
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-1 text-xs text-white"
            options={[
              { value: "GRATIS", label: "Gratis (koszt Verris)" },
              { value: "PORTFEL", label: "Z portfela klienta" },
            ]}
          />
          {wniosek ? (
            <WyslijWniosek
              typ="ADDON_ADD"
              userId={u.userId}
              subscriptionId={u.id}
              gotowe={!!wybrany && zgloszenieOk}
              payload={{ subscriptionId: u.id, slug, platnosc, ...(zgloszenie.trim() ? { zgloszenie: zgloszenie.trim() } : {}), ...(przedluz ? { przedluz: true } : {}) }}
              podpowiedz={`${brakDodania}. Dodatek ma koszt — wniosek akceptuje kierownik zmiany.`}
            />
          ) : (
            <button
              type="button"
              data-akcja="dodaj-dodatek"
              className={przycisk}
              disabled={pending || !wybrany || !powodOk || !zgloszenieOk}
              title={!wybrany ? "Wybierz dodatek" : !powodOk ? "Najpierw wpisz powód" : !zgloszenieOk ? "Z portfela klienta tylko z numerem jego zgłoszenia" : undefined}
              onClick={() => void dodaj()}
            >
              {przedluz ? "Przedłuż o 30 dni" : "Dodaj dodatek"}
            </button>
          )}
        </div>
      )}
      {przedluz ? (
        <p className="text-xs text-amber-200">Klient ma ten dodatek aktywny{aktywnyDo ? ` do ${aktywnyDo}` : ""} — drugi raz go nie dodasz, możesz go przedłużyć o 30 dni.</p>
      ) : null}
      {platnosc === "PORTFEL" && !zgloszenieOk ? <p className="text-xs text-amber-200">Z portfela klienta tylko na jego zamówienie — wpisz numer zgłoszenia.</p> : null}
      {msg ? (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.tekst}
        </p>
      ) : null}
    </section>
  );
}
