import type { StatusZgloszenia, ZgloszenieRow } from "./actions";

/** Otwarta beta — zgłoszenia z verris.pl/beta: etykiety i źródło w tabeli panelu admina → Testy (beta) (moduł serwerowy, bez "use client"). */
export const ETYKIETY_ZAKRESU: Record<string, string> = {
  WORDPRESS: "WordPress",
  SKLEP: "Sklep",
  STRONY_DLA_KLIENTOW: "Strony dla klientów",
  POCZTA: "Poczta",
  INNE: "Inne",
};

export const ETYKIETY_STATUSU: Record<StatusZgloszenia, string> = {
  NIEPOTWIERDZONE: "Niepotwierdzone",
  NOWE: "Nowe",
  ZAPROSZONE: "Zaproszone",
  ODRZUCONE: "Odrzucone",
};

export const opisZakresu = (zakres: string[]) => zakres.map((z) => ETYKIETY_ZAKRESU[z] ?? z).join(", ");

/** Źródło z UTM: „meta / meta-leadgen-hosting-202611 / b-firmy” (utm_content = kreacja i zestaw); bez UTM — kreska. */
export const zrodloZgloszenia = (z: Pick<ZgloszenieRow, "zrodlo">) =>
  [z.zrodlo?.source, z.zrodlo?.campaign, z.zrodlo?.content].filter(Boolean).join(" / ") || "–";

/** Link do strony testera tylko dla http(s) — adres pochodzi z formularza publicznego. */
export const bezpiecznyLink = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);
