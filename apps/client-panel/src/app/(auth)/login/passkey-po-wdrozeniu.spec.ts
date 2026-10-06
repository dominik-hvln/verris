/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { odswiezPoWdrozeniu } from '@verris/ui';

/**
 * D3 06.10: po wylogowaniu z bezczynności karta sprzed wdrożenia pokazywała przy logowaniu passkey surowe
 * „Server Action … was not found on the server” — formularz łapie wyjątek sam, więc granica błędu
 * (useOdswiezPoWdrozeniu) go nie widziała. Teraz każdy przycisk passkey przeładowuje stronę.
 */
describe('logowanie passkey na karcie sprzed wdrożenia', () => {
  // jsdom nie pozwala podmienić location.reload (wypisuje „not implemented”) — przeładowanie widać po
  // znaczniku w sessionStorage i wyniku funkcji.
  beforeEach(() => sessionStorage.clear());
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  afterAll(() => errSpy.mockRestore());

  it('nieaktualna akcja → przeładowanie (raz na minutę), inny błąd → bez przeładowania', () => {
    expect(odswiezPoWdrozeniu(new Error('NotAllowedError'))).toBe(false);
    expect(sessionStorage.getItem('verris-odswiez-po-wdrozeniu')).toBeNull();
    expect(odswiezPoWdrozeniu(new Error('Server Action "403a4b5b" was not found on the server.'))).toBe(true);
    expect(sessionStorage.getItem('verris-odswiez-po-wdrozeniu')).not.toBeNull();
    expect(odswiezPoWdrozeniu(new Error('Server Action "403a4b5b" was not found on the server.'))).toBe(false);
  });

  it.each([
    'apps/client-panel/src/app/(auth)/login/passkey-login-button.tsx',
    'apps/admin-panel/src/app/login/passkey-login-button.tsx',
    'apps/staff-panel/src/app/login/passkey-login-button.tsx',
  ])('%s: przed pokazaniem błędu woła odswiezPoWdrozeniu', (plik) => {
    const kod = readFileSync(join(__dirname, '..', '..', '..', '..', '..', '..', plik), 'utf8');
    const blokCatch = kod.slice(kod.indexOf('} catch (err) {'), kod.indexOf('setError(', kod.indexOf('} catch (err) {')));
    expect(blokCatch).toMatch(/if \(odswiezPoWdrozeniu\(err\)\) return;/);
  });
});
