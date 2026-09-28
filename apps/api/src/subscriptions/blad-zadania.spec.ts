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
});
