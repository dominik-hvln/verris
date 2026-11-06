import { sprawdzWhiteLabel } from './filtr-white-label.js';

/** Filtr white label na wyjściu asystenta www — działa niezależnie od promptu. */
describe('filtr white label asystenta www', () => {
  it.each([
    ['Panel to DirectAdmin.', 'nazwa oprogramowania panelu'],
    ['Działa na D i r e c t A d m i n pod spodem.', 'nazwa oprogramowania panelu'],
    ['używamy directadmina', 'nazwa oprogramowania panelu'],
    ['DIRECT-ADMIN', 'nazwa oprogramowania panelu'],
    ['Panel DA jest schowany.', 'skrót nazwy panelu'],
    ['Kompilacja przez Custom Build.', 'nazwa oprogramowania serwera'],
    ['Izolacja to Cloud-Linux z CageFS.', 'nazwa systemu serwera'],
    ['Antywirus Imunify 360.', 'nazwa oprogramowania serwera'],
    ['Wejdź na port 2222.', 'port panelu serwera'],
    ['Serwer ma adres 95.217.10.4.', 'adres IPv4'],
    ['Adres 2a01:4f9:c010:1234::1 działa.', 'adres IPv6'],
    ['Serwery stoją u HETZNERA.', 'dostawca serwerów'],
    ['Centrum danych w Falkenstein.', 'lokalizacja serwerów'],
    ['Serwery w Finlandii, w Helsinkach.', 'lokalizacja serwerów'],
    ['Dane trzymamy w Niemczech.', 'lokalizacja serwerów'],
    ['Hosting na serwerach OVH.', 'dostawca serwerów'],
    ['Twoje konto jest na t1.', 'nazwa serwera'],
    ['Węzeł t2.verris.pl obsługuje pocztę.', 'nazwa serwera'],
    ['Zaloguj się na node-3.verris.pl.', 'wewnętrzny adres serwera'],
  ])('blokuje: %s', (tekst, powod) => {
    const w = sprawdzWhiteLabel(tekst);
    expect(w.ok).toBe(false);
    expect(w.powody).toContain(powod);
  });

  it.each([
    'Hosting kosztuje 45,00 zł brutto (36,59 zł netto) miesięcznie.',
    'Oddzwonimy w dni robocze 9–17, zwykle tego samego dnia. Rozmowa trwa do 20:00:00.',
    'PHP 8.3 i 8.2, MariaDB, LiteSpeed Enterprise, ImunifyAV i Redis są w pakiecie.',
    'Dane są przechowywane w Unii Europejskiej. Szczegóły na https://verris.pl/dokumenty i pomoc.verris.pl.',
    'Panel jest pod panel.verris.pl, a status pod status.verris.pl.',
    'IMAP port 993, SMTP 465 albo 587.',
    'Kopia z każdego z ostatnich 30 dni, 7 kopii na serwerze. Dodaj rekord TXT.',
    'Data rozpoczęcia: 01.11.2026, dostępność 99,5%.',
    'Dziękuję, damy radę – to dalej działa.',
  ])('przepuszcza zwykłą odpowiedź: %s', (tekst) => {
    expect(sprawdzWhiteLabel(tekst)).toEqual({ ok: true, powody: [] });
  });
});
