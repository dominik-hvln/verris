import { Prisma, ProductKind } from '@verris/database';
import type { LicznikMarki, WersjaKreatora, WersjaMarkiKonta } from '@verris/kreator';
import type { PrismaService } from '../prisma/prisma.service.js';
import { miesiacUtc } from '../kreator/konfiguracja.js';
import { PRO_DZIALA } from '../kreator/kreator-pro.js';
import type { KonfiguracjaMarki } from './konfiguracja-marki.js';

/**
 * Kreator marki (paczka 131) – wersja konta i limity:
 *  - wersja 'proba' – jedyny działający hosting jest w okresie próbnym (kreator stron: wersjaKreatora = 'proba');
 *    propozycje i edycja działają, eksport i stopka – po opłaceniu hostingu (blokada PROBA);
 *  - 'pakiet' – opłacony Pakiet marki (albo, gdy włączone w adminie, Kreator Pro opłacany rocznie);
 *  - 'hosting' – reszta (płatny hosting).
 * Limity w cenie hostingu są MIESIĘCZNE (KreatorMarkaZuzycie), pula Pakietu – ŁĄCZNA (KreatorMarkaZakup.serie/zmianyAi
 * zapisane przy zakupie). Rezerwacja: najpierw miesiąc, potem pula Pakietu; atomowo (updateMany z warunkiem), zwrot
 * przy błędzie AI – jak kreator stron (KreatorService.rezerwuj/zwolnij).
 */

export type PoleLimituMarki = 'serie' | 'zmianyAi';

/** Rezerwacja jednej operacji – do zwrotu przy błędzie. */
export type RezerwacjaMarki = { zrodlo: 'miesiac'; miesiac: string; pole: PoleLimituMarki } | { zrodlo: 'pakiet'; zakupId: string; pole: PoleLimituMarki };

type Db = Pick<PrismaService, 'kreatorMarkaZuzycie' | 'kreatorMarkaZakup' | 'subscription' | 'kreatorMarka'>;

/** Pakiet marki konta: opłacone zakupy PAKIET (pula łączna). */
export async function pakietyKonta(db: Pick<PrismaService, 'kreatorMarkaZakup'>, userId: string) {
  return db.kreatorMarkaZakup.findMany({
    where: { userId, rodzaj: 'PAKIET', status: 'OPLACONY' },
    orderBy: { oplaconoAt: 'asc' },
    select: { id: true, serie: true, zmianyAi: true, serieUzyte: true, zmianyAiUzyte: true, aktualizacjeDo: true, oplaconoAt: true },
  });
}

/** Kreator Pro opłacany rocznie (ACTIVE / PAST_DUE) – zawiera Pakiet, gdy admin tak ustawi. */
async function proRoczny(db: Pick<PrismaService, 'subscription'>, userId: string): Promise<boolean> {
  const n = await db.subscription.count({
    where: { userId, status: { in: PRO_DZIALA }, interval: 'YEAR', plan: { productKind: ProductKind.KREATOR_PRO } },
  });
  return n > 0;
}

export interface StanLimitow {
  wersja: WersjaMarkiKonta;
  pakietKupiony: boolean;
  aktualizacjeDo: string | null;
  marki: LicznikMarki;
  serie: LicznikMarki;
  zmianyAi: LicznikMarki;
}

export async function stanLimitow(db: Db, userId: string, konf: KonfiguracjaMarki, wersjaKreatora: WersjaKreatora | null): Promise<StanLimitow> {
  const miesiac = miesiacUtc();
  const [pakiety, drugie, marek, zuzycie, pro] = await Promise.all([
    pakietyKonta(db, userId),
    db.kreatorMarkaZakup.count({ where: { userId, rodzaj: 'DRUGA_MARKA', status: 'OPLACONY' } }),
    db.kreatorMarka.count({ where: { userId } }),
    db.kreatorMarkaZuzycie.findUnique({ where: { userId_miesiac: { userId, miesiac } } }),
    konf.pakietWKreatorzeProRocznym && wersjaKreatora === 'pro' ? proRoczny(db, userId) : Promise.resolve(false),
  ]);
  const pakietKupiony = pakiety.length > 0;
  const wersja: WersjaMarkiKonta = wersjaKreatora === 'proba' || wersjaKreatora === null ? 'proba' : pakietKupiony || pro ? 'pakiet' : 'hosting';
  const h = konf.wCenieHostingu;
  const suma = (f: (p: (typeof pakiety)[number]) => number) => pakiety.reduce((s, p) => s + f(p), 0);
  const aktualizacjeDo = pakiety.map((p) => p.aktualizacjeDo).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
  return {
    wersja,
    pakietKupiony,
    aktualizacjeDo: aktualizacjeDo?.toISOString() ?? null,
    marki: { uzyte: marek, limit: h.marek + drugie },
    serie: { uzyte: (zuzycie?.serie ?? 0) + suma((p) => p.serieUzyte), limit: h.seriiMies + suma((p) => p.serie) },
    zmianyAi: { uzyte: (zuzycie?.zmianyAi ?? 0) + suma((p) => p.zmianyAiUzyte), limit: h.zmianAiMies + suma((p) => p.zmianyAi) },
  };
}

async function wierszZuzycia(db: Pick<PrismaService, 'kreatorMarkaZuzycie'>, userId: string, miesiac: string): Promise<void> {
  try {
    await db.kreatorMarkaZuzycie.upsert({ where: { userId_miesiac: { userId, miesiac } }, create: { userId, miesiac }, update: {} });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
  }
}

/** Atomowa rezerwacja jednej serii / zmiany AI: miesiąc w cenie hostingu, potem pula Pakietu. null = limit wyczerpany. */
export async function rezerwuj(db: Db, userId: string, pole: PoleLimituMarki, konf: KonfiguracjaMarki): Promise<RezerwacjaMarki | null> {
  const miesiac = miesiacUtc();
  const limit = pole === 'serie' ? konf.wCenieHostingu.seriiMies : konf.wCenieHostingu.zmianAiMies;
  if (limit > 0) {
    await wierszZuzycia(db, userId, miesiac);
    const r = await db.kreatorMarkaZuzycie.updateMany({ where: { userId, miesiac, [pole]: { lt: limit } }, data: { [pole]: { increment: 1 } } });
    if (r.count) return { zrodlo: 'miesiac', miesiac, pole };
  }
  const uzyte = pole === 'serie' ? 'serieUzyte' : 'zmianyAiUzyte';
  for (const p of await pakietyKonta(db, userId)) {
    const pula = pole === 'serie' ? p.serie : p.zmianyAi;
    const r = await db.kreatorMarkaZakup.updateMany({ where: { id: p.id, status: 'OPLACONY', [uzyte]: { lt: pula } }, data: { [uzyte]: { increment: 1 } } });
    if (r.count) return { zrodlo: 'pakiet', zakupId: p.id, pole };
  }
  return null;
}

export async function zwolnij(db: Db, userId: string, r: RezerwacjaMarki): Promise<void> {
  if (r.zrodlo === 'miesiac') {
    await db.kreatorMarkaZuzycie.updateMany({ where: { userId, miesiac: r.miesiac, [r.pole]: { gt: 0 } }, data: { [r.pole]: { decrement: 1 } } });
    return;
  }
  const uzyte = r.pole === 'serie' ? 'serieUzyte' : 'zmianyAiUzyte';
  await db.kreatorMarkaZakup.updateMany({ where: { id: r.zakupId, [uzyte]: { gt: 0 } }, data: { [uzyte]: { decrement: 1 } } });
}

/** Tokeny i koszt AI (także nieudanych prób) w bieżącym miesiącu – raport w adminie. */
export interface LicznikAiMarki {
  wej: number;
  wyj: number;
  cacheZapis: number;
  cacheOdczyt: number;
  kosztUsd: number;
}
export const nowyLicznikMarki = (): LicznikAiMarki => ({ wej: 0, wyj: 0, cacheZapis: 0, cacheOdczyt: 0, kosztUsd: 0 });

export async function dolicz(db: Pick<PrismaService, 'kreatorMarkaZuzycie'>, userId: string, l: LicznikAiMarki): Promise<void> {
  if (!l.wej && !l.wyj && !l.cacheZapis && !l.cacheOdczyt && !l.kosztUsd) return;
  const miesiac = miesiacUtc();
  await wierszZuzycia(db, userId, miesiac);
  await db.kreatorMarkaZuzycie.update({
    where: { userId_miesiac: { userId, miesiac } },
    data: {
      wejTokeny: { increment: l.wej },
      wyjTokeny: { increment: l.wyj },
      cacheZapis: { increment: l.cacheZapis },
      cacheOdczyt: { increment: l.cacheOdczyt },
      kosztUsd: { increment: new Prisma.Decimal(l.kosztUsd.toFixed(6)) },
    },
  });
}
