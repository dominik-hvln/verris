"use client";

import { useState, useTransition } from "react";
import { PROFORMA_STATUS_PL, type ProformaOperatoraDto } from "@verris/contracts";
import { potwierdz, zapytaj } from "@/components/potwierdz";
import { Select } from "@/components/select";
import { POLE } from "@/components/kolejka-poczty";
import { KARTA, NaglowekKarty, Pigulka, WIERSZ } from "@/components/v2";
import { NieWczytano } from "@/components/nie-wczytano";
import { anulujProformeAction, wystawProformeAction, type WynikRozliczen } from "../../billing/rozliczenia-actions";
import { kwotaZPola } from "./portfel-operacje";

const przycisk = "rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50";
const etykieta = "text-xs text-neutral-400";
const TON = { WYSTAWIONA: "warn", OPLACONA: "ok", ANULOWANA: "muted" } as const;
const dzien = (iso: string) => new Date(iso).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" });
const MIN_POWOD = 10;
const MAKS_POZYCJI = 10;

export interface UslugaDoOdnowienia {
  id: string;
  etykieta: string;
}

/**
 * K4 (PB-53.6) — proformy klienta na karcie (BILLING_VIEW) i wystawienie / anulowanie (BILLING_MANAGE). Po wystawieniu
 * klient dostaje e-mail z linkiem do Płatności z „Zapłać”; przelew do proformy księguje się w „Zaksięguj przelew”.
 */
export function ProformyKlienta({
  userId,
  proformy,
  wolnoZmiana,
  uslugi,
}: {
  userId: string;
  proformy: ProformaOperatoraDto[] | undefined;
  wolnoZmiana: boolean;
  uslugi: UslugaDoOdnowienia[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pozycje, setPozycje] = useState<Array<{ nazwa: string; kwota: string }>>([{ nazwa: "", kwota: "" }]);
  const [odnowienie, setOdnowienie] = useState("");
  const [termin, setTermin] = useState("7");

  const wypelnione = pozycje.filter((p) => p.nazwa.trim() || p.kwota.trim());
  const pozycjeOk = wypelnione.every((p) => p.nazwa.trim().length >= 3 && kwotaZPola(p.kwota) !== null);
  const terminOk = /^\d{1,2}$/.test(termin) && Number(termin) >= 1 && Number(termin) <= 60;
  const gotowe = pozycjeOk && terminOk && (wypelnione.length > 0 || !!odnowienie);
  const pokaz = (r: WynikRozliczen) => setMsg(r.ok ? { ok: true, tekst: r.komunikat } : { ok: false, tekst: r.error });
  const brakPolaczenia = { ok: false as const, error: "Nie udało się połączyć z panelem." };

  const wystaw = async () => {
    if (!gotowe) return;
    const suma = wypelnione.reduce((a, p) => a + (kwotaZPola(p.kwota) ?? 0), 0);
    const opis = `${odnowienie ? "odnowienie usługi" : ""}${odnowienie && wypelnione.length ? " + " : ""}${wypelnione.length ? `${wypelnione.length} poz. (${suma.toFixed(2)} zł)` : ""}`;
    if (!(await potwierdz(`Wystawić proformę (${opis}, termin ${termin} dni)? Klient dostanie e-mail z linkiem do płatności.`, { akcja: "Wystaw" }))) return;
    start(async () => {
      setMsg(null);
      const r = await wystawProformeAction(userId, {
        pozycje: wypelnione.map((p) => ({ nazwa: p.nazwa.trim(), kwotaBrutto: kwotaZPola(p.kwota)! })),
        odnowienieSubscriptionId: odnowienie || undefined,
        terminDni: Number(termin),
      }).catch(() => brakPolaczenia);
      pokaz(r);
      if (r.ok) {
        setPozycje([{ nazwa: "", kwota: "" }]);
        setOdnowienie("");
      }
    });
  };

  const anuluj = async (p: ProformaOperatoraDto) => {
    const powod = await zapytaj(`Powód anulowania proformy ${p.numer} (min. ${MIN_POWOD} znaków, trafi do dziennika):`, { akcja: "Anuluj proformę", tytul: "Anulowanie proformy" });
    if (powod === null) return;
    if (powod.trim().length < MIN_POWOD) {
      setMsg({ ok: false, tekst: `Powód: min. ${MIN_POWOD} znaków.` });
      return;
    }
    start(async () => {
      setMsg(null);
      pokaz(await anulujProformeAction(userId, p.id, powod.trim()).catch(() => brakPolaczenia));
    });
  };

  const zmienPozycje = (i: number, pole: "nazwa" | "kwota", v: string) => setPozycje((s) => s.map((p, j) => (j === i ? { ...p, [pole]: v } : p)));

  return (
    // data-sekcja (nie data-karta) jak „Przypomnienia i zawieszenia”: operacje Finansów z F3.6 są tylko w panelu admina,
    // układ kart PB-46 (sekcje-karty-klienta.ts, wspólny z panelem obsługi) się nie zmienia.
    <section className={KARTA} aria-labelledby="proformy" data-sekcja="proformy">
      <NaglowekKarty id="proformy" tytul="Proformy" />
      {proformy === undefined ? (
        <div className="p-[18px]">
          <NieWczytano co="proform" />
        </div>
      ) : proformy.length === 0 ? (
        <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak proform.</div>
      ) : (
        proformy.map((p) => (
          <div key={p.id} className={WIERSZ} data-proforma={p.status}>
            <span className="flex min-w-0 flex-1 flex-col text-sm">
              <a href={`/api/proformy-pdf/${p.id}`} className="font-mono text-[13px] hover:underline">
                {p.numer}
              </a>
              <span className="text-[12.5px] text-muted-foreground">
                {[
                  p.pozycje.map((x) => x.nazwa).join(" · "),
                  `wystawiona ${dzien(p.wystawiono)}`,
                  p.status === "WYSTAWIONA" ? `termin ${dzien(p.termin)}` : null,
                  p.oplacono ? `opłacona ${dzien(p.oplacono)}` : null,
                  p.faktura ? `dokument ${p.faktura.number}` : null,
                  p.powodAnulowania ? `anulowana: ${p.powodAnulowania}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className="w-[90px] text-right font-mono text-[13px]">{Number(p.kwota).toFixed(2)} zł</span>
            <Pigulka ton={TON[p.status]} className="!text-xs">
              {PROFORMA_STATUS_PL[p.status]}
            </Pigulka>
            {wolnoZmiana && p.status === "WYSTAWIONA" ? (
              <button type="button" className={przycisk} disabled={pending} data-akcja="anuluj-proforme" onClick={() => void anuluj(p)}>
                Anuluj
              </button>
            ) : null}
          </div>
        ))
      )}
      {wolnoZmiana ? (
        <div className="space-y-2 border-t border-line px-[18px] py-4" data-sekcja="wystaw-proforme">
          <h3 className="text-sm font-semibold text-white">Wystaw proformę z linkiem do płatności</h3>
          {uslugi.length > 0 ? (
            <div className="block space-y-1">
              <label htmlFor="proforma-odnowienie" className={etykieta}>
                Odnowienie usługi (kwota jak przy odnowieniu)
              </label>
              <Select
                id="proforma-odnowienie"
                value={odnowienie}
                onChange={setOdnowienie}
                disabled={pending}
                options={[{ value: "", label: "— bez odnowienia —" }, ...uslugi.map((u) => ({ value: u.id, label: u.etykieta }))]}
              />
            </div>
          ) : null}
          {pozycje.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px] gap-2">
              <label className="block space-y-1">
                <span className={etykieta}>Pozycja {i + 1} — opis</span>
                <input value={p.nazwa} onChange={(e) => zmienPozycje(i, "nazwa", e.target.value)} maxLength={200} disabled={pending} className={POLE} data-pole="nazwa-pozycji" />
              </label>
              <label className="block space-y-1">
                <span className={etykieta}>Brutto (zł)</span>
                <input value={p.kwota} onChange={(e) => zmienPozycje(i, "kwota", e.target.value)} inputMode="decimal" placeholder="49,00" disabled={pending} className={POLE} data-pole="kwota-pozycji" />
              </label>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            {pozycje.length < MAKS_POZYCJI ? (
              <button type="button" className={przycisk} disabled={pending} onClick={() => setPozycje((s) => [...s, { nazwa: "", kwota: "" }])}>
                + pozycja
              </button>
            ) : null}
            <label className="block space-y-1">
              <span className={etykieta}>Termin (dni)</span>
              <input value={termin} onChange={(e) => setTermin(e.target.value)} inputMode="numeric" disabled={pending} className={`${POLE} w-20`} data-pole="termin" />
            </label>
            <button
              type="button"
              className={przycisk}
              disabled={pending || !gotowe}
              data-akcja="wystaw-proforme"
              title={gotowe ? undefined : "Odnowienie albo pozycja (opis min. 3 znaki, kwota), termin 1–60 dni"}
              onClick={() => void wystaw()}
            >
              Wystaw i wyślij link
            </button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Stawka VAT jak dla wpłat tego klienta. Proforma nie jest fakturą; po zapłacie dokument za wpłatę powstaje jak przy doładowaniu.
          </p>
        </div>
      ) : null}
      {msg ? (
        <p role="status" className={`px-[18px] pb-3 text-xs ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.tekst}
        </p>
      ) : null}
    </section>
  );
}
