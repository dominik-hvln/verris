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
