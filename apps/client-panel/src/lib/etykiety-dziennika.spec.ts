import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ETYKIETY_DZIENNIKA } from './etykiety-dziennika';

// Każde działanie, które API pokazuje w „Aktywności konta” (lista KONTO w users.service.ts), ma ludzką
// nazwę — inaczej klient widzi tylko „Zmiana na koncie”.
describe('G-18 — etykiety dziennika konta', () => {
  it('lista KONTO z API ma polskie etykiety', () => {
    const src = readFileSync(join(__dirname, '../../../api/src/users/users.service.ts'), 'utf8');
    const blok = /const KONTO = \[([\s\S]*?)\];/.exec(src)![1];
    const akcje = [...blok.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(akcje).toContain('PASSWORD_CHANGED');
    expect(akcje.filter((a) => !ETYKIETY_DZIENNIKA[a])).toEqual([]);
  });
});
