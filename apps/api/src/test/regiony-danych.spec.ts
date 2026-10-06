import { REGIONY_DANYCH } from '@verris/contracts';
import { KODY_REGIONOW } from '../servers/regiony.js';

/** P-13 — API przyjmuje dokładnie te regiony, które panel umie opisać klientowi. */
it('lista regionów API = lista opisów w panelu', () => {
  expect([...KODY_REGIONOW].sort()).toEqual(Object.keys(REGIONY_DANYCH).sort());
});

/** Decyzja właściciela 06.10: nazwy dostawcy centrum danych nie pokazujemy nigdzie w UI (zostaje w dokumentach prawnych). */
it('opisy lokalizacji widoczne dla klienta bez nazwy dostawcy centrum danych', async () => {
  const { LOKALIZACJA_OGOLNA } = await import('@verris/contracts');
  for (const opis of [...Object.values(REGIONY_DANYCH), LOKALIZACJA_OGOLNA]) expect(opis).not.toMatch(/hetzner/i);
});
