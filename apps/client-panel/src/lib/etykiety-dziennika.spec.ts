import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ETYKIETY_DZIENNIKA } from './etykiety-dziennika';

// Każde działanie, które API pokazuje w „Aktywności konta” (lista KONTO w users.service.ts), ma ludzką
// nazwę — inaczej klient widzi tylko „Zmiana na koncie”.
describe('G-18 – etykiety dziennika konta', () => {
  it('lista KONTO z API ma polskie etykiety', () => {
    const src = readFileSync(join(__dirname, '../../../api/src/users/users.service.ts'), 'utf8');
    const blok = /const KONTO = \[([\s\S]*?)\];/.exec(src)![1];
    const akcje = [...blok.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(akcje).toContain('PASSWORD_CHANGED');
    expect(akcje.filter((a) => !ETYKIETY_DZIENNIKA[a])).toEqual([]);
  });

  // Dziennik konta pokazuje każde działanie HOSTING_* (users.service.ts: startsWith 'HOSTING_').
  it('działania HOSTING_* z audit.actions.ts mają polskie etykiety (m.in. publikacja strony z kreatora)', () => {
    const src = readFileSync(join(__dirname, '../../../api/src/common/audit/audit.actions.ts'), 'utf8');
    const blok = /export const HostingResourceActions = \{([\s\S]*?)\n\}/.exec(src)![1];
    const akcje = [...blok.matchAll(/^\s+(HOSTING_[A-Z_]+):/gm)].map((m) => m[1]);
    expect(akcje).toContain('HOSTING_KREATOR_PUBLISHED');
    expect(akcje.filter((a) => !ETYKIETY_DZIENNIKA[a])).toEqual([]);
    expect(ETYKIETY_DZIENNIKA.HOSTING_KREATOR_PUBLISHED).toBe('Opublikowano stronę z kreatora');
    expect(ETYKIETY_DZIENNIKA.HOSTING_KREATOR_UNPUBLISHED).toBe('Wycofano publikację strony z kreatora');
  });
});
