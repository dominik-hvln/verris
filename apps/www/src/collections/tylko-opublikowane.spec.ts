import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { Posts } from './Posts';
import { Pages } from './Pages';
import { OPUBLIKOWANE } from './tylko-opublikowane';

/** Audyt bezpieczeństwa 13.10: szkice Posts/Pages nie mogą być czytelne dla anonima ani na publicznym froncie. */
describe('Szkice Payload — tylko opublikowane dla anonima', () => {
  const read = (c: typeof Posts) => c.access?.read as (a: { req: { user?: unknown } }) => unknown;

  it.each([['posts', Posts], ['pages', Pages]])('%s: anonim dostaje warunek _status=published, redaktor wszystko', (_n, c) => {
    expect(read(c)({ req: {} })).toEqual(OPUBLIKOWANE);
    expect(read(c)({ req: { user: { id: 1 } } })).toBe(true);
  });

  it('każde payload.find po wpisy/strony na froncie filtruje opublikowane', () => {
    const pliki: string[] = [];
    const chodz = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) chodz(p);
        else if (/\.(ts|tsx)$/.test(n) && !/\.spec\./.test(n)) pliki.push(p);
      }
    };
    chodz(join(__dirname, '..', 'app'));
    const bez: string[] = [];
    for (const p of pliki) {
      const src = readFileSync(p, 'utf8');
      const wywolania = src.split('payload.find(').slice(1);
      for (const w of wywolania) {
        const arg = w.slice(0, w.indexOf('})') + 1);
        if (/collection: '(posts|pages)'/.test(arg) && !/OPUBLIKOWANE/.test(arg)) bez.push(p);
      }
    }
    expect(bez).toEqual([]);
  });
});
