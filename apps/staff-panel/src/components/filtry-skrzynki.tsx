"use client";

import Link from "next/link";
import { Select } from "@/components/select";
import { TICKET_PRIORITY_PL, etykieta } from "@verris/contracts";
import type { ParametrySkrzynki } from "@/lib/skrzynka";

const TEMATY: Record<string, string> = {
  HOSTING: "Hosting",
  DOMAIN: "Domena",
  EMAIL: "Poczta",
  DNS: "DNS",
  BILLING: "Płatności",
  SSL: "SSL",
  OTHER: "Inne",
  BETA: "Beta",
};
const POLE = "h-[34px] rounded-lg border border-line-strong bg-card px-2.5 text-[13px] text-foreground";

/**
 * F2.5 — filtry skrzynki: zwykły formularz GET (parametry trafiają do adresu, filtr można wysłać linkiem).
 * Wyszukiwanie i filtry liczy API; `widok` i `userId` zostają jako ukryte pola.
 */
export function FiltrySkrzynki({ p, tagi, sciezka = "/", bezTerminu = false }: { p: ParametrySkrzynki; tagi: string[]; sciezka?: string; bezTerminu?: boolean }) {
  const wszystkie = { value: "", label: "wszystkie" };
  return (
    <form method="get" action={sciezka} className="flex flex-wrap items-center gap-2" aria-label="Filtry skrzynki" data-filtry="skrzynka">
      {p.widok ? <input type="hidden" name="widok" value={p.widok} /> : null}
      {p.userId ? <input type="hidden" name="userId" value={p.userId} /> : null}
      <input
        name="q"
        defaultValue={p.q ?? ""}
        aria-label="Szukaj"
        placeholder="Szukaj: temat, treść, klient, #numer…"
        className={`${POLE} min-w-[220px] flex-1 outline-none focus:border-data`}
      />
      <Select name="priorytet" aria-label="Priorytet" defaultValue={p.priorytet ?? ""} className={POLE} options={[{ value: "", label: "priorytet: każdy" }, ...["URGENT", "HIGH", "NORMAL", "LOW"].map((x) => ({ value: x, label: etykieta(TICKET_PRIORITY_PL, x) }))]} />
      {p.widok === "moje" ? null : (
        <Select
          name="przypisany"
          aria-label="Przypisane"
          defaultValue={p.przypisany ?? ""}
          className={POLE}
          options={[{ value: "", label: "przypisane: wszyscy" }, { value: "ja", label: "do mnie" }, { value: "nikt", label: "bez opiekuna" }]}
        />
      )}
      <Select name="temat" aria-label="Temat" defaultValue={p.temat ?? ""} className={POLE} options={[{ value: "", label: "temat: każdy" }, ...Object.entries(TEMATY).map(([value, label]) => ({ value, label }))]} />
      {tagi.length ? (
        <Select name="tag" aria-label="Tag" defaultValue={p.tag ?? ""} className={POLE} options={[{ ...wszystkie, label: "tag: każdy" }, ...tagi.map((t) => ({ value: t, label: t }))]} />
      ) : null}
      {bezTerminu ? null : (
      <Select
        name="sla"
        aria-label="Termin"
        defaultValue={p.sla ?? ""}
        className={POLE}
        options={[{ value: "", label: "termin: każdy" }, { value: "po-terminie", label: "1. odpowiedź po terminie" }, { value: "rozwiazanie-po-terminie", label: "rozwiązanie po terminie" }]}
      />
      )}
      <button type="submit" className="inline-flex h-[34px] items-center rounded-[9px] border border-primary bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:bg-data-hi">
        Filtruj
      </button>
      <Link href={p.widok ? `${sciezka}?widok=${p.widok}${p.userId ? `&userId=${encodeURIComponent(p.userId)}` : ""}` : p.userId ? `${sciezka}?userId=${encodeURIComponent(p.userId)}` : sciezka} className="text-[13px]">
        Wyczyść
      </Link>
    </form>
  );
}
