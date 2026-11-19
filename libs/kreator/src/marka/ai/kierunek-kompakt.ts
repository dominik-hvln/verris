import { z } from 'zod';
import { KATALOG_FONTOW } from '../../style/katalog-stylow.ts';
import { CHARAKTERY_PALET } from '../../style/kolory.ts';
import { KierunekMarki, STYLE_NAPISU, UKLADY_LOGO, type BriefMarki, type ParametrySygnetu, type Sygnet } from '../model.ts';
import { KATALOG_SYGNETOW } from '../sygnety/katalog.ts';
import { walidujSvgSygnetu } from '../walidator-svg.ts';
import type { RodzinaSygnetu } from '../typy.ts';
import { krojTekstuDla, krojZKatalogu, wagaKroju } from './kroje.ts';
import { barwaWZakresie, odlegloscBarwy, type SlotSerii } from './preselekcja.ts';
import { przygotujSymbolAi } from './symbol-ai.ts';
import { koloryKierunku, literyMonogramu, naruszeniaTekstu, tekstAi, type CharakterPaletyMarki } from './wspolne-marki.ts';

/**
 * Kierunek w zapisie kompaktowym (format „K” z M1) → pełny KierunekMarki z model.ts.
 * Walidacja: rodzina z dozwolonych w slocie, parametry obcięte do zakresu slotu (i katalogu), krój z katalogu
 * (waga – najbliższa dostępna), barwa w zakresie slotu, charakter z dozwolonych, symbol AI w limitach i po
 * walidatorze biblioteki, teksty oczyszczone (półpauza) i bez fraz zakazanych.
 *
 * Polityka błędów (koszt): kierunek, który da się uratować, ratujemy (obcięcie, zamiana rodziny spoza slotu na
 * rodzinę slotu – z ostrzeżeniem); kierunek bez barwy albo z odrzuconym symbolem wraca jako odrzucony – serwer
 * dobiera zamiennik bez AI (`zamiennikKierunku`). Runda naprawy tylko dla zepsutej struktury całej odpowiedzi.
 */

/** Liczba z odpowiedzi (także "205"). */
const Liczba = z.union([z.number(), z.string().regex(/^-?\d+(?:\.\d+)?$/).transform(Number)]);

export const KierunekKompakt = z.object({
  r: z.string().max(60).optional(),
  p: z.record(z.string(), Liczba).optional(),
  l: z.string().max(8).optional(),
  s: z.string().max(12_000).optional(),
  f: z.string().max(80).optional(),
  w: Liczba.optional(),
  n: z.string().max(20).optional(),
  ro: Liczba.optional(),
  u: z.string().max(20).optional(),
  b: Liczba,
  b2: Liczba.optional(),
  ch: z.string().max(20).optional(),
  ft: z.string().max(80).optional(),
  d: z.string().max(600).optional(),
});
export type KierunekKompakt = z.infer<typeof KierunekKompakt>;

/** Walidator symbolu (domyślnie `walidujSvgSygnetu` biblioteki w trybie 'ai'; wstrzykiwany w testach). */
export type WalidatorSymbolu = (svg: string) => { ok: true; svg: string } | { ok: false; powod: string };

/**
 * Walidator biblioteki (walidator-svg.ts, tryb 'ai'): ścisły parser XML, biała lista, wynik budowany od nowa z samej
 * geometrii (same `<path>`, kolory currentColor / akcent), limity 8 elementów i 120 węzłów.
 */
export const walidatorSymboluBiblioteki: WalidatorSymbolu = (svg) => {
  const w = walidujSvgSygnetu(svg, { tryb: 'ai' });
  return w.ok ? { ok: true, svg: w.svg } : { ok: false, powod: w.bledy.slice(0, 3).join('; ') || 'niepoprawny SVG' };
};

export interface KontekstKierunku {
  brief: Pick<BriefMarki, 'nazwa' | 'rodzaj'> & Partial<Pick<BriefMarki, 'podpis' | 'barwyOdrzucone'>>;
  slot: SlotSerii;
  /** Ziarno generatora sygnetu (deterministyczny wariant rodziny). */
  ziarno: number;
  walidujSymbol?: WalidatorSymbolu;
  katalog?: readonly RodzinaSygnetu[];
}

export type WynikKierunku =
  | { ok: true; kierunek: KierunekMarki; ostrzezenia: string[] }
  | { ok: false; powod: string };

const zawin = (h: number) => ((Math.round(h) % 360) + 360) % 360;

/** Barwa poza zakresem slotu → najbliższa granica zakresu. */
export function barwaDoZakresu(h: number, zakres: [number, number]): number {
  const x = zawin(h);
  if (barwaWZakresie(x, zakres)) return x;
  return odlegloscBarwy(x, zakres[0]) <= odlegloscBarwy(x, zakres[1]) ? zakres[0] : zakres[1];
}

/** Parametry rodziny: z odpowiedzi albo domyślne, obcięte do zakresu slotu i katalogu; nieznane klucze odrzucone. */
export function parametryWZakresie(r: RodzinaSygnetu, p: Record<string, number> | undefined, zakresy: Record<string, [number, number]> | undefined): { parametry: ParametrySygnetu; obciete: string[] } {
  const parametry: ParametrySygnetu = {};
  const obciete: string[] = [];
  for (const def of r.parametry) {
    const [od, doo] = zakresy?.[def.klucz] ?? [def.min, def.max];
    const min = Math.max(def.min, Math.min(od, doo));
    const max = Math.min(def.max, Math.max(od, doo));
    const wej = p?.[def.klucz];
    const surowa = typeof wej === 'number' && Number.isFinite(wej) ? Math.round(wej) : def.domyslna >= min && def.domyslna <= max ? def.domyslna : Math.round((min + max) / 2);
    const v = Math.min(max, Math.max(min, surowa));
    if (typeof wej === 'number' && v !== Math.round(wej)) obciete.push(`${def.klucz} ${wej}→${v}`);
    parametry[def.klucz] = v;
  }
  return { parametry, obciete };
}

/** Sygnet z rodziny slotu (bez AI): parametry domyślne w zakresie slotu. */
export function sygnetZRodziny(r: RodzinaSygnetu, zakresy: Record<string, [number, number]> | undefined, nazwa: string, ziarno: number, p?: Record<string, number>, litery?: unknown): Sygnet {
  const { parametry } = parametryWZakresie(r, p, zakresy);
  return { typ: 'biblioteka', rodzina: r.id, parametry, ...(r.monogram ? { litery: literyMonogramu(litery, nazwa) } : {}), ziarno: ziarno >>> 0 };
}

const NAPISY = new Set<string>(STYLE_NAPISU);
const UKLADY = new Set<string>(UKLADY_LOGO);
const CHARAKTERY = new Set<string>(CHARAKTERY_PALET);

/** Krój zastępczy dla slotu: pierwszy z katalogu w kategorii slotu (deterministycznie od ziarna). */
function krojZastepczy(slot: SlotSerii, ziarno: number): string {
  const lista = KATALOG_FONTOW.filter((f) => f.kategoria === slot.kategoriaKroju && f.wagi.some((w) => w >= 500));
  const pula = lista.length ? lista : KATALOG_FONTOW.filter((f) => f.kategoria === 'bezszeryfowy');
  return pula[ziarno % pula.length].rodzina;
}

/** Rozwinięcie jednego kierunku kompaktowego. */
export function rozwinKierunek(wejscie: unknown, kontekst: KontekstKierunku): WynikKierunku {
  const { brief, slot } = kontekst;
  const p = KierunekKompakt.safeParse(wejscie);
  if (!p.success) return { ok: false, powod: `${slot.id}: ${p.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(kierunek)'} ${i.message}`).join('; ')}` };
  const k = p.data;
  const ostrzezenia: string[] = [];
  const katalog = kontekst.katalog ?? KATALOG_SYGNETOW;
  const dozwolone = slot.rodziny.map((x) => ({ r: katalog.find((y) => y.id === x.id), zakresy: x.zakresy })).filter((x): x is { r: RodzinaSygnetu; zakresy: Record<string, [number, number]> } => !!x.r);

  // Sygnet.
  let sygnet: Sygnet;
  let zrodloZnaku: KierunekMarki['zrodloZnaku'] = 'biblioteka';
  let dlaczegoAktualne = true;
  if (brief.rodzaj === 'napis' || (!dozwolone.length && !slot.symbolAi)) {
    sygnet = { typ: 'brak' };
  } else if (k.s && slot.symbolAi) {
    const s = przygotujSymbolAi(k.s);
    if (!s.ok) return { ok: false, powod: `${slot.id}: ${s.powod}` };
    const w = (kontekst.walidujSymbol ?? walidatorSymboluBiblioteki)(s.svg);
    if (!w.ok) return { ok: false, powod: `${slot.id}: symbol odrzucony przez walidator – ${w.powod}` };
    ostrzezenia.push(...s.ostrzezenia.map((o) => `${slot.id}: ${o}`));
    sygnet = { typ: 'ai', svg: w.svg };
    zrodloZnaku = 'ai';
  } else {
    let wybor = dozwolone.find((x) => x.r.id === k.r);
    if (!wybor) {
      if (!dozwolone.length) return { ok: false, powod: `${slot.id}: brak rodziny w slocie` };
      ostrzezenia.push(`${slot.id}: rodzina „${k.r ?? '–'}” spoza slotu – użyto „${dozwolone[0].r.id}”`);
      wybor = dozwolone[0];
      zrodloZnaku = 'zamiennik';
      dlaczegoAktualne = false;
    }
    const { obciete } = parametryWZakresie(wybor.r, wybor.r.id === k.r ? k.p : undefined, wybor.zakresy);
    if (obciete.length) ostrzezenia.push(`${slot.id}: parametry poza zakresem (${obciete.join(', ')})`);
    sygnet = sygnetZRodziny(wybor.r, wybor.zakresy, brief.nazwa, kontekst.ziarno, wybor.r.id === k.r ? k.p : undefined, k.l);
  }

  // Napis.
  let font = krojZKatalogu(k.f);
  if (!font) {
    const zast = krojZastepczy(slot, kontekst.ziarno);
    ostrzezenia.push(`${slot.id}: krój „${k.f ?? '–'}” spoza katalogu – użyto „${zast}”`);
    font = krojZKatalogu(zast)!;
  }
  const waga = wagaKroju(font, k.w === undefined ? undefined : Math.round(k.w));
  let styl = k.n && NAPISY.has(k.n) ? (k.n as KierunekMarki['projekt']['napis']['styl']) : 'jeden';
  if (styl === 'dwa' && brief.nazwa.trim().split(/\s+/).length < 2) styl = 'jeden';
  const rozstrzelenie = Math.max(-50, Math.min(400, Math.round(k.ro ?? 0)));

  // Kolor.
  const barwa = barwaDoZakresu(k.b, slot.barwy);
  if (barwa !== zawin(k.b)) ostrzezenia.push(`${slot.id}: barwa ${k.b} poza zakresem ${slot.barwy.join('–')} – ${barwa}`);
  const charakter: CharakterPaletyMarki = k.ch && CHARAKTERY.has(k.ch) && slot.charaktery.includes(k.ch as CharakterPaletyMarki) ? (k.ch as CharakterPaletyMarki) : slot.charaktery[0];
  let b2 = k.b2 === undefined ? undefined : zawin(k.b2);
  if (b2 !== undefined && (brief.barwyOdrzucone ?? []).some((o) => odlegloscBarwy(o, b2!) < 25)) b2 = undefined;
  const kolory = koloryKierunku(barwa, charakter, b2);

  // Układ i fonty.
  let uklad = k.u && UKLADY.has(k.u) ? (k.u as KierunekMarki['projekt']['uklad']) : 'poziomy';
  if (sygnet.typ === 'brak') uklad = 'napis';
  else if (uklad === 'napis') uklad = 'poziomy';
  const tekst = krojZKatalogu(k.ft)?.rodzina ?? krojTekstuDla(font.rodzina);

  // Uzasadnienie.
  let dlaczego = dlaczegoAktualne ? tekstAi(k.d, 20, 200) : undefined;
  if (dlaczego) {
    const n = naruszeniaTekstu(dlaczego);
    if (n.length) {
      ostrzezenia.push(`${slot.id}: uzasadnienie usunięte (${n.join('; ')})`);
      dlaczego = undefined;
    }
  }

  const kierunek = KierunekMarki.safeParse({
    id: slot.id,
    projekt: {
      sygnet,
      napis: { font: font.rodzina, waga, styl, rozstrzelenie, podpis: !!brief.podpis },
      kolory,
      uklad,
      fonty: { naglowki: font.rodzina, tekst },
    },
    ...(dlaczego ? { dlaczego } : {}),
    zrodloZnaku,
  });
  if (!kierunek.success) return { ok: false, powod: `${slot.id}: ${kierunek.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}` };
  return { ok: true, kierunek: kierunek.data, ostrzezenia };
}

/** Kierunek pełny → kompaktowy (do wiadomości odświeżenia, zmian i testów odwracalności). */
export function kompaktujKierunek(k: KierunekMarki): Record<string, unknown> {
  const pr = k.projekt;
  const w: Record<string, unknown> = {};
  if (pr.sygnet.typ === 'biblioteka') {
    w.r = pr.sygnet.rodzina;
    w.p = pr.sygnet.parametry;
    if (pr.sygnet.litery) w.l = pr.sygnet.litery;
  }
  w.f = pr.napis.font;
  if (pr.napis.waga !== 600) w.w = pr.napis.waga;
  if (pr.napis.styl !== 'jeden') w.n = pr.napis.styl;
  if (pr.napis.rozstrzelenie) w.ro = pr.napis.rozstrzelenie;
  if (pr.uklad !== 'poziomy') w.u = pr.uklad;
  w.b = pr.kolory.barwa;
  if (pr.kolory.charakter !== 'jasna') w.ch = pr.kolory.charakter;
  if (k.dlaczego) w.d = k.dlaczego;
  return w;
}
