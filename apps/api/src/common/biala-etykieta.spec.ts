import { fragmentInfrastruktury, zdradzaInfrastrukture } from '@verris/contracts';
import { dlaKlienta, KOMUNIKAT_OGOLNY, zdradzaPanelSerwera } from './biala-etykieta.js';

describe('biała etykieta — tekst dla klienta', () => {
  it('chowa nazwę panelu serwera, jego komendy, ścieżki i port 2222', () => {
    for (const t of [
      'DirectAdmin package "start" is missing',
      'Błąd DA: brak konta',
      'CustomBuild nie przebudował PHP',
      'Unable to run CMD_API_POP',
      'plik /usr/local/directadmin/data/task.queue',
      'connect ECONNREFUSED 10.0.0.5:2222',
      'Serwer nie odpowiada na porcie 2222',
    ]) {
      expect(zdradzaPanelSerwera(t)).toBe(true);
      expect(dlaKlienta(t)).toBe(KOMUNIKAT_OGOLNY);
    }
  });

  it('chowa oprogramowanie i ścieżki węzła (przegląd tekstów 30.09)', () => {
    for (const t of [
      'CloudLinux PHP Selector: version not installed',
      'cagefsctl: CageFS is not enabled',
      'LVE limit exceeded',
      'selectorctl --set-user-current failed',
      'LiteSpeed nie przeładował konfiguracji',
      '/opt/alt/php83/usr/bin/php: not found',
      'mysql: /usr/local/mariadb-11.4/bin/mariadb',
    ]) {
      expect(dlaKlienta(t)).toBe(KOMUNIKAT_OGOLNY);
    }
  });

  it('przepuszcza zwykły polski tekst — także „nie da się” i słowa z „da”', () => {
    for (const t of ['Tej bazy nie da się usunąć', 'Domena już istnieje', 'Dane zapisane', 'Limit 2222 MB', 'Włącz wtyczkę LiteSpeed Cache', 'Delve w nazwie']) {
      expect(dlaKlienta(t)).toBe(t);
    }
  });
});

describe('audyt Fal 2 — zdradzaInfrastrukture (raport pomigracyjny, eksport RODO)', () => {
  it('łapie fail2ban, exim w odmianie, narzędzia LVE małymi literami, Imunify, IPv6 i węzły z bazy', () => {
    for (const t of [
      'Odblokowaliśmy Twoje IP w fail2ban',
      'kolejka exima była pełna',
      'limity ustawione przez lvectl',
      'lve-stats pokazał szczyt',
      'skan Imunify bez zagrożeń',
      'podgląd na 2a01:4f8:c17:1::5 działa',
      'podgląd na 2001:0db8:0000:0000:0000:0000:0000:0001 działa',
    ]) {
      expect(zdradzaInfrastrukture(t)).toBe(true);
    }
    const wezly = ['t1', 't1.verris.pl', '203.0.113.7', null];
    expect(zdradzaInfrastrukture('Konto stoi na t1.verris.pl.', wezly)).toBe(true);
    expect(zdradzaInfrastrukture('Przenieśliśmy stronę na T1', wezly)).toBe(true);
  });

  it('nie łapie zwykłych tekstów raportu (godziny, polskie słowa, panel.verris.pl)', () => {
    const wezly = ['t1', 't1.verris.pl'];
    for (const t of [
      'Przełączenie o 12:30:00, PageSpeed 92, TTFB 160 ms',
      'Nie da się zmniejszyć obrazów bez utraty jakości — zostawiliśmy oryginały.',
      'Panel: panel.verris.pl, test1 i wt1 bez zmian',
      'Wtyczka LiteSpeed Cache włączona, pamięć podręczna działa',
    ]) {
      expect(zdradzaInfrastrukture(t, wezly)).toBe(false);
    }
  });

  it('audyt Fali 3 — ModSecurity, OpenLiteSpeed, Dovecot, Rspamd; węzeł jako całe słowo (poddomena klienta to nie węzeł)', () => {
    for (const t of ['ModSecurity zablokował żądanie', 'mod_security', 'OpenLiteSpeed', 'Dovecot nie odpowiada', 'rspamd']) {
      expect(zdradzaInfrastrukture(t), t).toBe(true);
    }
    const wezly = ['t1.verris.pl', 'da-t1.wezly.example', '2a01:4f8:c17:1::2'];
    expect(fragmentInfrastruktury('Panel da-t1.wezly.example', wezly)).toBe('da-t1.wezly.example');
    expect(fragmentInfrastruktury('Strona t1.verris.pl.sklep.pl i sklep.t1.verris.pl działają', wezly)).toBeNull();
  });
});
