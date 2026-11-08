/**
 * Paczka 123 – Admin → Kreator stron: podsumowanie miesiąca (zużycie, koszt AI z rozbiciem na cache, Kreator Pro,
 * błędy generacji). Zapytania do bazy w funkcjach poniżej (Postgres sprawdza test/integration/kreator-admin.int-spec.ts),
 * rachunki w czystych funkcjach (kreator.admin.controller.spec.ts). Bez treści stron klientów – tylko liczby,
 * e-mail konta i komunikat błędu, który klient i tak widzi w panelu.
 */
import { Prisma, ProductKind, KreatorStatus } from '@verris/database';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MNOZNIK_ZAPISU_CACHE, mnoznikOdczytuCache } from '../ai/ai-modele.js';
import { rozbicieVat } from '../billing/faktura-za-portfel.js';
import { FUNKCJA_AI_KREATORA, miesiacUtc } from './konfiguracja.js';
import { PRO_DZIALA } from './kreator-pro.js';

/** Suma wywołań AI kreatora jednego modelu (AiInteractionLog, `inputSummary` z anthropicZBlokami). */
export interface WierszKosztuModelu {
  model: string | null;
  wywolania: number;
  /** Wejście poza cache (input_tokens). */
  wej: number;
  wyj: number;
  zapis5m: number;
  zapis1h: number;
  odczyt: number;
  /** Koszt zapisany w dzienniku przy wywołaniu (USD). */
  kosztUsd: number;
}

export interface RozbicieKosztow {
  wywolania: number;
  tokeny: { wej: number; wyj: number; zapis5m: number; zapis1h: number; odczyt: number };
  /** Zwykłe tokeny wejścia (poza cache). */
  wejscieUsd: number;
  wyjscieUsd: number;
  cacheZapisUsd: number;
  cacheOdczytUsd: number;
  /** Suma czterech pozycji wyżej (wg bieżącego cennika z ustawień AI). */
  razemUsd: number;
  /** Ile kosztowałyby te same tokeny cache jako zwykłe wejście. */
  bezCacheUsd: number;
  /** bezCache − (zapis + odczyt); ujemna, gdy zapisy cache nie zwróciły się odczytami. */
  oszczednoscUsd: number;
  /** Koszt zapisany w dzienniku przy wywołaniach (ceny z chwili wywołania). */
  zapisanyUsd: number;
}

type Ceny = Record<string, { wej: number; wyj: number }>;
const zaokr = (v: number) => Math.round(v * 1e6) / 1e6;

/**
 * Rozbicie kosztu AI kreatora na zwykłe wejście, wyjście, zapis i odczyt cache – te same mnożniki co
 * kosztZCacheUsd (ai-modele.ts): zapis 5 min × 1,25, zapis 1 h × 2, odczyt × mnożnik modelu. Nieznany model jak
 * w kosztZCacheUsd – po cenie zapasowej 20/100 USD za 1 mln tokenów.
 */
export function rozbicieKosztow(wiersze: WierszKosztuModelu[], ceny: Ceny): RozbicieKosztow {
  const t = { wej: 0, wyj: 0, zapis5m: 0, zapis1h: 0, odczyt: 0 };
  let wejscie = 0;
  let wyjscie = 0;
  let zapis = 0;
  let odczyt = 0;
  let bezCache = 0;
  let zapisany = 0;
  let wywolania = 0;
  for (const w of wiersze) {
    const model = w.model ?? '';
    const cena = ceny[model] ?? { wej: 20, wyj: 100 };
    wywolania += w.wywolania;
    t.wej += w.wej;
    t.wyj += w.wyj;
    t.zapis5m += w.zapis5m;
    t.zapis1h += w.zapis1h;
    t.odczyt += w.odczyt;
    wejscie += (w.wej * cena.wej) / 1e6;
    wyjscie += (w.wyj * cena.wyj) / 1e6;
    zapis += ((w.zapis5m * MNOZNIK_ZAPISU_CACHE['5m'] + w.zapis1h * MNOZNIK_ZAPISU_CACHE['1h']) * cena.wej) / 1e6;
    odczyt += (w.odczyt * mnoznikOdczytuCache(model) * cena.wej) / 1e6;
    bezCache += ((w.zapis5m + w.zapis1h + w.odczyt) * cena.wej) / 1e6;
    zapisany += w.kosztUsd;
  }
  return {
    wywolania,
    tokeny: t,
    wejscieUsd: zaokr(wejscie),
    wyjscieUsd: zaokr(wyjscie),
    cacheZapisUsd: zaokr(zapis),
    cacheOdczytUsd: zaokr(odczyt),
    razemUsd: zaokr(wejscie + wyjscie + zapis + odczyt),
    bezCacheUsd: zaokr(bezCache),
    oszczednoscUsd: zaokr(bezCache - zapis - odczyt),
    zapisanyUsd: zaokr(zapisany),
  };
}

export interface PrzychodPro {
  aktywne: number;
  miesieczne: number;
  roczne: number;
  /** Przychód miesięczny (abonament roczny / 12), zł. */
  miesiecznieBrutto: number;
  miesiecznieNetto: number;
}

/** Przychód miesięczny z abonamentów Kreator Pro – rok dzielony na 12 (jak MRR w metrykach), netto jak na fakturze. */
export function przychodPro(subskrypcje: { priceAmount: Prisma.Decimal | number | string; interval: 'MONTH' | 'YEAR' }[]): PrzychodPro {
  let brutto = new Prisma.Decimal(0);
  let netto = new Prisma.Decimal(0);
  let roczne = 0;
  for (const s of subskrypcje) {
    const v = rozbicieVat(new Prisma.Decimal(s.priceAmount));
    const dzielnik = s.interval === 'YEAR' ? 12 : 1;
    if (s.interval === 'YEAR') roczne += 1;
    brutto = brutto.add(v.brutto.div(dzielnik));
    netto = netto.add(v.netto.div(dzielnik));
  }
  return {
    aktywne: subskrypcje.length,
    miesieczne: subskrypcje.length - roczne,
    roczne,
    miesiecznieBrutto: Number(brutto.toFixed(2)),
    miesiecznieNetto: Number(netto.toFixed(2)),
  };
}

export interface DzienKreatora {
  dzien: string;
  wywolania: number;
  generacje: number;
  zmiany: number;
  kosztUsd: number;
}

/** 30 dni (UTC) do `teraz` włącznie; dni bez wywołań = zera (wykres bez dziur). */
export function uzupelnijDni(wiersze: DzienKreatora[], teraz: Date, ile = 30): DzienKreatora[] {
  const mapa = new Map(wiersze.map((w) => [w.dzien, w]));
  const dzis = Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), teraz.getUTCDate());
  return Array.from({ length: ile }, (_, i) => {
    const dzien = new Date(dzis - (ile - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return mapa.get(dzien) ?? { dzien, wywolania: 0, generacje: 0, zmiany: 0, kosztUsd: 0 };
  });
}

export const MAKS_OPISU_BLEDU = 160;
export const ILE_BLEDOW = 10;

const skroc = (s: string | null, max = MAKS_OPISU_BLEDU) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const liczba = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** GET /admin/kreator/podsumowanie */
export async function podsumowanieKreatora(prisma: PrismaService, ceny: Ceny, teraz = new Date()) {
  const miesiac = miesiacUtc(teraz);
  const poczatekMies = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), 1));
  const od30 = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), teraz.getUTCDate()) - 29 * 86_400_000);

  const [strony, zuzycie, aktywne, modele, dni, pro, magazyn, bledy] = await Promise.all([
    prisma.$queryRaw<{ razem: number; konta: number; opublikowane: number; generowane: number; bledne: number }[]>`
      SELECT COUNT(*)::int AS "razem", COUNT(DISTINCT "userId")::int AS "konta",
             COUNT(*) FILTER (WHERE "opublikowanaAt" IS NOT NULL)::int AS "opublikowane",
             COUNT(*) FILTER (WHERE "status" = 'GENEROWANIE')::int AS "generowane",
             COUNT(*) FILTER (WHERE "status" = 'BLAD')::int AS "bledne"
      FROM "KreatorStrona"`,
    prisma.kreatorZuzycie.aggregate({ where: { miesiac }, _sum: { generacje: true, zmiany: true } }),
    prisma.kreatorZuzycie.count({ where: { miesiac, OR: [{ generacje: { gt: 0 } }, { zmiany: { gt: 0 } }] } }),
    prisma.$queryRaw<WierszKosztuModelu[]>`
      SELECT "model", COUNT(*)::int AS "wywolania",
             COALESCE(SUM(("inputSummary"->>'wejPozaCache')::float8), 0)::float8 AS "wej",
             COALESCE(SUM("outputTokens"), 0)::float8 AS "wyj",
             COALESCE(SUM(("inputSummary"->>'zapis5m')::float8), 0)::float8 AS "zapis5m",
             COALESCE(SUM(("inputSummary"->>'zapis1h')::float8), 0)::float8 AS "zapis1h",
             COALESCE(SUM(("inputSummary"->>'odczyt')::float8), 0)::float8 AS "odczyt",
             COALESCE(SUM("costUsd"), 0)::float8 AS "kosztUsd"
      FROM "AiInteractionLog"
      WHERE "feature" = ${FUNKCJA_AI_KREATORA} AND "createdAt" >= ${poczatekMies}
      GROUP BY "model"`,
    prisma.$queryRaw<DzienKreatora[]>`
      SELECT to_char("createdAt", 'YYYY-MM-DD') AS "dzien", COUNT(*)::int AS "wywolania",
             COUNT(*) FILTER (WHERE "inputSummary"->>'rodzaj' LIKE 'generacja-%')::int AS "generacje",
             COUNT(*) FILTER (WHERE "inputSummary"->>'rodzaj' LIKE 'zmiana-%')::int AS "zmiany",
             COALESCE(SUM("costUsd"), 0)::float8 AS "kosztUsd"
      FROM "AiInteractionLog"
      WHERE "feature" = ${FUNKCJA_AI_KREATORA} AND "createdAt" >= ${od30}
      GROUP BY 1 ORDER BY 1`,
    prisma.subscription.findMany({
      where: { status: { in: PRO_DZIALA }, isTrial: false, plan: { productKind: ProductKind.KREATOR_PRO }, user: { isInternal: false } },
      select: { priceAmount: true, interval: true },
    }),
    prisma.kreatorZasob.aggregate({ _count: { _all: true }, _sum: { bajty: true } }),
    prisma.kreatorStrona.findMany({
      where: { status: KreatorStatus.BLAD },
      orderBy: { updatedAt: 'desc' },
      take: ILE_BLEDOW,
      select: { id: true, updatedAt: true, bladOpis: true, user: { select: { email: true } } },
    }),
  ]);
  const s = strony[0];
  return {
    miesiac,
    konta: { zeStronami: liczba(s?.konta), aktywneWMiesiacu: aktywne },
    strony: { razem: liczba(s?.razem), opublikowane: liczba(s?.opublikowane), generowane: liczba(s?.generowane), bledne: liczba(s?.bledne) },
    generacje: zuzycie._sum.generacje ?? 0,
    zmiany: zuzycie._sum.zmiany ?? 0,
    koszt: rozbicieKosztow(
      modele.map((m) => ({
        model: m.model,
        wywolania: liczba(m.wywolania),
        wej: liczba(m.wej),
        wyj: liczba(m.wyj),
        zapis5m: liczba(m.zapis5m),
        zapis1h: liczba(m.zapis1h),
        odczyt: liczba(m.odczyt),
        kosztUsd: liczba(m.kosztUsd),
      })),
      ceny,
    ),
    pro: przychodPro(pro),
    dni: uzupelnijDni(
      dni.map((d) => ({ dzien: d.dzien, wywolania: liczba(d.wywolania), generacje: liczba(d.generacje), zmiany: liczba(d.zmiany), kosztUsd: liczba(d.kosztUsd) })),
      teraz,
    ),
    magazyn: { zdjecia: magazyn._count._all, bajty: magazyn._sum.bajty ?? 0 },
    bledy: bledy.map((b) => ({ id: b.id, at: b.updatedAt.toISOString(), email: b.user?.email ?? '–', opis: skroc(b.bladOpis) || 'Bez opisu błędu.' })),
  };
}

export type PodsumowanieKreatora = Awaited<ReturnType<typeof podsumowanieKreatora>>;
