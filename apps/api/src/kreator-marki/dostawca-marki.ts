import { Injectable, Logger } from '@nestjs/common';
import { faviconSvg, migawkaZMarki, MAKS_SVG_LOGO, type MigawkaMarki } from '@verris/kreator';
import type { DostawcaMarki, MarkaKonta } from '../kreator/marka-dostawca.js';
import { KreatorMarkiService } from './kreator-marki.service.js';
import { ukladyMarki } from './dane-marki.js';

/**
 * Kreator marki (paczka 131) – prawdziwy dostawca marki dla Kreatora stron (token DOSTAWCA_MARKI, podpinany
 * w kreator.module.ts zamiast BrakModuluMarki). Migawka = logo na krzywych (bez metadanych – strona pokazuje je
 * inline), wersje pionowa/sygnet/negatyw, gdy marka je ma, favicon SVG oraz PNG i obraz OG pod publicznym adresem
 * https (token HMAC – bez klucza aplikacji pola są pomijane).
 *
 * Okres próbny: decyzja właściciela otwarta – zachowujemy spójność z Kreatorem stron: w próbie marka na stronie
 * działa w podglądzie, a publikacja strony i tak jest zablokowana w próbie (wersja kreatora 'proba').
 */
@Injectable()
export class DostawcaMarkiVerris implements DostawcaMarki {
  private readonly logger = new Logger(DostawcaMarkiVerris.name);

  constructor(private readonly marki: KreatorMarkiService) {}

  dostepna(userId: string): Promise<boolean> {
    return this.marki.dostepna(userId);
  }

  async lista(userId: string): Promise<MarkaKonta[]> {
    if (!(await this.marki.dostepna(userId))) return [];
    return this.marki.markiKonta(userId);
  }

  async migawka(userId: string, markaId: string): Promise<MigawkaMarki | null> {
    const z = await this.marki.markaDoStrony(userId, markaId);
    if (!z) return null;
    const { r, m } = z;
    const g = this.marki.generator;
    const ksztalty = await g.ksztalty(m);
    const uklady = ukladyMarki(m);
    const svg = async (uklad: (typeof uklady)[number], wariant: 'kolor' | 'negatyw') => {
      const s = (await g.logo(m, uklad, wariant, { ksztalty, metadane: false, tlo: false })).svg;
      return s.length <= MAKS_SVG_LOGO ? s : undefined;
    };
    const glowny = uklady[0]!;
    const logoPoziome = await svg(glowny, 'kolor');
    if (!logoPoziome) {
      this.logger.warn(`Marka ${markaId}: logo poziome przekracza ${MAKS_SVG_LOGO} znaków – migawka niedostępna`);
      return null;
    }
    const pionowe = uklady.includes('pionowy') ? await svg('pionowy', 'kolor') : undefined;
    const sygnet = uklady.includes('sygnet') && glowny !== 'sygnet' ? await svg('sygnet', 'kolor') : undefined;
    const negatyw = await svg(glowny, 'negatyw');
    const faviconPng = this.marki.adresPubliczny(r.id, 'favicon.png');
    const obrazOg = this.marki.adresPubliczny(r.id, 'og.png');
    return migawkaZMarki(m, {
      markaId: r.id,
      wersja: r.wersja,
      logoPoziome,
      ...(pionowe ? { logoPionowe: pionowe } : {}),
      ...(sygnet ? { sygnet } : {}),
      ...(negatyw ? { logoNegatyw: negatyw } : {}),
      // wariant „kafel” – bez <style> (biała lista SVG migawki nie przyjmuje stylów; tryb ciemny ma favicon.svg z eksportu)
      favicon: faviconSvg(await g.wnetrzeFavicon(m), m.projekt.kolory, { kafel: true }),
      ...(faviconPng ? { faviconPng } : {}),
      ...(obrazOg ? { obrazOg } : {}),
    });
  }
}
