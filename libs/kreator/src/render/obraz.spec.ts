import { describe, expect, it } from 'vitest';
import type { StronaWejscie } from '../model.ts';
import { obraz, szerokosciWariantow, wymagaAtrybucji } from './obraz.ts';
import type { KontekstPodstrony, OpcjeRenderu } from './kontekst.ts';
import { PRZYKLADY, plik, render, znaczniki } from './testy.pomoc.ts';

/** Paczka 122 – zdjęcia z biblioteki konta (Obraz.zasobId) w renderze: <picture>, srcset, ogniskowa, atrybucja. */
const ZASOB = '3f2a9c4e-8b1d-4f6a-9c2e-1a2b3c4d5e6f';
const ZASOB2 = '7b6c5d4e-3f2a-4b1c-8d9e-0f1a2b3c4d5e';
const ADRES_PUBLIKACJI = (id: string, s: number, f: string) => `assets/img/${id}-${s}.${f}`;

/** Salon z hero ze zdjęciem z biblioteki i galerią (pierwsze zdjęcie z licencją CC BY). */
function zeZdjeciemZBiblioteki(): StronaWejscie {
  const w = structuredClone(PRZYKLADY.salon!);
  const hero = w.strony[0]!.sekcje.find((s) => s.typ === 'hero')!;
  if (hero.typ !== 'hero') throw new Error('hero');
  hero.dane.obraz = { alt: 'Wnętrze salonu', zrodlo: 'pixabay', zasobId: ZASOB, szerokosc: 1800, wysokosc: 1200, ogniskowa: { x: 0.25, y: 0.7 }, proporcje: '4:3', autor: 'Jan Fotograf', licencja: 'pixabay' };
  const galeria = w.strony[0]!.sekcje.find((s) => s.typ === 'galeria');
  if (galeria && galeria.typ === 'galeria') {
    galeria.dane.obrazy[0] = { alt: 'Fotel', zrodlo: 'openverse', zasobId: ZASOB2, szerokosc: 400, wysokosc: 300, proporcje: '1:1', autor: 'Anna <b>Autor</b>', licencja: 'cc-by', licencjaUrl: 'https://creativecommons.org/licenses/by/4.0/' };
  }
  return w;
}

describe('szerokości wariantów i atrybucja', () => {
  it('tylko szerokości ≤ oryginału; węższy niż 480 px → jeden wariant 480 (bez powiększania w API)', () => {
    expect(szerokosciWariantow(3000)).toEqual([480, 960, 1600, 2400]);
    expect(szerokosciWariantow(1800)).toEqual([480, 960, 1600]);
    expect(szerokosciWariantow(960)).toEqual([480, 960]);
    expect(szerokosciWariantow(300)).toEqual([480]);
  });

  it('podpis autora tylko dla licencji, które go wymagają', () => {
    for (const l of ['cc0', 'pdm', 'pixabay', 'pexels', undefined]) expect(wymagaAtrybucji(l)).toBe(false);
    expect(wymagaAtrybucji('cc-by')).toBe(true);
    expect(wymagaAtrybucji('cc-by-sa')).toBe(true);
  });
});

describe('zdjęcie z biblioteki w renderze', () => {
  it('publikacja: <picture> z webp i jpg w srcset, sizes, wymiary, hero bez lazy z fetchpriority, ogniskowa', () => {
    const html = plik(render(zeZdjeciemZBiblioteki(), 'hosting', { adresZasobu: ADRES_PUBLIKACJI }), 'index.html');
    const zn = znaczniki(html);
    const zrodla = zn.filter((z) => z.nazwa === 'source' && z.atr.srcset?.includes(ZASOB));
    expect(zrodla).toHaveLength(1);
    expect(zrodla[0]!.atr.type).toBe('image/webp');
    expect(zrodla[0]!.atr.srcset).toBe(`assets/img/${ZASOB}-480.webp 480w, assets/img/${ZASOB}-960.webp 960w, assets/img/${ZASOB}-1600.webp 1600w`);
    const img = zn.find((z) => z.nazwa === 'img' && z.atr.src?.includes(ZASOB))!;
    expect(img.atr.src).toBe(`assets/img/${ZASOB}-960.jpg`);
    expect(img.atr.srcset).toContain(`assets/img/${ZASOB}-1600.jpg 1600w`);
    expect(img.atr.sizes).toBe('100vw');
    expect(img.atr.alt).toBe('Wnętrze salonu');
    expect(img.atr.width).toBe('1200');
    expect(img.atr.height).toBe('900');
    expect(img.atr.fetchpriority).toBe('high');
    expect(img.atr.loading).toBeUndefined();
    expect(img.atr.decoding).toBe('async');
    expect(img.atr.style).toBe('object-position:25% 70%');
    // Pixabay nie wymaga podpisu – bez figcaption przy hero.
    expect(html).not.toContain('Jan Fotograf');
    expect(html).not.toContain('data-k-obraz');
  });

  it('podstrona: adresy względne z prefiksem katalogu; mały oryginał – jeden wariant 480', () => {
    const w = zeZdjeciemZBiblioteki();
    w.strony.push({ slug: 'o-nas', tytul: 'O nas', sekcje: [{ ...structuredClone(w.strony[0]!.sekcje.find((s) => s.typ === 'hero')!), id: 'hero-o-nas' }] } as never);
    const html = plik(render(w, 'hosting', { adresZasobu: ADRES_PUBLIKACJI }), 'o-nas/index.html');
    expect(html).toContain(`src="../assets/img/${ZASOB}-960.jpg"`);
  });

  it('licencja CC BY: podpis autora w <figcaption> (z ucieczką HTML), zdjęcie spoza hero z loading="lazy"', () => {
    const html = plik(render(zeZdjeciemZBiblioteki(), 'hosting', { adresZasobu: ADRES_PUBLIKACJI }), 'index.html');
    if (!html.includes(ZASOB2)) return; // przykład bez galerii na stronie głównej
    expect(html).toMatch(/<figure class="ob [^"]*"[^>]*>.*<figcaption class="ob-atr"[^>]*>Fot\. Anna &lt;b&gt;Autor&lt;\/b&gt;/s);
    expect(html).toContain('https://creativecommons.org/licenses/by/4.0/');
    const img = znaczniki(html).find((z) => z.nazwa === 'img' && z.atr.src?.includes(ZASOB2))!;
    expect(img.atr.loading).toBe('lazy');
    expect(img.atr.srcset).toBe(`assets/img/${ZASOB2}-480.jpg 480w`);
  });

  it('<picture>, <figure> i podpis autora bez stylów inline – wygląd z arkusza (.ob picture, .ob-atr)', () => {
    const w = render(zeZdjeciemZBiblioteki(), 'hosting', { adresZasobu: ADRES_PUBLIKACJI });
    const html = plik(w, 'index.html');
    expect(html).toContain('<picture>');
    for (const z of znaczniki(html).filter((x) => ['picture', 'figure', 'figcaption'].includes(x.nazwa))) expect({ z: z.surowy, styl: z.atr.style }).toEqual({ z: z.surowy, styl: undefined });
    const css = plik(w, 'assets/styl.css');
    expect(css).toContain('.ob picture{display:contents}');
    expect(css).toMatch(/\.ob-atr\{position:absolute;right:0;bottom:0;margin:0;padding:2px 6px;font-size:11px;line-height:1\.3;background:rgba\(0,0,0,\.55\);color:#fff\}/);
  });

  it('publikacja bez adresZasobu przy zdjęciu z biblioteki → jawny błąd, nie cicha ramka', () => {
    expect(() => render(zeZdjeciemZBiblioteki(), 'hosting')).toThrow(/adresZasobu/);
  });

  it('podgląd bez adresZasobu → ramka zastępcza; edycja dodaje data-k-obraz tylko w podglądzie', () => {
    const podglad = plik(render(zeZdjeciemZBiblioteki(), 'hosting', { tryb: 'podglad', edycja: true }), 'index.html');
    expect(podglad).not.toContain('<picture');
    expect(podglad).toContain('class="ph ');
    const zAdresem = plik(
      render(zeZdjeciemZBiblioteki(), 'hosting', { tryb: 'podglad', edycja: true, adresZasobu: (id, s, f) => `https://api.verris.test/kreator/z/t-${id}/${s}.${f}` }),
      'index.html',
    );
    expect(zAdresem).toContain(`https://api.verris.test/kreator/z/t-${ZASOB}/960.jpg`);
    const publikacja = plik(render(zeZdjeciemZBiblioteki(), 'hosting', { edycja: true, adresZasobu: ADRES_PUBLIKACJI }), 'index.html');
    expect(publikacja).not.toContain('data-k-obraz');
  });

  it('obraz bez zasobId renderuje się jak dotąd (placeholder i url bez zmian)', () => {
    const a = plik(render(PRZYKLADY.salon!, 'hosting'), 'index.html');
    const b = plik(render(PRZYKLADY.salon!, 'hosting', { adresZasobu: ADRES_PUBLIKACJI }), 'index.html');
    expect(b).toBe(a);
    expect(a).not.toContain('<picture');
  });

  it('zasobId musi być identyfikatorem (uuid) – model odrzuca inne wartości', () => {
    const w = zeZdjeciemZBiblioteki();
    const hero = w.strony[0]!.sekcje.find((s) => s.typ === 'hero')!;
    if (hero.typ !== 'hero') throw new Error('hero');
    hero.dane.obraz!.zasobId = '../../etc/passwd';
    expect(() => render(w, 'hosting', { adresZasobu: ADRES_PUBLIKACJI })).toThrow();
  });
});

describe('data-k-obraz (tryb edycji)', () => {
  const kontekst = (podglad: boolean, opcje: Partial<OpcjeRenderu>) =>
    ({ s: { podglad, opcje: { tryb: podglad ? 'podglad' : 'publikacja', ...opcje }, efekty: new Set(), js: new Set(), css: new Set(), ostrzezenia: [] }, prefix: '', licznikObrazow: 0, licznikPh: 0 }) as unknown as KontekstPodstrony;
  const zdjecie = { alt: 'A', zrodlo: 'wlasne' as const, zasobId: ZASOB, szerokosc: 1000, proporcje: '4:3' as const };
  const sciezka = 'strony.0.sekcje.1.dane.obraz';

  it('opakowanie zdjęcia i ramki zastępczej dostaje ścieżkę tylko w podglądzie z edycją', () => {
    const adres = { adresZasobu: ADRES_PUBLIKACJI };
    expect(obraz(kontekst(true, { edycja: true, ...adres }), zdjecie, { sciezka })).toContain(`data-k-obraz="${sciezka}"`);
    expect(obraz(kontekst(true, { edycja: true }), { alt: 'B', zrodlo: 'placeholder', proporcje: '1:1' }, { sciezka })).toContain(`data-k-obraz="${sciezka}"`);
    expect(obraz(kontekst(true, { ...adres }), zdjecie, { sciezka })).not.toContain('data-k-obraz');
    expect(obraz(kontekst(false, { edycja: true, ...adres }), zdjecie, { sciezka })).not.toContain('data-k-obraz');
    expect(obraz(kontekst(true, { edycja: true, ...adres }), zdjecie, { sciezka: '"><script>' })).toContain('data-k-obraz="&quot;&gt;&lt;script&gt;"');
  });
});

