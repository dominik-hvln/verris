import { KATALOG_EFEKTOW, KATALOG_WARIANTOW, SEKCJE_PRO } from '../katalog.ts';
import type { Strona, TypSekcji } from '../model.ts';
import { PLANY_KREATORA, type WersjaKreatora } from '../plany.ts';
import { KATALOG_STYLOW, stylPoId, type StylProjektu, type ZakresBarwy } from '../style/katalog-stylow.ts';
import type { BriefStrony, KierunekProjektu } from './kontrakt.ts';

/**
 * Wybór kierunków projektu przed generacją (serwer, nie AI). Cel: dopasowanie do branży, typu strony
 * i tonu, a jednocześnie unikalność – dwie piekarnie z tego samego miasta nie dostają tej samej strony.
 *
 *  - waga stylu = dopasowanie (branża w polu firmy i w opisie, ton, typ strony, styl wskazany w briefie)
 *    × kara za style z odcisków ostatnich stron tej branży;
 *  - kilka kierunków naraz (Pro = 3) bierze style z różnych rodzin wizualnych, różne charaktery palety
 *    i barwy odległe o ≥ 45°;
 *  - odcisk = styl|font nagłówków|wariant hero|wariant oferty – kombinacji z `odciskiNiedawne` unikamy;
 *  - losowość wstrzykiwana (`los`), więc testy są deterministyczne;
 *  - bez Kreatora Pro wyłącznie style, warianty i efekty `pro: false`.
 */

/** Deterministyczne źródło losowości z ziarna (mulberry32) – testy i powtarzalne generacje. */
export function losZZiarna(ziarno: number): () => number {
  let a = ziarno >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const indeks = (los: () => number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(los() * n)));
const wybierz = <T>(los: () => number, lista: readonly T[]): T => lista[indeks(los, lista.length)];

function wybierzWazone<T>(los: () => number, pozycje: { x: T; waga: number }[]): T {
  const suma = pozycje.reduce((s, p) => s + p.waga, 0);
  let r = los() * suma;
  for (const p of pozycje) {
    r -= p.waga;
    if (r < 0) return p.x;
  }
  return pozycje[pozycje.length - 1].x;
}

const malymi = (s: string | undefined) => (s ?? '').toLocaleLowerCase('pl-PL');

/** Odcisk kierunku – ten sam format co `odciskStrony`. */
export function odciskKierunku(k: KierunekProjektu): string {
  return [k.styl, k.fonty.naglowki.toLowerCase(), k.warianty.hero ?? '-', k.warianty.oferta ?? '-'].join('|');
}

/** Odcisk opublikowanej strony: styl, font nagłówków i warianty pierwszego hero i pierwszej oferty strony głównej. */
export function odciskStrony(strona: Strona): string {
  const glowna = strona.strony.find((p) => p.slug === '') ?? strona.strony[0];
  const sekcje = glowna?.sekcje ?? [];
  const hero = sekcje.find((s) => s.typ === 'hero')?.wariant ?? '-';
  const oferta = sekcje.find((s) => s.typ === 'oferta')?.wariant ?? '-';
  return [strona.motyw.styl, strona.motyw.fonty.naglowki.toLowerCase(), hero, oferta].join('|');
}

/** Waga stylu dla briefu (bez kary za powtórki). Eksport do testów i podglądu w panelu. */
export function wagaStylu(styl: StylProjektu, brief: BriefStrony, funkcjePro: boolean): number {
  const branza = malymi(brief.firma?.branza);
  const opis = malymi(`${brief.opis} ${brief.inspiracje ?? ''}`);
  let w = 1;
  if (branza && styl.branze.some((b) => branza.includes(b))) w += 6;
  else if (styl.branze.some((b) => opis.includes(b))) w += 3;
  const ton = malymi(brief.ton);
  if (ton && styl.tony.some((t) => ton.includes(t))) w += 2;
  if (styl.typyStron.includes(brief.typ)) w += 1.5;
  if (brief.styl) {
    const wskazany = stylPoId(brief.styl);
    const docelowy = wskazany && wskazany.pro && !funkcjePro ? wskazany.zastepczy : wskazany?.id;
    if (docelowy === styl.id) w += 25;
  }
  return w;
}

function rozpietosc([od, d]: ZakresBarwy): number {
  return od <= d ? d - od : 360 - od + d;
}

function losujBarwe(los: () => number, zakresy: readonly ZakresBarwy[]): number {
  const z = wybierz(los, zakresy);
  return Math.round(z[0] + los() * rozpietosc(z)) % 360;
}

const odlegloscBarw = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

const WARIANTY_PRO = new Set(Object.values(KATALOG_WARIANTOW).flat().filter((w) => w.pro).map((w) => w.id));
const EFEKTY_PRO = new Set(KATALOG_EFEKTOW.filter((e) => e.pro).map((e) => e.id));

/** Warianty sekcji dozwolone w wersji: rekomendacje stylu, a gdy żadna nie przejdzie – pierwszy darmowy z katalogu. */
export function wariantyDlaWersji(styl: StylProjektu, funkcjePro: boolean): Partial<Record<TypSekcji, string[]>> {
  const wynik: Partial<Record<TypSekcji, string[]>> = {};
  for (const [typ, lista] of Object.entries(styl.warianty) as [TypSekcji, string[]][]) {
    if (!funkcjePro && SEKCJE_PRO.includes(typ)) continue;
    const ok = lista.filter((id) => funkcjePro || !WARIANTY_PRO.has(id));
    const zapas = KATALOG_WARIANTOW[typ].find((w) => !w.pro)?.id;
    if (ok.length) wynik[typ] = ok;
    else if (zapas) wynik[typ] = [zapas];
  }
  return wynik;
}

export function efektyDlaWersji(styl: StylProjektu, funkcjePro: boolean): string[] {
  return styl.efekty.filter((e) => funkcjePro || !EFEKTY_PRO.has(e));
}

const PROB_NA_KIERUNEK = 16;

/**
 * Kierunki projektu dla generacji. `ile` – liczba propozycji (plan: 1 bez Pro, 3 w Pro), `wersja` –
 * wersja kreatora (domyślnie bez Pro: bezpieczniej nie dać stylu Pro niż go dać przez pomyłkę).
 */
export function wybierzKierunki(
  brief: BriefStrony,
  ile: number,
  odciskiNiedawne: string[],
  los: () => number = Math.random,
  wersja: WersjaKreatora = 'hosting',
): KierunekProjektu[] {
  const funkcjePro = PLANY_KREATORA[wersja].funkcjePro;
  const ilosc = Math.max(1, Math.min(6, Math.floor(ile)));
  const niedawne = new Set(odciskiNiedawne);
  const powtorkiStylu = new Map<string, number>();
  for (const o of odciskiNiedawne) {
    const s = o.split('|')[0];
    powtorkiStylu.set(s, (powtorkiStylu.get(s) ?? 0) + 1);
  }

  const dostepne = KATALOG_STYLOW.filter((s) => funkcjePro || !s.pro);
  const wagi = dostepne.map((s) => ({ x: s, waga: wagaStylu(s, brief, funkcjePro) * Math.max(0.1, 0.5 ** (powtorkiStylu.get(s.id) ?? 0)) }));

  const kierunki: KierunekProjektu[] = [];
  const uzyteStyle = new Set<string>();
  const uzyteRodziny = new Set<string>();
  const uzyteOdciski = new Set<string>();

  for (let i = 0; i < ilosc; i++) {
    // Najpierw style z nieużytych rodzin, potem nieużyte style, na końcu dowolne (gdy `ile` > liczby stylów).
    const nowaRodzina = wagi.filter((p) => !uzyteStyle.has(p.x.id) && !uzyteRodziny.has(p.x.rodzina));
    const nowyStyl = wagi.filter((p) => !uzyteStyle.has(p.x.id));
    const pula = nowaRodzina.length ? nowaRodzina : nowyStyl.length ? nowyStyl : wagi;
    const styl = wybierzWazone(los, pula);
    uzyteStyle.add(styl.id);
    uzyteRodziny.add(styl.rodzina);

    const warianty = wariantyDlaWersji(styl, funkcjePro);
    const charakteryWolne = styl.charaktery.filter((c) => !kierunki.some((k) => k.charakterPalety === c));
    let kierunek: KierunekProjektu | null = null;
    for (let proba = 0; proba < PROB_NA_KIERUNEK; proba++) {
      const para = wybierz(los, styl.pary);
      const barwa = losujBarwe(los, styl.barwy);
      const k: KierunekProjektu = {
        styl: styl.id,
        fonty: { naglowki: para.naglowki, tekst: para.tekst },
        barwa,
        charakterPalety: wybierz(los, charakteryWolne.length ? charakteryWolne : styl.charaktery),
        warianty: Object.fromEntries(Object.entries(warianty).map(([typ, lista]) => [typ, wybierz(los, lista)])),
        zaokraglenie: styl.zaokraglenie,
        skalaTypografii: styl.skalaTypografii,
      };
      kierunek = k;
      const odcisk = odciskKierunku(k);
      const barwaDaleko = kierunki.every((x) => odlegloscBarw(x.barwa, barwa) >= 45);
      if (!niedawne.has(odcisk) && !uzyteOdciski.has(odcisk) && (barwaDaleko || proba >= PROB_NA_KIERUNEK / 2)) break;
    }
    // kierunek jest zawsze ustawiony (co najmniej jedna próba)
    const wybrany = kierunek as KierunekProjektu;
    uzyteOdciski.add(odciskKierunku(wybrany));
    kierunki.push(wybrany);
  }
  return kierunki;
}
