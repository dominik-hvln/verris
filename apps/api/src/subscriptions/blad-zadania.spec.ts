import { bladZadaniaDlaKlienta } from './blad-zadania.js';

describe('bladZadaniaDlaKlienta', () => {
  it('bierze ostatnią linię BŁĄD/ERROR, bez ścieżek i ID zadania', () => {
    expect(bladZadaniaDlaKlienta('=== Verris task x ===\nCommand: /usr/local/bin/a.sh\n[wp-install] ERROR: pierwszy\n[wp-install] ERROR: brak PHP CLI')).toBe('brak PHP CLI');
    expect(bladZadaniaDlaKlienta('zły kod 3', '[waf-apply] BŁĄD: reguły nie weszły')).toBe('reguły nie weszły');
  });
  it('bez linii dla klienta — komunikat ogólny; bez błędu — null', () => {
    expect(bladZadaniaDlaKlienta('Brak heartbeat z węzła… journalctl -u verris-task@x')).toMatch(/^Operacja nie powiodła się/);
    expect(bladZadaniaDlaKlienta(null)).toBeNull();
  });
  it('white label: linia z DirectAdmin/DA/CustomBuild → komunikat ogólny (retest D3 29.09 — staging)', () => {
    expect(bladZadaniaDlaKlienta('x', '[staging-sync] ERROR: czy subdomena staging.firma.pl istnieje w DA?')).toMatch(/^Operacja nie powiodła się/);
    expect(bladZadaniaDlaKlienta('x', '[restore] BŁĄD: DirectAdmin nie założył konta')).toMatch(/^Operacja nie powiodła się/);
    expect(bladZadaniaDlaKlienta('x', '[htaccess] BŁĄD: DATA w pliku jest błędna')).toBe('DATA w pliku jest błędna');
  });
});
