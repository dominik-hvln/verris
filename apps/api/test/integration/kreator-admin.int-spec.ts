import { Prisma } from '@verris/database';
import { DOMYSLNA_KONFIGURACJA_AI } from '../../src/ai/ai-modele.js';
import { miesiacUtc } from '../../src/kreator/konfiguracja.js';
import { podsumowanieKreatora } from '../../src/kreator/kreator.admin.podsumowanie.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * Paczka 123 – podsumowanie kreatora w adminie na prawdziwym Postgresie: zapytania SQL (sumy z JSON-a
 * `inputSummary` w AiInteractionLog, dni w UTC, liczniki stron), abonamenty Kreator Pro i ostatnie błędy generacji.
 */
describe('Paczka 123 – podsumowanie kreatora (baza)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('liczby stron i kont, koszt AI z rozbiciem na cache, Pro (rok / 12), magazyn i błędy bez treści', async () => {
    const p = prisma();
    const teraz = new Date();
    const [a, b, wew] = await Promise.all(
      ['a', 'b', 'wew'].map((x) => p.user.create({ data: { email: `k123-${x}-${Date.now()}@test.verris.pl`, passwordHash: 'x', isInternal: x === 'wew' } })),
    );
    const strona = (userId: string, d: Partial<Prisma.KreatorStronaUncheckedCreateInput> = {}) =>
      p.kreatorStrona.create({ data: { userId, nazwa: 'Tajna nazwa', model: { tajne: 'treść klienta' }, wersjaModelu: 1, odcisk: 'o', ...d } });
    await strona(a.id, { status: 'GOTOWA', opublikowanaAt: teraz });
    await strona(a.id, { status: 'BLAD', bladOpis: 'Nie udało się wygenerować strony – spróbuj ponownie.' });
    await strona(b.id, { status: 'GENEROWANIE' });
    await p.kreatorZuzycie.create({ data: { userId: a.id, miesiac: miesiacUtc(teraz), generacje: 2, zmiany: 5 } });
    await p.kreatorZuzycie.create({ data: { userId: b.id, miesiac: miesiacUtc(teraz), generacje: 0, zmiany: 0 } });
    await p.kreatorZasob.create({ data: { userId: a.id, zrodlo: 'WLASNE', szerokosc: 10, wysokosc: 10, bajty: 2048, sha256: 'x' } });

    const log = (rodzaj: string, s: Record<string, number>, wyj: number, koszt: string, createdAt = teraz) =>
      p.aiInteractionLog.create({
        data: {
          feature: 'kreator', provider: 'anthropic', model: 'claude-sonnet-5-5', status: 'COMPLETED', promptHash: 'h', userId: a.id,
          outputTokens: wyj, costUsd: new Prisma.Decimal(koszt), inputSummary: { rodzaj, wejPozaCache: s.wej, zapis5m: 0, zapis1h: s.zapis1h, odczyt: s.odczyt }, createdAt,
        },
      });
    await log('generacja-lite', { wej: 600, zapis1h: 10_000, odczyt: 0 }, 300, '0.0442');
    await log('zmiana-sekcji-lite', { wej: 400, zapis1h: 0, odczyt: 40_000 }, 200, '0.0068');
    // Nieudane wywołanie (bez tokenów) i inna funkcja AI – nie zmieniają kosztu kreatora.
    await p.aiInteractionLog.create({ data: { feature: 'kreator', provider: 'anthropic', model: 'claude-sonnet-5-5', status: 'FAILED', promptHash: 'h', inputSummary: { rodzaj: 'generacja-lite' } } });
    await p.aiInteractionLog.create({ data: { feature: 'chatbot_client', provider: 'openai', model: 'gpt-6-luna', status: 'COMPLETED', promptHash: 'h', costUsd: new Prisma.Decimal('5') } });
    // Paczka 124 – zdjęcia AI: osobna funkcja, poza kosztem tokenów; suma z inputSummary.
    const obraz = (s: Record<string, number>, koszt: string, status: 'COMPLETED' | 'FAILED' = 'COMPLETED') =>
      p.aiInteractionLog.create({ data: { feature: 'kreator-obraz', provider: 'bfl', model: 'flux-pro-1.1', status, promptHash: 'h', userId: a.id, costUsd: new Prisma.Decimal(koszt), inputSummary: { ...s, proporcje: '4:3' } } });
    await obraz({ obrazy: 2, udane: 2, moderowane: 0 }, '0.08');
    await obraz({ obrazy: 4, udane: 3, moderowane: 1 }, '0.16');
    await obraz({ obrazy: 1, udane: 0, moderowane: 0 }, '0.04', 'FAILED');

    const pro = await utworzPlan({ productKind: 'KREATOR_PRO', slug: 'kreator-pro-k123', priceMonthly: 9.9, priceYearly: 99 });
    const sub = (userId: string, d: Partial<Prisma.SubscriptionUncheckedCreateInput>) =>
      p.subscription.create({ data: { userId, planId: pro.id, interval: 'MONTH', priceAmount: 9.9, status: 'ACTIVE', paymentSource: 'WALLET', ...d } });
    await sub(a.id, {});
    await sub(b.id, { interval: 'YEAR', priceAmount: 99, status: 'PAST_DUE' });
    await sub(b.id, { status: 'SUSPENDED' });
    await sub(wew.id, {});

    const r = await podsumowanieKreatora(p as never, DOMYSLNA_KONFIGURACJA_AI.ceny, teraz);
    expect(r.konta).toEqual({ zeStronami: 2, aktywneWMiesiacu: 1 });
    expect(r.strony).toEqual({ razem: 3, opublikowane: 1, generowane: 1, bledne: 1 });
    expect(r).toMatchObject({ generacje: 2, zmiany: 5 });
    expect(r.koszt.wywolania).toBe(3);
    expect(r.koszt.tokeny).toEqual({ wej: 1000, wyj: 500, zapis5m: 0, zapis1h: 10_000, odczyt: 40_000 });
    expect(r.koszt.cacheZapisUsd).toBeCloseTo(0.04, 9);
    expect(r.koszt.cacheOdczytUsd).toBeCloseTo(0.004, 9);
    expect(r.koszt.razemUsd).toBeCloseTo(0.051, 9);
    expect(r.koszt.oszczednoscUsd).toBeCloseTo(0.056, 9);
    expect(r.koszt.zapisanyUsd).toBeCloseTo(0.051, 9);
    expect(r.pro).toEqual({ aktywne: 2, miesieczne: 1, roczne: 1, miesiecznieBrutto: 18.15, miesiecznieNetto: 14.76 });
    expect(r.magazyn).toEqual({ zdjecia: 1, bajty: 2048 });
    expect(r.obrazyAi).toEqual({ wywolania: 3, obrazy: 7, udane: 5, moderowane: 1, kosztUsd: 0.28 });
    const dzis = r.dni[r.dni.length - 1];
    expect(dzis).toMatchObject({ dzien: teraz.toISOString().slice(0, 10), wywolania: 3, generacje: 2, zmiany: 1 });
    expect(dzis.kosztUsd).toBeCloseTo(0.051, 9);
    expect(r.bledy).toEqual([{ id: expect.any(String), at: expect.any(String), email: a.email, opis: 'Nie udało się wygenerować strony – spróbuj ponownie.' }]);
    expect(JSON.stringify(r)).not.toContain('Tajna nazwa');
    expect(JSON.stringify(r)).not.toContain('treść klienta');
  });
});
