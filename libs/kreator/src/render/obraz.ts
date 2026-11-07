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
}

function srcObrazu(k: KontekstPodstrony, url: string): string {
  if (/^https:\/\//i.test(url)) return url;
  return k.prefix + url.replace(/^\/+/, '');
}

/** Obraz albo placeholder w ramce o stałych proporcjach (bez przesunięć układu – CLS 0). */
export function obraz(k: KontekstPodstrony, o: Obraz | undefined, opcje: OpcjeObrazu = {}): string {
  const ob: Obraz = o ?? { alt: '', zrodlo: 'placeholder', proporcje: '4:3' };
  const klasa = `ob ${klasaProporcji(ob.proporcje)}${opcje.klasa ? ' ' + opcje.klasa : ''}`;
  if (ob.zrodlo === 'placeholder' || !ob.url) {
    if (!k.s.podglad && ob.zrodlo !== 'placeholder') k.s.ostrzezenia.push(`Obraz „${ob.alt || ob.podpis || 'bez opisu'}” nie ma pliku – pokazano ramkę zastępczą.`);
    return `<div class="${klasa}">${placeholder(k, ob)}</div>`;
  }
  const [w, h] = wymiary(ob.proporcje);
  const pierwszy = opcje.priorytet && k.licznikObrazow === 0;
  k.licznikObrazow++;
  const src = srcObrazu(k, ob.url);
  const img = `<img src="${esc(src)}" alt="${esc(ob.alt)}" width="${w}" height="${h}"${pierwszy ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
  if (opcje.lightbox && k.s.efekty.has('lightbox')) {
    k.s.js.add('lightbox');
    k.s.css.add('ef:lightbox');
    return `<div class="${klasa}"><a class="lb" href="${esc(src)}" data-podpis="${esc(ob.alt)}">${img}</a></div>`;
  }
  return `<div class="${klasa}">${img}</div>`;
}
