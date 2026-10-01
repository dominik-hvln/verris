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
    // Polskie „da” to nie skrót panelu — `/\bDA\b/i` chował czytelny komunikat za ogólnym.
    expect(bladZadaniaDlaKlienta('x', '[php-set] BŁĄD: nie da się zapisać php.ini')).toBe('nie da się zapisać php.ini');
    expect(bladZadaniaDlaKlienta('x', '[ssl] BŁĄD: CMD_API_SSL zwrócił błąd')).toMatch(/^Operacja nie powiodła się/);
  });
  it('ogon logu sklejony w jedną linię — bez znaczników technicznych po komunikacie (D3 01.10, PrestaShop)', () => {
    const sklejony = '=== Verris task t (kind=APP_INSTALL) === --- [app-install] Przywrócono katalog. [app-install] BŁĄD: Instalacja nie powiodła się — katalog domeny jest taki jak przed instalacją. [VERRIS_APP] bez_zmian=1';
    expect(bladZadaniaDlaKlienta(sklejony)).toBe('Instalacja nie powiodła się — katalog domeny jest taki jak przed instalacją.');
    expect(bladZadaniaDlaKlienta('x [staging-sync] ERROR: Kopiowanie nie powiodło się. [verris-task-run] Task FAILED')).toBe('Kopiowanie nie powiodło się.');
  });
});
