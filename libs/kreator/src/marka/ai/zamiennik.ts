import { losZZiarna } from '../../ai/kierunki.ts';
import { KATALOG_FONTOW } from '../../style/katalog-stylow.ts';
import { KierunekMarki, type BriefMarki, type Sygnet } from '../model.ts';
import { KATALOG_SYGNETOW } from '../sygnety/katalog.ts';
import type { RodzinaSygnetu } from '../typy.ts';
import { krojTekstuDla, wagaKroju } from './kroje.ts';
import type { PreselekcjaMarki, SlotSerii } from './preselekcja.ts';
import type { WynikSerii } from './seria.ts';
import { koncepcjaMonogramu, sygnetZRodziny } from './kierunek-kompakt.ts';
import { koloryKierunku } from './wspolne-marki.ts';

/**
 * Zamiennik kierunku BEZ AI (koncepcja 3.2 p. 3 i 8.4 p. 2): gdy kierunek od modelu odpadł (zła struktura, symbol
 * poza limitami, reguły jakości biblioteki, podobieństwo do znaku wydanego w branży), serwer składa nowy w granicach
 * tego samego slotu – deterministycznie z ziarna, kilka prób, pierwsza, która przejdzie oceny.
 *
 * Paczka 134: zamiennik to zawsze MONOGRAM z liter nazwy (rodzina monogramowa ze slotu, a gdy slot jej nie ma –
 * z katalogu), nigdy losowa abstrakcja – znak bez związku z nazwą i branżą to dokładnie to, czego właściciel nie chce.
 *
 * Oceny są wstrzykiwane (API podaje reguły biblioteki – `ocenProjekt` – i porównanie odcisków z rejestrem),
 * więc ten moduł nie zależy od renderu. Bez ocen pierwsza próba jest wynikiem.
 */

export interface OcenyKierunku {
  /** Problemy jakości (pusta lista = dobrze) – np. reguły biblioteki: kontrast, czytelność 16 px, proporcje. */
  ocen?: (k: KierunekMarki) => string[];
  /** Zbyt podobny do znaku wydanego w tej branży (rejestr odcisków). */
  podobny?: (k: KierunekMarki) => boolean;
}

export interface OpcjeZamiennika extends OcenyKierunku {
  proby?: number;
  katalog?: readonly RodzinaSygnetu[];
}

const STYLE_LOSOWANE = ['jeden', 'jeden', 'wersaliki', 'male', 'rozstrzelony'] as const;

/** Losowa liczba całkowita z [a, b]. */
const zakresLos = (los: () => number, [a, b]: [number, number]) => Math.min(Math.max(a, b), Math.floor(Math.min(a, b) + los() * (Math.abs(b - a) + 1)));

/** Kandydat zamiennika dla slotu (próba `proba`). */
function kandydat(slot: SlotSerii, brief: Pick<BriefMarki, 'nazwa' | 'rodzaj' | 'podpis'>, los: () => number, ziarno: number, katalog: readonly RodzinaSygnetu[]): KierunekMarki {
  const zSlotu = slot.rodziny.map((x) => ({ r: katalog.find((y) => y.id === x.id), zakresy: x.zakresy })).filter((x): x is { r: RodzinaSygnetu; zakresy: Record<string, [number, number]> } => !!x.r);
  const monogramySlotu = zSlotu.filter((x) => x.r.monogram);
  const monogramyKatalogu = katalog.filter((r) => r.monogram).map((r) => ({ r, zakresy: {} as Record<string, [number, number]> }));
  const rodziny = monogramySlotu.length ? monogramySlotu : monogramyKatalogu.length ? monogramyKatalogu : zSlotu;
  let sygnet: Sygnet = { typ: 'brak' };
  if (brief.rodzaj !== 'napis' && rodziny.length) {
    const w = rodziny[Math.floor(los() * rodziny.length)];
    const p = Object.fromEntries(w.r.parametry.map((d) => [d.klucz, zakresLos(los, w.zakresy[d.klucz] ?? [d.min, d.max])]));
    sygnet = sygnetZRodziny(w.r, w.zakresy, brief.nazwa, ziarno, p);
  }
  const krojeSlotu = KATALOG_FONTOW.filter((f) => slot.kroje?.includes(f.rodzina));
  const kroje = krojeSlotu.length ? krojeSlotu : KATALOG_FONTOW.filter((f) => f.kategoria === slot.kategoriaKroju && f.wagi.some((x) => x >= 500));
  const pula = kroje.length ? kroje : KATALOG_FONTOW.filter((f) => f.kategoria === 'bezszeryfowy');
  const font = pula[Math.floor(los() * pula.length)];
  let styl: (typeof STYLE_LOSOWANE)[number] | 'dwa' = STYLE_LOSOWANE[Math.floor(los() * STYLE_LOSOWANE.length)];
  if (brief.nazwa.trim().length > 14 && styl === 'rozstrzelony') styl = 'jeden';
  const rozstrzelenie = styl === 'wersaliki' || styl === 'rozstrzelony' ? 60 + Math.floor(los() * 9) * 10 : 0;
  const [od, doo] = slot.barwy;
  const szer = od <= doo ? doo - od : 360 - od + doo;
  const barwa = Math.round(od + los() * szer) % 360;
  const charakter = slot.charaktery[Math.floor(los() * slot.charaktery.length)];
  return KierunekMarki.parse({
    id: slot.id,
    projekt: {
      sygnet,
      napis: { font: font.rodzina, waga: wagaKroju(font, 600), styl, rozstrzelenie, podpis: !!brief.podpis },
      kolory: koloryKierunku(barwa, charakter),
      uklad: sygnet.typ === 'brak' ? 'napis' : 'poziomy',
      fonty: { naglowki: font.rodzina, tekst: krojTekstuDla(font.rodzina) },
    },
    ...(sygnet.typ === 'biblioteka' && sygnet.litery ? { koncepcja: koncepcjaMonogramu(sygnet.litery, brief.nazwa) } : {}),
    zrodloZnaku: 'zamiennik',
  });
}

/** Zamiennik kierunku dla slotu – deterministyczny z `ziarno`; pierwsza próba, która przejdzie oceny (inaczej ostatnia). */
export function zamiennikKierunku(slot: SlotSerii, brief: Pick<BriefMarki, 'nazwa' | 'rodzaj' | 'podpis'>, ziarno: number, opcje: OpcjeZamiennika = {}): KierunekMarki {
  const los = losZZiarna((ziarno ^ 0x9e3779b9) >>> 0);
  const katalog = opcje.katalog ?? KATALOG_SYGNETOW;
  const proby = Math.max(1, opcje.proby ?? 8);
  let ostatni: KierunekMarki | null = null;
  for (let i = 0; i < proby; i++) {
    const k = kandydat(slot, brief, los, (ziarno + i * 104729) >>> 0, katalog);
    ostatni = k;
    if ((opcje.ocen?.(k) ?? []).length === 0 && !opcje.podobny?.(k)) return k;
  }
  return ostatni!;
}

export interface SeriaGotowa {
  kierunki: KierunekMarki[];
  /** Sloty z zamiennikiem i powód (do logów i statystyk jakości modelu). */
  zamienione: { slot: string; powod: string }[];
}

/**
 * Seria do pokazania klientowi: kierunki od AI, które przechodzą oceny (jakość, podobieństwo do wydanych), a w miejsce
 * odrzuconych – zamienniki bez AI (monogram z nazwy). `wynik` null = wszystko z zamienników – API (paczka 134) przy
 * całkowitej awarii AI nie zapisuje takiej serii, tylko odpowiada 503 i zwraca limit.
 */
export function uzupelnijSerie(wynik: WynikSerii | null, brief: Pick<BriefMarki, 'nazwa' | 'rodzaj' | 'podpis'>, preselekcja: PreselekcjaMarki, opcje: OpcjeZamiennika = {}): SeriaGotowa {
  const zamienione: SeriaGotowa['zamienione'] = [];
  const kierunki = preselekcja.sloty.map((slot, i) => {
    const k = wynik?.kierunki[i] ?? null;
    const ziarno = (preselekcja.ziarno + i * 7919) >>> 0;
    if (!k) {
      zamienione.push({ slot: slot.id, powod: wynik?.odrzucone.find((o) => o.slot === slot.id)?.powod ?? 'brak odpowiedzi AI' });
      return zamiennikKierunku(slot, brief, ziarno, opcje);
    }
    const problemy = opcje.ocen?.(k) ?? [];
    if (problemy.length || opcje.podobny?.(k)) {
      zamienione.push({ slot: slot.id, powod: problemy.length ? `reguły: ${problemy.slice(0, 3).join('; ')}` : 'podobny do znaku wydanego w branży' });
      return zamiennikKierunku(slot, brief, ziarno, opcje);
    }
    return k;
  });
  return { kierunki, zamienione };
}
