"use client";

import { useState, useTransition } from "react";
import { abonentDomenyAction } from "../actions";

/**
 * F2.7 — dane abonenta u rejestratora, tylko odczyt (OI-04: edycja zostaje w panelu klienta — zmiana imienia,
 * nazwiska i firmy to cesja). Pobierane na żądanie, bo każdy odczyt danych osobowych idzie do dziennika zespołu.
 */
const POLA: Array<[string, string]> = [
  ["firstName", "Imię"],
  ["lastName", "Nazwisko"],
  ["companyName", "Firma"],
  ["vat", "NIP"],
  ["email", "E-mail"],
  ["phone", "Telefon"],
  ["street", "Ulica"],
  ["houseNumber", "Numer"],
  ["zipcode", "Kod"],
  ["city", "Miasto"],
  ["country", "Kraj"],
];

export function AbonentDomeny({ domainId, zablokowane }: { domainId: string; zablokowane: string | null }) {
  const [dane, setDane] = useState<Record<string, string | null> | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pokaz = () =>
    start(async () => {
      setBlad(null);
      try {
        const r = await abonentDomenyAction(domainId);
        if (r.ok) setDane(r.wynik);
        else setBlad(r.error);
      } catch {
        setBlad("Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę.");
      }
    });
  return (
    <div className="flex flex-col gap-3" id="abonent">
      {dane ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2" data-abonent="">
          {POLA.filter(([k]) => dane[k]).map(([k, etykieta]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{etykieta}</dt>
              <dd className="m-0">{k === "phone" && dane.phoneCountryCode ? `${dane.phoneCountryCode} ${dane[k]}` : dane[k]}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div>
          <button
            type="button"
            onClick={pokaz}
            disabled={pending || !!zablokowane}
            title={zablokowane ?? undefined}
            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-300 hover:text-white disabled:opacity-50"
          >
            {pending ? "Pobieram…" : "Pokaż dane abonenta"}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">Odczyt od rejestratora zapisuje się w dzienniku zespołu.</p>
        </div>
      )}
      {blad ? (
        <p role="alert" className="text-sm text-rose-300">
          {blad}
        </p>
      ) : null}
    </div>
  );
}
