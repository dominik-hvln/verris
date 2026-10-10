import type { AkcjaObiektu } from "./rejestr";

/**
 * Rejestr działań na fakturze (plan E, patch 10) — strona /invoices/[id] i Cmd+K. `perm` jak w API:
 * admin/invoices — BILLING_VIEW (odczyt, PDF) i BILLING_MANAGE (anulowanie z @WniosekMozliwy('INVOICE_VOID'),
 * korekta); admin/ksef — tylko ADMIN.
 */
export interface FakturaDlaAkcji {
  id: string;
  /** InvoiceStatus; undefined — nie wiadomo (Cmd+K). */
  status?: string;
  kind?: string;
  ksefStatus?: string;
  maPdf?: boolean;
  klientId?: string | null;
}

const strona = (f: FakturaDlaAkcji, kotwica: string) => `/invoices/${f.id}#${kotwica}`;
const nieWiadomo = (v: unknown) => v === undefined;

export const AKCJE_FAKTURY: AkcjaObiektu<FakturaDlaAkcji>[] = [
  {
    id: "pdf",
    grupa: "Dokument",
    nazwa: "Pobierz PDF",
    opis: "Plik faktury Verris; pobranie trafia do dziennika.",
    perm: "BILLING_VIEW",
    kiedy: (f) => f.maPdf ?? true,
    href: (f) => strona(f, "pdf"),
    slowa: "pdf pobierz plik",
    bezpieczna: true,
  },
  {
    id: "korekta",
    grupa: "Dokument",
    nazwa: "Wystaw korektę",
    opis: "Zwrot, rabat albo poprawka danych nabywcy — dokument VFK.",
    perm: "BILLING_MANAGE",
    kiedy: (f) => (nieWiadomo(f.status) || f.status === "PAID") && f.kind !== "KOREKTA",
    href: (f) => `/invoices/${f.id}/korekta`,
    slowa: "korekta koryguj zwrot vfk",
    pomocId: "korekta",
  },
  {
    id: "anuluj",
    grupa: "Dokument",
    nazwa: "Anuluj dokument",
    opis: "Tylko nieopłacony; opłacony zmienia się korektą.",
    perm: "BILLING_MANAGE",
    kiedy: (f) => nieWiadomo(f.status) || f.status === "DRAFT" || f.status === "OPEN",
    href: (f) => strona(f, "anuluj"),
    slowa: "anuluj void unieważnij",
    // Strona faktury — BILLING_VIEW; wniosek INVOICE_VOID składa się z CUSTOMERS_VIEW.
    wniosek: ["BILLING_VIEW", "CUSTOMERS_VIEW"],
    pomocId: "anuluj-fakture",
  },
  {
    id: "dokoncz",
    grupa: "Dokument",
    nazwa: "Dokończ wystawienie",
    opis: "Opłacona faktura bez PDF-u — nadaje numer i tworzy plik.",
    // POST admin/invoices/:invoiceId/dokoncz — BILLING_MANAGE; automat (faktury.scheduler) bierze PAID bez storageKey.
    perm: "BILLING_MANAGE",
    // Tylko gdy wiadomo, że PDF-u brak (strona faktury) — w Cmd+K stan pliku jest nieznany, a takich faktur jest garść.
    kiedy: (f) => (nieWiadomo(f.status) || f.status === "PAID") && f.maPdf === false,
    href: (f) => strona(f, "dokoncz"),
    slowa: "dokończ wystaw pdf numer finalizuj",
    pomocId: "dokoncz-fakture",
  },
  {
    id: "upo",
    grupa: "KSeF",
    nazwa: "Pobierz UPO",
    opis: "Poświadczenie przyjęcia faktury przez KSeF (XML).",
    // GET admin/ksef/invoices/:id/upo — tylko ADMIN; UPO istnieje tylko dla faktury przyjętej.
    perm: "ADMIN",
    kiedy: (f) => nieWiadomo(f.ksefStatus) || f.ksefStatus === "ACCEPTED",
    href: (f) => strona(f, "upo"),
    slowa: "upo ksef poświadczenie odbioru xml",
    pomocId: "upo",
    bezpieczna: true,
  },
  {
    id: "ksef",
    grupa: "KSeF",
    nazwa: "Ponów wysyłkę do KSeF",
    opis: "Po poprawie danych — tylko faktura odrzucona przez KSeF.",
    perm: "ADMIN",
    kiedy: (f) => nieWiadomo(f.ksefStatus) || f.ksefStatus === "REJECTED",
    href: (f) => strona(f, "ksef"),
    slowa: "ksef ponów odrzucona e-faktura",
    pomocId: "ksef-ponow",
  },
  {
    id: "klient",
    grupa: "Powiązania",
    nazwa: "Karta klienta",
    opis: "Nabywca: usługi, portfel, zgłoszenia.",
    perm: "CUSTOMERS_VIEW",
    kiedy: (f) => !!f.klientId,
    href: (f) => `/customers/${f.klientId}`,
    slowa: "klient nabywca",
    bezpieczna: true,
  },
  {
    id: "platnosci",
    grupa: "Powiązania",
    nazwa: "Płatności klienta",
    opis: "Portfel i wpłaty — zwrot PayNow jest przy wpłacie.",
    perm: "CUSTOMERS_VIEW",
    kiedy: (f) => !!f.klientId,
    href: (f) => `/customers/${f.klientId}?sekcja=rozliczenia#portfel`,
    slowa: "płatność wpłata portfel zwrot paynow",
    bezpieczna: true,
  },
];
