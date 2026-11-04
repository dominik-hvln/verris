/**
 * A2-09 + decyzja 10 Dominika (3.11.2026): dane sprzedawcy na verris.pl — jedno źródło dla stopki, /kontakt,
 * strony głównej, /o-nas, llms.txt i JSON-LD. Pełny adres i e-mail (art. 5 ust. 2 u.ś.u.d.e., art. 12 ust. 1
 * pkt 2–3 u.p.k.). Numeru telefonu nie publikujemy — zamiast niego prośba o telefon na /kontakt (dni robocze 9–17).
 * Te same dane co w panelu klienta (apps/client-panel/.../services/new/informacje-przedumowne.tsx) i w regulaminie.
 */
export const SPRZEDAWCA = {
  nazwa: 'HVLN Dominik Kowalski',
  ulica: 'Zacisze 2A',
  kodPocztowy: '65-775',
  miasto: 'Zielona Góra',
  nip: '9292069367',
  regon: '521024260',
  email: 'kontakt@verris.pl',
} as const;

/** „Zacisze 2A, 65-775 Zielona Góra” */
export const ADRES_SPRZEDAWCY = `${SPRZEDAWCA.ulica}, ${SPRZEDAWCA.kodPocztowy} ${SPRZEDAWCA.miasto}`;

/** Jedna linia do stopki i tekstów: nazwa, adres, NIP, REGON, e-mail. */
export const DANE_SPRZEDAWCY = `${SPRZEDAWCA.nazwa}, ${ADRES_SPRZEDAWCY} · NIP ${SPRZEDAWCA.nip} · REGON ${SPRZEDAWCA.regon} · ${SPRZEDAWCA.email}`;
