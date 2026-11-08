import { PRZYKLAD_SALON, walidujStrone, type FunkcjeAiKreatora, type Strona } from '@verris/kreator';
import { KreatorService, LIMIT_WERSJI } from '../../src/kreator/kreator.service.js';
import { KLUCZ_KONFIGURACJI_KREATORA, miesiacUtc } from '../../src/kreator/konfiguracja.js';
import { wersjaKreatora } from '../../src/kreator/wersja-kreatora.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * Paczka 119 – Verris Kreator na prawdziwym Postgresie: wersja kreatora z relacji usługa → plan (productKind),
 * zapis strony z wersjami i przycinaniem do LIMIT_WERSJI, atomowa rezerwacja limitu w KreatorZuzycie (upsert
 * w miesiącu, równoległe żądania), kaskada przy usunięciu konta. AI i renderer – atrapy (bez sieci).
 */
const SALON = (() => {
  const w = walidujStrone(PRZYKLAD_SALON);
  if (!w.ok) throw new Error(w.bledy.join('; '));
  return w.strona;
})();
const zeStylem = (styl: string): Strona => ({ ...structuredClone(SALON), motyw: { ...SALON.motyw, styl } });

const ai = {
  wybierzKierunki: (_b: unknown, ile: number) => Array.from({ length: ile }, (_, i) => ({ styl: `k${i}` })),
  budujZapytanieGeneracji: () => ({ system: [{ tekst: 'M', cache: '1h' }], wiadomosci: [{ role: 'user', content: 'b' }], maxTokens: 1000, rodzaj: 'generacja-lite' }),
  odczytajWynikGeneracji: (t: string) => walidujStrone(JSON.parse(t)),
  wiadomosciNaprawy: () => [],
  budujZapytanieZmiany: () => ({ system: [], wiadomosci: [], maxTokens: 1, rodzaj: 'zmiana' }),
  odczytajWynikZmiany: (_s: unknown, t: string) => walidujStrone(JSON.parse(t)),
  odciskStrony: (s: Strona) => `odcisk-${s.motyw.styl}`,
} as unknown as FunkcjeAiKreatora;

function serwis() {
  const provider = {
    anthropicZBlokami: vi.fn(async () => ({
      wynik: JSON.stringify(SALON), dostawca: 'anthropic', model: 'claude-sonnet-5-5',
      wej: 120, wyj: 9000, zapis5m: 0, zapis1h: 6000, odczyt: 0, kosztUsd: 0.1023, powodKonca: 'end_turn',
    })),
  };
  const svc = new KreatorService(prisma() as never, provider as never, { get: () => undefined } as never, ai, { renderuj: () => [] });
  const zadania: Array<() => Promise<void>> = [];
  (svc as unknown as { wTle: (f: () => Promise<void>) => void }).wTle = (f) => zadania.push(f);
  return { svc, provider, dokoncz: async () => { while (zadania.length) await zadania.shift()!(); } };
}

async function klient(opts: { trial?: boolean; productKind?: 'HOSTING' | 'EMAIL'; status?: 'ACTIVE' | 'SUSPENDED' } = {}) {
  const plan = await utworzPlan({ productKind: opts.productKind ?? 'HOSTING' });
  const user = await prisma().user.create({ data: { email: `kreator-${Math.random().toString(36).slice(2)}@test.verris.pl`, passwordHash: 'x' } });
  await prisma().subscription.create({
    data: { userId: user.id, planId: plan.id, interval: 'MONTH', priceAmount: 45, status: opts.status ?? 'ACTIVE', isTrial: opts.trial ?? false },
  });
  return user;
}

describe('Verris Kreator – baza', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().$executeRawUnsafe('TRUNCATE TABLE "KreatorStrona", "KreatorWersja", "KreatorZuzycie", "PurchasedAddon", "AiInteractionLog" CASCADE;');
    await prisma().platformSetting.create({ data: { key: KLUCZ_KONFIGURACJI_KREATORA, value: JSON.stringify({ wlaczony: true }) } });
  });
  afterAll(rozlacz);

  it('wersja kreatora: hosting/próba/pro z relacji usługa → plan; poczta i zawieszony hosting = brak dostępu', async () => {
    expect(await wersjaKreatora(prisma() as never, (await klient()).id)).toBe('hosting');
    expect(await wersjaKreatora(prisma() as never, (await klient({ trial: true })).id)).toBe('proba');
    expect(await wersjaKreatora(prisma() as never, (await klient({ productKind: 'EMAIL' })).id)).toBeNull();
    expect(await wersjaKreatora(prisma() as never, (await klient({ status: 'SUSPENDED' })).id)).toBeNull();
    // Paczka 121 — Pro = subskrypcja KREATOR_PRO (ACTIVE/PAST_DUE) przy płatnym hostingu; dawny dodatek nie działa.
    const pro = await klient();
    await prisma().purchasedAddon.create({ data: { userId: pro.id, slug: 'kreator_pro', name: 'Kreator Pro', amount: 9.9, status: 'APPLIED' } });
    expect(await wersjaKreatora(prisma() as never, pro.id)).toBe('hosting');
    const planPro = await utworzPlan({ productKind: 'KREATOR_PRO', priceMonthly: 9.9, priceYearly: 99 });
    const abonament = await prisma().subscription.create({
      data: { userId: pro.id, planId: planPro.id, interval: 'MONTH', priceAmount: 9.9, status: 'ACTIVE', paymentSource: 'WALLET' },
    });
    expect(await wersjaKreatora(prisma() as never, pro.id)).toBe('pro');
    await prisma().subscription.update({ where: { id: abonament.id }, data: { status: 'PAST_DUE' } });
    expect(await wersjaKreatora(prisma() as never, pro.id)).toBe('pro');
    await prisma().subscription.update({ where: { id: abonament.id }, data: { status: 'SUSPENDED' } });
    expect(await wersjaKreatora(prisma() as never, pro.id)).toBe('hosting');
  });

  it('generacja: strona GOTOWA z modelem JSON, wersja 1, zużycie miesiąca z kosztem i cache', async () => {
    const u = await klient();
    const { svc, dokoncz } = serwis();
    const { id } = await svc.utworz(u.id, u.id, { nazwa: 'Salon', brief: { opis: 'Salon fryzjerski w Poznaniu i okolicach.', typ: 'wizytowka', firma: { branza: 'fryzjer' } } });
    await dokoncz();
    const s = await prisma().kreatorStrona.findUniqueOrThrow({ where: { id }, include: { wersje: true } });
    expect(s).toMatchObject({ status: 'GOTOWA', branza: SALON.firma.branza, odcisk: `odcisk-${SALON.motyw.styl}`, propozycje: null });
    expect(walidujStrone(s.model).ok).toBe(true);
    expect(s.wersje.map((v) => [v.numer, v.zrodlo])).toEqual([[1, 'AI_GENERACJA']]);
    const z = await prisma().kreatorZuzycie.findUniqueOrThrow({ where: { userId_miesiac: { userId: u.id, miesiac: miesiacUtc() } } });
    expect(z).toMatchObject({ generacje: 1, zmiany: 0, wejTokeny: 120, wyjTokeny: 9000, cacheZapis: 6000, cacheOdczyt: 0 });
    expect(Number(z.kosztUsd)).toBeCloseTo(0.1023, 4);
  });

  it(`zapis ręczny: kolejne numery wersji, przycinanie do ${LIMIT_WERSJI} – znikają najstarsze RECZNE, AI zostaje`, async () => {
    const u = await klient();
    const { svc } = serwis();
    const s = await prisma().kreatorStrona.create({
      data: { userId: u.id, nazwa: 'S', model: SALON as never, wersjaModelu: 1, odcisk: 'x', status: 'GOTOWA' },
    });
    await prisma().kreatorWersja.createMany({
      data: [
        { stronaId: s.id, numer: 1, model: SALON as never, zrodlo: 'AI_GENERACJA' },
        ...Array.from({ length: LIMIT_WERSJI - 2 }, (_, i) => ({ stronaId: s.id, numer: i + 2, model: SALON as never, zrodlo: 'RECZNA' as const })),
      ],
    });
    await svc.zapiszRecznie(u.id, s.id, zeStylem('a')); // 200 wersji – bez przycinania
    await svc.zapiszRecznie(u.id, s.id, zeStylem('b')); // 201 → wypada numer 2
    await svc.zapiszRecznie(u.id, s.id, zeStylem('c')); // 201 → wypada numer 3
    const wersje = await prisma().kreatorWersja.findMany({ where: { stronaId: s.id }, orderBy: { numer: 'asc' }, select: { numer: true, zrodlo: true } });
    expect(wersje).toHaveLength(LIMIT_WERSJI);
    expect(wersje.slice(0, 2)).toEqual([{ numer: 1, zrodlo: 'AI_GENERACJA' }, { numer: 4, zrodlo: 'RECZNA' }]);
    expect(wersje.at(-1)).toEqual({ numer: LIMIT_WERSJI + 2, zrodlo: 'RECZNA' });
    const po = await prisma().kreatorStrona.findUniqueOrThrow({ where: { id: s.id } });
    expect((po.model as Strona).motyw.styl).toBe('c');
    expect(po.odcisk).toBe('odcisk-c');

    // Przywrócenie = nowa wersja z modelem tamtej, numer ciągnie się dalej.
    await svc.przywroc(u.id, s.id, LIMIT_WERSJI);
    const ostatnia = await prisma().kreatorWersja.findFirstOrThrow({ where: { stronaId: s.id }, orderBy: { numer: 'desc' } });
    expect(ostatnia).toMatchObject({ numer: LIMIT_WERSJI + 3, zrodlo: 'PRZYWROCENIE' });
  });

  it('licznik zużycia: jeden wiersz na miesiąc (upsert), równoległe rezerwacje nie przekraczają limitu, zwrot i doliczenie kosztu', async () => {
    const u = await klient();
    const { svc } = serwis();
    const wyniki = await Promise.all(Array.from({ length: 8 }, () => svc.rezerwuj(u.id, 'zmiany', 3)));
    expect(wyniki.filter(Boolean)).toHaveLength(3);
    expect(await prisma().kreatorZuzycie.count({ where: { userId: u.id } })).toBe(1);

    await svc.zwolnij(u.id, miesiacUtc(), 'zmiany');
    await svc.dolicz(u.id, { wej: 10, wyj: 20, cacheZapis: 30, cacheOdczyt: 40, kosztUsd: 0.01234 });
    await svc.dolicz(u.id, { wej: 1, wyj: 2, cacheZapis: 3, cacheOdczyt: 4, kosztUsd: 0.00001 });
    const z = await prisma().kreatorZuzycie.findUniqueOrThrow({ where: { userId_miesiac: { userId: u.id, miesiac: miesiacUtc() } } });
    expect(z).toMatchObject({ zmiany: 2, generacje: 0, wejTokeny: 11, wyjTokeny: 22, cacheZapis: 33, cacheOdczyt: 44 });
    // Decimal(10,4): każde doliczenie zaokrąglane do 0,0001 USD (dokładny koszt wywołań – AiInteractionLog, 6 miejsc).
    expect(Number(z.kosztUsd)).toBe(0.0123);
    // Zwrot nie schodzi poniżej zera.
    for (let i = 0; i < 5; i++) await svc.zwolnij(u.id, miesiacUtc(), 'zmiany');
    expect((await prisma().kreatorZuzycie.findFirstOrThrow({ where: { userId: u.id } })).zmiany).toBe(0);
  });

  it('usunięcie konta kasuje strony, wersje i zużycie (kaskada); cudza strona → 404 bez usunięcia', async () => {
    const u = await klient();
    const obcy = await klient();
    const { svc } = serwis();
    const s = await prisma().kreatorStrona.create({ data: { userId: u.id, nazwa: 'S', model: SALON as never, wersjaModelu: 1, odcisk: 'x', status: 'GOTOWA' } });
    await prisma().kreatorWersja.create({ data: { stronaId: s.id, numer: 1, model: SALON as never, zrodlo: 'RECZNA' } });
    await svc.rezerwuj(u.id, 'generacje', 3);
    await expect(svc.usun(obcy.id, s.id)).rejects.toThrow(/Nie znaleziono strony/);
    await expect(svc.pobierz(obcy.id, s.id)).rejects.toThrow(/Nie znaleziono strony/);
    await prisma().user.delete({ where: { id: u.id } });
    expect(await prisma().kreatorStrona.count()).toBe(0);
    expect(await prisma().kreatorWersja.count()).toBe(0);
    expect(await prisma().kreatorZuzycie.count()).toBe(0);
  });

  it('paczka 123 – ponowna generacja: brief z bazy, ta sama strona, wersja „przed” i limit; JSONB briefu bez strat', async () => {
    const u = await klient();
    const { svc, dokoncz } = serwis();
    const brief = { opis: 'Salon fryzjerski w Poznaniu, strzyżenie i koloryzacja.', typ: 'wizytowka' as const, firma: { nazwa: 'Salon', branza: 'fryzjer' } };
    const { id } = await svc.utworz(u.id, u.id, { nazwa: 'Salon', brief });
    await dokoncz();
    expect((await prisma().kreatorStrona.findUniqueOrThrow({ where: { id } })).brief).toEqual(brief);
    const w = await svc.generujPonownie(u.id, u.id, id);
    expect(w.status).toBe('GENEROWANIE');
    await dokoncz();
    const s = await prisma().kreatorStrona.findUniqueOrThrow({ where: { id } });
    expect(s.status).toBe('GOTOWA');
    const wersje = await prisma().kreatorWersja.findMany({ where: { stronaId: id }, orderBy: { numer: 'asc' } });
    expect(wersje.map((v) => [v.numer, v.zrodlo, v.opis])).toEqual([
      [1, 'AI_GENERACJA', 'Strona wygenerowana przez AI'],
      [2, 'RECZNA', 'Projekt przed wygenerowaniem od nowa'],
      [3, 'AI_GENERACJA', 'Strona wygenerowana przez AI'],
    ]);
    expect((await prisma().kreatorZuzycie.findUniqueOrThrow({ where: { userId_miesiac: { userId: u.id, miesiac: miesiacUtc() } } })).generacje).toBe(2);
    expect(await prisma().kreatorStrona.count({ where: { userId: u.id } })).toBe(1);
  });
});
