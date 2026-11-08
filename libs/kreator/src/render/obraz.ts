import type { Obraz } from '../model.ts';
import { esc } from './esc.ts';
import type { KontekstPodstrony } from './kontekst.ts';

const PROPORCJE: Record<Obraz['proporcje'], [number, number]> = {
  '16:9': [16, 9],
  '4:3': [4, 3],
  '3:2': [3, 2],
  '1:1': [1, 1],
  '3:4': [3, 4],
  '4:5': [4, 5],
};

export function klasaProporcji(p: Obraz['proporcje']): string {
  return `pr-${p.replace(':', '-')}`;
}

export function wymiary(p: Obraz['proporcje'], szer = 1200): [number, number] {
  const [a, b] = PROPORCJE[p];
  return [szer, Math.round((szer * b) / a)];
}

const WZORY = ['fala', 'pasy', 'kropki', 'luk', 'siatka', 'prazki', 'kola', 'fale'] as const;
type Wzor = (typeof WZORY)[number];

const r1 = (n: number) => Math.round(n * 10) / 10;

function okregi(cx: number, cy: number, w: number, h: number, klasa: string): string {
  const max = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
  const krok = Math.max(w, h) / 24;
  let s = '';
  for (let r = krok; r < max; r += krok) s += `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r)}"/>`;
  return `<g class="${klasa}" fill="none">${s}</g>`;
}

function wzorSvg(wzor: Wzor, w: number, h: number, id: string): string {
  switch (wzor) {
    case 'fala':
      return okregi(w * 0.18, h * 1.12, w, h, 'ph-l');
    case 'luk':
      return okregi(w * 0.86, -h * 0.12, w, h, 'ph-l');
    case 'kola': {
      const r = Math.min(w, h) * 0.24;
      let s = '';
      for (let i = 1; i <= 4; i++) s += `<circle cx="${r1(w / 2)}" cy="${r1(h / 2)}" r="${r1(r + i * r * 0.32)}"/>`;
      return `<g class="ph-l ph-l-mocna" fill="none">${s}</g><circle class="ph-d" cx="${r1(w / 2)}" cy="${r1(h / 2)}" r="${r1(r)}"/><circle class="ph-l ph-l-mocna" fill="none" cx="${r1(w / 2)}" cy="${r1(h / 2)}" r="${r1(r * 0.45)}"/>`;
    }
    case 'fale': {
      let s = '';
      const krok = h / 9;
      for (let i = 1; i < 9; i++) {
        const y = i * krok;
        const a = krok * 0.32;
        s += `<path d="M0 ${r1(y)} C ${r1(w * 0.25)} ${r1(y - a)}, ${r1(w * 0.25)} ${r1(y + a)}, ${r1(w * 0.5)} ${r1(y)} S ${r1(w * 0.75)} ${r1(y - a)}, ${w} ${r1(y)}"/>`;
      }
      return `<g class="ph-l" fill="none">${s}</g>`;
    }
    case 'pasy':
      return `<defs><pattern id="${id}" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="ph-l" x1="0" y1="0" x2="0" y2="26"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#${id})"/>`;
    case 'kropki':
      return `<defs><pattern id="${id}" width="24" height="24" patternUnits="userSpaceOnUse"><circle class="ph-d ph-d-lekka" cx="12" cy="12" r="2.2"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#${id})"/>`;
    case 'siatka':
      return `<defs><pattern id="${id}" width="44" height="44" patternUnits="userSpaceOnUse"><path class="ph-l" fill="none" d="M44 0H0V44"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#${id})"/>`;
    case 'prazki':
      return `<defs><pattern id="${id}" width="28" height="28" patternUnits="userSpaceOnUse"><line class="ph-l" x1="0.5" y1="0" x2="0.5" y2="28"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#${id})"/>`;
  }
}

/**
 * Elegancka ramka w miejscu zdjęcia: tło z palety + subtelny wzór (zależny od indeksu i proporcji).
 * W podglądzie z podpisem („Zdjęcie: …”), w publikacji czysto dekoracyjna (aria-hidden, bez podpisu).
 */
export function placeholder(k: KontekstPodstrony, o: Pick<Obraz, 'alt' | 'podpis' | 'proporcje'>, dekoracja = false): string {
  const idx = k.licznikPh++;
  const pr = Object.keys(PROPORCJE).indexOf(o.proporcje);
  const wzor = WZORY[(idx * 3) % WZORY.length] as Wzor;
  const kolor = (idx * 2 + pr) % 5;
  const [w, h] = wymiary(o.proporcje, 600);
  const id = `ph${idx}`;
  const svg = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect class="ph-tlo" width="${w}" height="${h}"/>${wzorSvg(wzor, w, h, id)}</svg>`;
  const podpis = o.podpis || (o.alt ? `Zdjęcie: ${o.alt}` : 'Miejsce na zdjęcie');
  if (dekoracja || !k.s.podglad) return `<div class="ph ph-k${kolor} ph-${wzor}" aria-hidden="true">${svg}</div>`;
  return `<div class="ph ph-k${kolor} ph-${wzor}" role="img" aria-label="${esc(o.alt || podpis)}">${svg}<span class="ph-podpis" aria-hidden="true">${esc(podpis)}</span></div>`;
}

export interface OpcjeObrazu {
  /** Pierwszy obraz hero: bez lazy, fetchpriority="high". */
  priorytet?: boolean;
  klasa?: string;
  /** Link do pełnego zdjęcia (lightbox). */
  lightbox?: boolean;
  /** Atrybut `sizes` dla srcset (domyślnie pół szerokości na dużym ekranie, cały ekran na telefonie). */
  sizes?: string;
  /**
   * Ścieżka kropkowa do obiektu Obraz w modelu Strona (np. `strony.0.sekcje.1.dane.obraz`) – w trybie edycji
   * (opcje.edycja w podglądzie) opakowanie dostaje `data-k-obraz`, a edytor otwiera wybór zdjęcia.
   */
  sciezka?: string;
}

/** Szerokości wariantów zdjęć z biblioteki (px) – te same generuje API przy wgraniu i imporcie. */
export const SZEROKOSCI_ZDJEC = [480, 960, 1600, 2400] as const;

/**
 * Warianty dla oryginału o szerokości `szer`: tylko ≤ oryginału (bez powiększania). Oryginał węższy niż 480 px
 * ma jeden wariant „480” w swojej szerokości (API nie powiększa) – nazwy plików zostają stałe.
 */
export function szerokosciWariantow(szer: number | undefined): number[] {
  const w = szer && szer > 0 ? szer : SZEROKOSCI_ZDJEC[SZEROKOSCI_ZDJEC.length - 1];
  const r = SZEROKOSCI_ZDJEC.filter((s) => s <= w);
  return r.length ? [...r] : [SZEROKOSCI_ZDJEC[0]];
}

/** Licencje bez obowiązku podpisu autora (CC0, domena publiczna, licencje Pixabay i Pexels). */
const BEZ_ATRYBUCJI = new Set(['cc0', 'pdm', 'pixabay', 'pexels']);

/** Czy licencja wymaga podpisu autora przy zdjęciu (np. CC BY). Brak licencji (zdjęcie własne) = nie. */
export function wymagaAtrybucji(licencja: string | undefined): boolean {
  return !!licencja && !BEZ_ATRYBUCJI.has(licencja.toLowerCase());
}

const ZRODLA_ZEWNETRZNE = new Set(['pixabay', 'openverse', 'pexels']);

function srcObrazu(k: KontekstPodstrony, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return k.prefix + url.replace(/^\/+/, '');
}

const procent = (v: number) => `${Math.round(v * 1000) / 10}%`;

/** Atrybut trybu edycji (tylko podgląd z opcją edycja – nigdy w publikacji). */
function atrybutEdycji(k: KontekstPodstrony, sciezka: string | undefined): string {
  return sciezka && k.s.podglad && k.s.opcje.edycja ? ` data-k-obraz="${esc(sciezka)}"` : '';
}

/**
 * Zdjęcie z biblioteki konta: <picture> z wariantami webp (srcset) i jpg (img src + srcset), wymiary z proporcji
 * (ramka bez przesunięć układu), object-position z ogniskowej.
 */
function obrazZasobu(k: KontekstPodstrony, ob: Obraz & { zasobId: string }, opcje: OpcjeObrazu, klasa: string, edycja: string): string {
  const adres = k.s.opcje.adresZasobu;
  if (!adres) {
    if (!k.s.podglad) throw new Error(`Render publikacji bez adresZasobu – zdjęcie ${ob.zasobId} nie ma adresu pliku.`);
    return `<div class="${klasa}"${edycja}>${placeholder(k, ob)}</div>`;
  }
  const szer = szerokosciWariantow(ob.szerokosc);
  const url = (s: number, f: 'webp' | 'jpg') => esc(srcObrazu(k, adres(ob.zasobId, s, f)));
  const srcset = (f: 'webp' | 'jpg') => szer.map((s) => `${url(s, f)} ${s}w`).join(', ');
  const domyslna = [...szer].reverse().find((s) => s <= 960) ?? szer[0];
  const sizes = esc(opcje.sizes ?? (opcje.priorytet ? '100vw' : '(min-width: 960px) 50vw, 100vw'));
  const [w, h] = wymiary(ob.proporcje);
  const pierwszy = opcje.priorytet && k.licznikObrazow === 0;
  k.licznikObrazow++;
  const pozycja = ob.ogniskowa ? ` style="object-position:${procent(ob.ogniskowa.x)} ${procent(ob.ogniskowa.y)}"` : '';
  const img =
    `<img src="${url(domyslna, 'jpg')}" srcset="${srcset('jpg')}" sizes="${sizes}" alt="${esc(ob.alt)}" width="${w}" height="${h}"` +
    `${pierwszy ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"${pozycja}>`;
  // <picture> bez własnego pudełka (css.ts: .ob picture{display:contents}) – reguły `.ob img` działają jak dla <img>.
  let tresc = `<picture><source type="image/webp" srcset="${srcset('webp')}" sizes="${sizes}">${img}</picture>`;
  if (opcje.lightbox && k.s.efekty.has('lightbox')) {
    k.s.js.add('lightbox');
    k.s.css.add('ef:lightbox');
    tresc = `<a class="lb" href="${url(szer[szer.length - 1], 'jpg')}" data-podpis="${esc(ob.alt)}">${tresc}</a>`;
  }
  if (ZRODLA_ZEWNETRZNE.has(ob.zrodlo) && ob.autor && wymagaAtrybucji(ob.licencja)) {
    const lic = ob.licencjaUrl && /^https:\/\//i.test(ob.licencjaUrl) ? ` (<a href="${esc(ob.licencjaUrl)}" rel="license noopener">${esc(ob.licencja ?? 'licencja')}</a>)` : '';
    const podpis =
      `<figcaption class="ob-atr">Fot. ${esc(ob.autor)}${lic}</figcaption>`;
    // Wygląd podpisu: css.ts (.ob-atr); margines <figure> zeruje reset arkusza.
    return `<figure class="${klasa}"${edycja}>${tresc}${podpis}</figure>`;
  }
  return `<div class="${klasa}"${edycja}>${tresc}</div>`;
}

/** Obraz albo placeholder w ramce o stałych proporcjach (bez przesunięć układu – CLS 0). */
export function obraz(k: KontekstPodstrony, o: Obraz | undefined, opcje: OpcjeObrazu = {}): string {
  const ob: Obraz = o ?? { alt: '', zrodlo: 'placeholder', proporcje: '4:3' };
  const klasa = `ob ${klasaProporcji(ob.proporcje)}${opcje.klasa ? ' ' + opcje.klasa : ''}`;
  const edycja = atrybutEdycji(k, opcje.sciezka);
  if (ob.zasobId && ob.zrodlo !== 'placeholder') return obrazZasobu(k, ob as Obraz & { zasobId: string }, opcje, klasa, edycja);
  if (ob.zrodlo === 'placeholder' || !ob.url) {
    if (!k.s.podglad && ob.zrodlo !== 'placeholder') k.s.ostrzezenia.push(`Obraz „${ob.alt || ob.podpis || 'bez opisu'}” nie ma pliku – pokazano ramkę zastępczą.`);
    return `<div class="${klasa}"${edycja}>${placeholder(k, ob)}</div>`;
  }
  const [w, h] = wymiary(ob.proporcje);
  const pierwszy = opcje.priorytet && k.licznikObrazow === 0;
  k.licznikObrazow++;
  const src = srcObrazu(k, ob.url);
  const img = `<img src="${esc(src)}" alt="${esc(ob.alt)}" width="${w}" height="${h}"${pierwszy ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
  if (opcje.lightbox && k.s.efekty.has('lightbox')) {
    k.s.js.add('lightbox');
    k.s.css.add('ef:lightbox');
    return `<div class="${klasa}"${edycja}><a class="lb" href="${esc(src)}" data-podpis="${esc(ob.alt)}">${img}</a></div>`;
  }
  return `<div class="${klasa}"${edycja}>${img}</div>`;
}
