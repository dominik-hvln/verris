import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import type { StanWp } from './wp-update.service';

/**
 * I-07 — podatności wtyczek, motywów i rdzenia WordPressa. Źródło: Wordfence Intelligence Vulnerability
 * Data Feed v3, Scanner Feed (wordfence.com/help → „V3: Accessing and Consuming the Vulnerability Data
 * Feed”): darmowy także do użytku komercyjnego, klucz API w nagłówku `Authorization: Bearer`.
 * Warunek licencji Defiant: przy każdym pokazanym rekordzie link do niego i nota o prawach autorskich.
 *
 * Odświeżamy raz na dobę do tabeli WpPodatnosc; dopasowanie to porównanie wersji z ostatniego
 * sprawdzenia strony (zadanie WP_UPDATE check — slug i wersja z `wp plugin/theme list`).
 */
const FEED = 'https://www.wordfence.com/api/intelligence/v3/vulnerabilities/scanner';
const TYPY = new Set(['core', 'plugin', 'theme']);
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,199}$/;
export const NOTA_WORDFENCE = 'Dane o podatnościach: Wordfence Intelligence, Copyright 2012–2026 Defiant Inc.';
export const LICENCJA_WORDFENCE = 'https://www.wordfence.com/wti-community-edition-terms-and-conditions/';

export type Zakres = { od: string; odWlacznie: boolean; do: string; doWlacznie: boolean };
export type Podatnosc = {
  typ: 'core' | 'plugin' | 'theme';
  slug: string;
  nazwa: string;
  wersja: string;
  tytul: string;
  poprawione: string[];
  link: string;
};

@Injectable()
export class WpPodatnosciService {
  private readonly logger = new Logger(WpPodatnosciService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Codziennie 05:40 UTC. Bez klucza — nic (skan pokazuje wtedy „baza podatności niepodłączona”). */
  @Cron('40 5 * * *')
  async odswiez(): Promise<number | null> {
    const key = this.config.get<string>('WORDFENCE_API_KEY');
    if (!key) return null;
    const res = await fetch(FEED, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) {
      this.logger.warn(`Wordfence feed: HTTP ${res.status}`);
      return null;
    }
    const wiersze = wierszeZFeedu((await res.json()) as Record<string, unknown>);
    if (wiersze.length < 1000) {
      // Pełny feed ma dziesiątki tysięcy rekordów — mniej to uszkodzona odpowiedź, nie czyścimy bazy.
      this.logger.warn(`Wordfence feed: tylko ${wiersze.length} rekordów — pomijam podmianę`);
      return null;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.wpPodatnosc.deleteMany({});
      for (let i = 0; i < wiersze.length; i += 2000) await tx.wpPodatnosc.createMany({ data: wiersze.slice(i, i + 2000) });
    }, { timeout: 120_000 });
    this.logger.log(`Wordfence feed: ${wiersze.length} wpisów`);
    return wiersze.length;
  }

  async podlaczona(): Promise<boolean> {
    return Boolean(this.config.get<string>('WORDFENCE_API_KEY')) && (await this.prisma.wpPodatnosc.count({ take: 1 })) > 0;
  }

  /** Podatności, w których zakresie mieści się zainstalowana wersja rdzenia, wtyczki albo motywu. */
  async dlaStanu(stan: StanWp | null): Promise<Podatnosc[]> {
    if (!stan) return [];
    const wtyczki = stan.plugins.map((p) => p.name).filter((s) => SLUG_RE.test(s));
    const motywy = stan.themes.map((p) => p.name).filter((s) => SLUG_RE.test(s));
    const rekordy = await this.prisma.wpPodatnosc.findMany({
      where: { OR: [{ typ: 'core' }, { typ: 'plugin', slug: { in: wtyczki } }, { typ: 'theme', slug: { in: motywy } }] },
    });
    const zainstalowane = new Map<string, { nazwa: string; wersja: string }>();
    zainstalowane.set('core:wordpress', { nazwa: 'WordPress', wersja: stan.version });
    for (const p of stan.plugins) zainstalowane.set(`plugin:${p.name}`, { nazwa: p.title || p.name, wersja: p.version });
    for (const p of stan.themes) zainstalowane.set(`theme:${p.name}`, { nazwa: p.title || p.name, wersja: p.version });
    const out: Podatnosc[] = [];
    for (const r of rekordy) {
      const z = zainstalowane.get(r.typ === 'core' ? 'core:wordpress' : `${r.typ}:${r.slug}`);
      if (!z || !z.wersja) continue;
      if (!(r.zakresy as Zakres[]).some((zk) => wZakresie(z.wersja, zk))) continue;
      out.push({ typ: r.typ as Podatnosc['typ'], slug: r.slug, nazwa: z.nazwa, wersja: z.wersja, tytul: r.tytul, poprawione: r.poprawione, link: r.link });
    }
    return out;
  }
}

/** Feed → wiersze tabeli; śmieci i rekordy „informational” (bez realnego wpływu) pomijamy. */
export function wierszeZFeedu(feed: Record<string, unknown>) {
  const out: Array<{ id: string; typ: string; slug: string; tytul: string; zakresy: Zakres[]; poprawione: string[]; link: string; opublikowano: Date | null }> = [];
  for (const [uuid, v] of Object.entries(feed ?? {})) {
    const r = (v ?? {}) as Record<string, unknown>;
    if (r.informational === true || !Array.isArray(r.software)) continue;
    const refs = (Array.isArray(r.references) ? r.references : [])
      .filter((x): x is string => typeof x === 'string' && /^https?:\/\/www\.wordfence\.com\//.test(x))
      .map((x) => x.replace(/^http:/, 'https:'));
    const link = refs[0] ?? `https://www.wordfence.com/threat-intel/vulnerabilities/id/${encodeURIComponent(uuid)}`;
    const pub = typeof r.published === 'string' ? new Date(`${r.published.replace(' ', 'T')}Z`) : null;
    for (const sw of r.software as Array<Record<string, unknown>>) {
      const typ = String(sw?.type ?? '');
      const slug = String(sw?.slug ?? '').toLowerCase();
      if (!TYPY.has(typ) || !SLUG_RE.test(slug) || sw?.informational === true) continue;
      const zakresy = Object.values((sw.affected_versions ?? {}) as Record<string, Record<string, unknown>>).map((a) => ({
        od: String(a?.from_version ?? '*'),
        odWlacznie: a?.from_inclusive !== false,
        do: String(a?.to_version ?? '*'),
        doWlacznie: a?.to_inclusive !== false,
      }));
      if (!zakresy.length) continue;
      out.push({
        id: `${uuid}:${typ}:${slug}`.slice(0, 300),
        typ,
        slug,
        tytul: String(r.title ?? '').slice(0, 300),
        zakresy,
        poprawione: (Array.isArray(sw.patched_versions) ? sw.patched_versions : []).map(String).slice(0, 10),
        link,
        opublikowano: pub && !Number.isNaN(pub.getTime()) ? pub : null,
      });
    }
  }
  return out;
}

export function wZakresie(wersja: string, z: Zakres): boolean {
  if (z.od !== '*') {
    const c = porownajWersje(wersja, z.od);
    if (c < 0 || (c === 0 && !z.odWlacznie)) return false;
  }
  if (z.do !== '*') {
    const c = porownajWersje(wersja, z.do);
    if (c > 0 || (c === 0 && !z.doWlacznie)) return false;
  }
  return true;
}

/**
 * Porównanie wersji w duchu PHP version_compare (tego używa WordPress): segmenty liczbowe liczbowo,
 * brakujący segment = 0, a oznaczenia przedpremierowe (dev < alpha < beta < RC) są niżej niż wydanie.
 */
export function porownajWersje(a: string, b: string): number {
  const WAGA: Record<string, number> = { dev: -4, alpha: -3, a: -3, beta: -2, b: -2, rc: -1 };
  const czesci = (v: string) =>
    v.toLowerCase().replace(/([a-z]+)/g, '.$1.').split(/[.\-+_]+/).filter(Boolean)
      .map((s) => (/^\d+$/.test(s) ? Number(s) : (WAGA[s] ?? -5)));
  const x = czesci(a);
  const y = czesci(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] ?? 0;
    const q = y[i] ?? 0;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}
