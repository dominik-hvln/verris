import { pobranaKopia } from './kopia-offsite';

/**
 * Weryfikacja 11.10 — „Pobierz na serwer” kończyło się komunikatem „Wybierz je z listy kopii powyżej”, choć
 * archiwum administratora konta (`user.admin.<login>.tar.zst`) na liście kopii klienta się nie pojawia.
 */
describe('pobranaKopia', () => {
  const lista = ['backup-Oct-11-2026-1.tar.zst', 'verris-wp-d3.hvln.pl-20261011.tar.gz'];

  it('kopia administratora konta spoza listy — przywraca obsługa, nie „wybierz z listy”', () => {
    expect(pobranaKopia('user.admin.d3hvln.tar.zst', lista)).toBe('przez-obsluge');
  });

  it('archiwum, które jest na liście kopii — klient przywraca je sam', () => {
    expect(pobranaKopia('backup-Oct-11-2026-1.tar.zst', lista)).toBe('na-liscie');
    expect(pobranaKopia('backup-Oct-11-2026-1.tar.zst', [])).toBe('przez-obsluge');
  });
});
