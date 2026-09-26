import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Każdy link `${…panelUrl}/ścieżka` w kodzie API prowadzi do istniejącej strony
 * któregoś panelu (klient, admin, obsługa).
 *
 * POWÓD (2026-09-23, przy M-24): przypomnienie o odnowieniu kierowało na
 * `/dashboard/subscriptions`, której w panelu klienta nie ma — sześć maili
 * rozliczeniowych prowadziło na 404. Do tego link do zgłoszenia dla obsługi,
 * log audytu, 2FA, portfel i panel floty wskazywały trasy sprzed reorganizacji.
 * Mail to jedyne miejsce, w którym klient klika link, którego nikt z nas nie
 * klika w testach ręcznych.
 */
const APPS = resolve(import.meta.dirname, '../../..');
const PANELE = ['client-panel', 'admin-panel', 'staff-panel'];

function pliki(katalog: string, wzor: RegExp): string[] {
  const out: string[] = [];
  for (const w of readdirSync(katalog)) {
    if (w === 'node_modules' || w === '.next') continue;
    const p = join(katalog, w);
    if (statSync(p).isDirectory()) out.push(...pliki(p, wzor));
    else if (wzor.test(w)) out.push(p);
  }
  return out;
}

function trasy(panel: string): string[][] {
  const app = join(APPS, panel, 'src/app');
  return pliki(app, /^(page\.tsx|route\.ts)$/).map((f) =>
    relative(app, dirname(f))
      .split(sep)
      .filter((s) => s && !/^\(.*\)$/.test(s)),
  );
}

const WSZYSTKIE = PANELE.flatMap(trasy);

function istnieje(sciezka: string): boolean {
  const seg = sciezka.split('/').filter(Boolean);
  return WSZYSTKIE.some(
    (t) => t.length === seg.length && t.every((s, i) => s === seg[i] || s.startsWith('[')),
  );
}

describe('linki w mailach prowadzą do istniejących stron paneli', () => {
  const zrodla = pliki(resolve(import.meta.dirname, '..'), /\.ts$/).filter((f) => !f.endsWith('.spec.ts'));
  const zle: string[] = [];
  for (const f of zrodla) {
    const kod = readFileSync(f, 'utf-8');
    for (const m of kod.matchAll(/[pP]anelUrl\(?\)?\}(\/[A-Za-z0-9_\-/]*(?:\$\{[^}]+\}[A-Za-z0-9_\-/]*)*)/g)) {
      const sciezka = m[1].replace(/\$\{[^}]+\}/g, 'X').replace(/\/+$/, '');
      if (sciezka && !istnieje(sciezka)) zle.push(`${relative(APPS, f)}: ${m[1]}`);
    }
  }

  it('panele mają strony (strażnik nie przechodzi na pustym drzewie)', () => {
    expect(WSZYSTKIE.length).toBeGreaterThan(50);
  });

  it('żaden link nie prowadzi na 404', () => {
    expect(zle).toEqual([]);
  });
});
