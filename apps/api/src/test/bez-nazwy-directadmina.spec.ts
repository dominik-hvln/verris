import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * White label (decyzja właściciela 2026-09-24): klient nie widzi nazwy DirectAdmina — ani na verris.pl,
 * ani w panelu, mailach czy dokumentach prawnych. Mówimy „panel Verris” / „panel hostingowy”.
 * Nie twierdzimy przy tym, że silnik hostingu jest nasz (docs/VERRIS.md, Decyzje).
 *
 * Komentarze w kodzie się nie liczą. Wyjątek: kreator migracji, gdzie DirectAdmin to panel
 * u POPRZEDNIEGO dostawcy klienta (cyberFolks, Seohost) — to informacja dla klienta, nie o nas.
 */
const KORZEN = join(__dirname, '..', '..', '..', '..');
const WYJATKI = new Set(['apps/client-panel/src/app/dashboard/migrations/migration-wizard.tsx']);

function pliki(katalog: string, rozszerzenia: RegExp): string[] {
  return readdirSync(katalog).flatMap((n) => {
    const p = join(katalog, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : pliki(p, rozszerzenia);
    return rozszerzenia.test(n) && !n.includes('.spec.') && !n.startsWith('.fuse') ? [p] : [];
  });
}

const ZRODLA = [
  ...pliki(join(KORZEN, 'apps/www/src'), /\.(ts|tsx)$/),
  ...pliki(join(KORZEN, 'apps/client-panel/src'), /\.tsx$/),
  ...pliki(join(KORZEN, 'apps/api/src/mail/templates'), /\.ts$/),
  join(KORZEN, 'apps/api/src/abuse/abuse.templates.ts'),
  join(KORZEN, 'apps/api/src/leads/leads.templates.ts'),
  ...['terms', 'privacy', 'cookies', 'dpa', 'subprocessors'].map((d) => join(KORZEN, `docs/legal/drafts/${d}.md`)),
  join(KORZEN, 'docs/legal/consumer-info.md'),
];

describe('White label — nazwa DirectAdmina nie trafia do klienta', () => {
  it('teksty dla klienta nie zawierają „DirectAdmin”', () => {
    const trafienia = ZRODLA.filter((p) => !WYJATKI.has(relative(KORZEN, p))).flatMap((p) =>
      readFileSync(p, 'utf8')
        .split('\n')
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => l.includes('DirectAdmin') && !/^\s*(\/\/|\*|\/\*)/.test(l))
        .map(({ i }) => `${relative(KORZEN, p)}:${i + 1}`),
    );
    expect(trafienia).toEqual([]);
  });
});
