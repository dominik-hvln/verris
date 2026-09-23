import { REGIONY_DANYCH } from '@verris/contracts';
import { KODY_REGIONOW } from '../servers/regiony';

/** P-13 — API przyjmuje dokładnie te regiony, które panel umie opisać klientowi. */
it('lista regionów API = lista opisów w panelu', () => {
  expect([...KODY_REGIONOW].sort()).toEqual(Object.keys(REGIONY_DANYCH).sort());
});
