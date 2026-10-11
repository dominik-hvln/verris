/**
 * F3.6 — odpowiedzi tras `admin/rozliczenia/*` (apps/api/src/billing/rozliczenia-operatora.service.ts) i etykiety
 * wspólne dla stron „Nieudane płatności”, „Przypomnienia i zawieszenia” oraz karty klienta.
 */
export type ZrodloPlatnosci = "PAYNOW" | "AUTO_DOLADOWANIE" | "STRIPE";

export interface NieudanaPlatnosc {
  id: string;
  zrodlo: ZrodloPlatnosci;
  kiedy: string;
  klient: { id: string; email: string | null };
  kwota: string | null;
  waluta: string;
  status: string;
  powod: string | null;
  referencja: string | null;
  ponowienie: { mozliwe: boolean; uwaga: string };
}

export interface ListaNieudanych {
  wiersze: NieudanaPlatnosc[];
  total: number;
  od: string;
  ucieto: boolean;
}

export interface ProgiWindykacji {
  przypomnieniaDniPrzed: number[];
  karencjaDni: number;
  zawieszenieDoWygasnieciaDni: number;
  retencjaKontaDni: number;
}

export type EtapWindykacji = "bez-windykacji" | "odnowienie" | "zalegla" | "zawieszona";

export interface UslugaWindykacji {
  id: string;
  userId: string;
  usluga: string;
  status: string;
  zrodlo: string;
  koniecOkresu: string | null;
  obietnicaDo: string | null;
  ostatniaNieudana: string | null;
  kwotaOdnowienia: string | null;
  brakuje: string | null;
  etap: EtapWindykacji;
  probaOdnowienia: string | null;
  zawieszenie: string | null;
  wygasniecie: string | null;
  uwaga: string;
}

export interface WindykacjaKlienta {
  progi: ProgiWindykacji;
  saldo: string;
  uslugi: UslugaWindykacji[];
  przypomnienia: { id: string; kiedy: string; akcja: string; etykieta: string; subscriptionId: string | null; kwota: string | null; brakuje: string | null }[];
}

export interface WindykacjaFloty {
  progi: ProgiWindykacji;
  wiersze: (UslugaWindykacji & { email: string | null; saldo: string })[];
  ucieto: boolean;
}

export interface RuchyPortfela {
  saldo: string;
  waluta: string;
  subkonto: boolean;
  total: number;
  wiersze: {
    id: string;
    type: string;
    status: string;
    amount: string;
    currency: string;
    balanceAfter: string;
    description: string | null;
    paymentProvider: string | null;
    paymentRef: string | null;
    faktura: { id: string; number: string } | null;
    paynowDoZwrotu: string | null;
    createdAt: string;
  }[];
}

export const ZRODLO_PLATNOSCI: Record<ZrodloPlatnosci, string> = {
  PAYNOW: "Paynow",
  AUTO_DOLADOWANIE: "Auto-doładowanie",
  STRIPE: "Karta (odnowienie)",
};

export const STATUS_PLATNOSCI: Record<string, { t: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  REJECTED: { t: "odrzucona", ton: "crit" },
  ERROR: { t: "błąd", ton: "crit" },
  EXPIRED: { t: "wygasła", ton: "warn" },
  ABANDONED: { t: "porzucona", ton: "warn" },
  ODRZUCONA: { t: "odrzucona", ton: "crit" },
  OPLACONA_POZNIEJ: { t: "opłacona później", ton: "ok" },
};

export const ETAP: Record<EtapWindykacji, { t: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  "bez-windykacji": { t: "bez windykacji", ton: "muted" },
  odnowienie: { t: "przed odnowieniem", ton: "warn" },
  zalegla: { t: "zaległa", ton: "crit" },
  zawieszona: { t: "zawieszona", ton: "crit" },
};

/** Kanał wpłaty w księdze (WalletTransaction.paymentProvider). */
export const KANAL: Record<string, string> = {
  STRIPE: "karta",
  PAYNOW: "Paynow",
  PRZELEW: "przelew",
  MANUAL: "obsługa",
  PROMO: "kod promocyjny",
  EKO: "punkty EKO",
};

const STREFA = "Europe/Warsaw";
export const kiedy = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: STREFA, dateStyle: "short", timeStyle: "short" }) : "—";

/** Data zdarzenia harmonogramu: przeszła = „w najbliższym przebiegu” (harmonogram biegnie co godzinę). */
export function kiedyHarmonogram(iso: string | null | undefined, teraz: number): string {
  if (!iso) return "—";
  return new Date(iso).getTime() <= teraz ? "w najbliższym przebiegu (do godziny)" : kiedy(iso);
}

export function opisProgow(p: ProgiWindykacji): string {
  const karencja = p.karencjaDni === 0 ? "bez karencji — zawieszenie z końcem opłaconego okresu" : `karencja ${p.karencjaDni} dni`;
  return `Przypomnienia ${p.przypomnieniaDniPrzed.join(", ")} dni przed odnowieniem; ${karencja}; wygaśnięcie ${p.zawieszenieDoWygasnieciaDni} dni po zawieszeniu, usunięcie konta po kolejnych ${p.retencjaKontaDni} dniach.`;
}
