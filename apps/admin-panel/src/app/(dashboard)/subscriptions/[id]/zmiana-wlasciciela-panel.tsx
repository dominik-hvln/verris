"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { zapytaj } from "@/components/potwierdz";
import { POLE } from "@/components/kolejka-poczty";
import { podgladZmianyWlascicielaAction, zmienWlascicielaAction, type PodgladZmianyWlasciciela } from "./zmiana-wlasciciela-actions";

const MIN_POWOD = 10;
const przycisk = "rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50";

/**
 * K2 (PB-53.5) — „Zmień właściciela” na karcie usługi (tylko administrator; strona pokazuje sekcję tylko jemu, API
 * odrzuca resztę). Wyszukanie klienta po e-mailu pokazuje odmowy i uwagi z API, potem powód i potwierdzenie
 * wpisaniem adresu nowego właściciela. Co przechodzi, a co zostaje — zmiana-wlasciciela.service.ts.
 */
export function ZmianaWlascicielaPanel({ subscriptionId, obecnyEmail }: { subscriptionId: string; obecnyEmail: string }) {
  const [email, setEmail] = useState("");
  const [powod, setPowod] = useState("");
  const [podglad, setPodglad] = useState<(PodgladZmianyWlasciciela & { dla: string }) | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string; klientId?: string } | null>(null);
  const [pending, start] = useTransition();

  const adres = email.trim();
  const aktualny = podglad && podglad.dla === adres.toLowerCase() ? podglad : null;
  const mozna = !!aktualny?.nowyWlasciciel && aktualny.odmowy.length === 0;
  const powodOk = powod.trim().length >= MIN_POWOD;

  const sprawdz = () =>
    start(async () => {
      setMsg(null);
      setPodglad(null);
      const r = await podgladZmianyWlascicielaAction(subscriptionId, adres).catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }));
      if (!r.ok) return setMsg({ ok: false, tekst: r.error });
      setPodglad({ ...r.wynik, dla: adres.toLowerCase() });
    });

  const zmien = async () => {
    if (!aktualny?.nowyWlasciciel) return;
    const cel = aktualny.nowyWlasciciel.email;
    const wpisane = await zapytaj(
      `Usługa ${aktualny.usluga.domena} z plikami, bazami i pocztą przejdzie od ${obecnyEmail} do ${cel}. Kolejne odnowienia rozliczy nowy właściciel, dotychczasowe faktury zostają u obecnego. Wpisz adres e-mail nowego właściciela, aby potwierdzić:`,
      { akcja: "Zmień właściciela", tytul: "Zmiana właściciela usługi", placeholder: cel },
    );
    if (wpisane === null) return;
    if (wpisane.trim().toLowerCase() !== cel.toLowerCase()) {
      setMsg({ ok: false, tekst: "Wpisany adres nie zgadza się z adresem nowego właściciela — nic nie zmieniono." });
      return;
    }
    start(async () => {
      setMsg(null);
      const r = await zmienWlascicielaAction(subscriptionId, { email: cel, powod, potwierdzenie: wpisane }).catch(() => ({ ok: false as const, error: "Nie udało się połączyć z panelem." }));
      if (!r.ok) return setMsg({ ok: false, tekst: r.error });
      setMsg({ ok: true, tekst: r.komunikat, klientId: r.nowyWlascicielId });
      setPodglad(null);
      setPowod("");
      setEmail("");
    });
  };

  return (
    <div className="space-y-3" data-sekcja="zmiana-wlasciciela">
      <p className="text-xs text-muted-foreground">
        Usługa przechodzi z kontem hostingowym, certyfikatami i ustawieniami; faktury, płatności i zgłoszenia zostają u obecnego właściciela. Jego subkonta i współpracownicy tracą dostęp. Obie strony dostaną e-mail.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-64 flex-1 space-y-1">
          <span className="text-xs text-neutral-400">E-mail nowego właściciela (istniejące konto klienta)</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} disabled={pending} placeholder="klient@firma.pl" className={POLE} data-pole="email" />
        </label>
        <button type="button" data-akcja="sprawdz" className={przycisk} disabled={pending || !adres.includes("@")} onClick={sprawdz}>
          Sprawdź
        </button>
      </div>

      {aktualny ? (
        <div className="space-y-1.5 text-sm" data-podglad={mozna ? "mozna" : "odmowa"}>
          {aktualny.nowyWlasciciel ? (
            <p className="text-neutral-200">
              Nowy właściciel: <span className="font-mono">{aktualny.nowyWlasciciel.email}</span>
              {aktualny.nowyWlasciciel.imie ? ` (${aktualny.nowyWlasciciel.imie})` : ""}
            </p>
          ) : null}
          {aktualny.odmowy.map((o) => (
            <p key={o} className="text-rose-300" data-odmowa>
              {o}
            </p>
          ))}
          {aktualny.uwagi.map((u) => (
            <p key={u} className="text-xs text-amber-200">
              {u}
            </p>
          ))}
        </div>
      ) : null}

      {mozna ? (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-xs text-neutral-400">Powód do dziennika (min. {MIN_POWOD} znaków)</span>
            <input value={powod} onChange={(e) => setPowod(e.target.value)} maxLength={500} disabled={pending} placeholder="np. sprzedaż firmy — prośba obu stron w zgłoszeniu" className={POLE} data-pole="powod" />
          </label>
          <button
            type="button"
            data-akcja="zmien-wlasciciela"
            className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600 disabled:opacity-50"
            disabled={pending || !powodOk}
            title={powodOk ? undefined : "Najpierw wpisz powód"}
            onClick={() => void zmien()}
          >
            {pending ? "Chwila…" : "Zmień właściciela"}
          </button>
        </div>
      ) : null}

      {msg ? (
        <p role="status" className={`text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.tekst}{" "}
          {msg.klientId ? (
            <Link href={`/customers/${msg.klientId}`} className="underline">
              Karta nowego właściciela
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
