import type { AkcjaObiektu } from "./rejestr";

/**
 * F2.7 — rejestr działań na domenie: sekcja „Działania” karty /domains/[id] i Cmd+K (wynik „Domena”). `perm` jak
 * w API (apps/api/src/domains/domeny.admin.controller.ts): odczyt — CUSTOMERS_VIEW (L1), operacje u rejestratora —
 * DOMAINS_MANAGE (L3), odnowienie na koszt Verris — DOMAINS_MANAGE i BILLING_MANAGE (L4) albo ADMIN (D8).
 * Działanie prowadzi do formularza na karcie (kotwica), uruchamia się tam z powodem i potwierdzeniem.
 */
export interface DomenaDlaAkcji {
  id: string;
  /** Kupiona u nas (jest u rejestratora); undefined — nie wiadomo (Cmd+K). */
  uNas?: boolean;
  transferLock?: boolean;
  klientId?: string | null;
}

const karta = (d: DomenaDlaAkcji, kotwica: string) => `/domains/${d.id}#${kotwica}`;
/** Operacje u rejestratora tylko dla domen kupionych u nas; nie wiadomo — pokaż (stan widać na karcie). */
const uNas = (d: DomenaDlaAkcji) => d.uNas !== false;

export const AKCJE_DOMENY: AkcjaObiektu<DomenaDlaAkcji>[] = [
  {
    id: "synchronizuj",
    grupa: "Rejestrator",
    nazwa: "Synchronizuj z rejestratorem",
    opis: "Data wygaśnięcia, blokada i WHOIS prosto od rejestratora.",
    perm: "DOMAINS_MANAGE",
    kiedy: uNas,
    href: (d) => karta(d, "akcja-synchronizuj"),
    slowa: "sync odśwież stan rejestrator openprovider",
    pomocId: "synchronizacja-domeny",
  },
  {
    id: "odnow",
    grupa: "Rejestrator",
    nazwa: "Odnów z portfela klienta",
    opis: "Przedłuża domenę; opłata z portfela klienta.",
    perm: "DOMAINS_MANAGE",
    kiedy: uNas,
    href: (d) => karta(d, "akcja-odnow"),
    slowa: "odnowienie przedłuż renew wygasa",
    pomocId: "odnowienie-domeny",
  },
  {
    id: "odnow-verris",
    grupa: "Rejestrator",
    nazwa: "Odnów na koszt Verris",
    opis: "Bez opłaty klienta — gdy błąd był po naszej stronie.",
    perm: { wszystkie: ["DOMAINS_MANAGE", "BILLING_MANAGE"] },
    kiedy: uNas,
    href: (d) => karta(d, "akcja-odnow-verris"),
    slowa: "odnowienie gratis za darmo nasz koszt renew",
    pomocId: "odnowienie-domeny",
  },
  {
    id: "blokada",
    grupa: "Rejestrator",
    nazwa: (d) => (d.transferLock === true ? "Zdejmij blokadę transferu" : d.transferLock === false ? "Włącz blokadę transferu" : "Blokada transferu"),
    opis: "Blokada chroni domenę przed przeniesieniem bez zgody klienta.",
    perm: "DOMAINS_MANAGE",
    kiedy: uNas,
    href: (d) => karta(d, "akcja-blokada"),
    slowa: "lock unlock blokada transferu",
  },
  {
    id: "kod-epp",
    grupa: "Rejestrator",
    nazwa: "Pokaż kod EPP",
    opis: "Kod transferu do innego rejestratora; pokazanie w dzienniku.",
    perm: "DOMAINS_MANAGE",
    kiedy: uNas,
    href: (d) => karta(d, "akcja-kod-epp"),
    slowa: "authinfo auth code kod transferu epp",
    pomocId: "kod-epp",
  },
  {
    id: "ns",
    grupa: "Rejestrator",
    nazwa: "Zmień serwery nazw",
    opis: "NS domeny u rejestratora (2–8 nazw).",
    perm: "DOMAINS_MANAGE",
    kiedy: uNas,
    href: (d) => karta(d, "akcja-ns"),
    slowa: "ns nameservery serwery nazw dns delegacja",
  },
  {
    id: "abonent",
    grupa: "Dane",
    nazwa: "Dane abonenta",
    opis: "Właściciel domeny u rejestratora (odczyt, w dzienniku).",
    perm: "CUSTOMERS_VIEW",
    kiedy: uNas,
    href: (d) => karta(d, "abonent"),
    slowa: "whois abonent właściciel registrant kontakt",
    bezpieczna: true,
  },
  {
    id: "klient",
    grupa: "Dane",
    nazwa: "Karta klienta",
    opis: "Właściciel domeny w Verris.",
    perm: "CUSTOMERS_VIEW",
    kiedy: (d) => d.klientId !== null,
    href: (d) => (d.klientId ? `/customers/${d.klientId}` : `/domains/${d.id}`),
    slowa: "klient właściciel konto",
    bezpieczna: true,
  },
];
