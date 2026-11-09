import sharp from 'sharp';
import { PRZYKLAD_SALON } from '@verris/kreator';
import { DOMYSLNA_KONFIGURACJA_KREATORA, miesiacUtc, type KonfiguracjaKreatora } from '../../src/kreator/konfiguracja.js';
import { KreatorObrazyAiService } from '../../src/kreator/generowanie/obrazy-ai.service.js';
import { KreatorZasobyService } from '../../src/kreator/zasoby.service.js';
import { BibliotekaZdjec } from '../../src/kreator/biblioteka/biblioteka.js';
import type { GeneratorObrazow } from '../../src/kreator/generowanie/generator.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * Paczka 124 – zdjęcia AI na prawdziwym Postgresie: atomowa rezerwacja limitu miesiąca (równoległe żądania nie
 * przekroczą limitu), zwrot nie schodzi poniżej zera, pełne generowanie zapisuje KreatorZasob ze źródłem AI,
 * licznik obrazyAi w KreatorZuzycie i koszt w AiInteractionLog (funkcja 'kreator-obraz'). Dostawcy (Anthropic,
 * generator obrazów) i magazyn plików – atrapy.
 */
describe('Paczka 124 – zdjęcia AI (baza)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  const konf: KonfiguracjaKreatora = { ...DOMYSLNA_KONFIGURACJA_KREATORA, obrazyAi: { ...DOMYSLNA_KONFIGURACJA_KREATORA.obrazyAi, wlaczone: true } };

  function serwis(generator?: GeneratorObrazow) {
    const p = prisma();
    const kreator = { dostep: async () => ({ dostep: true, wersja: 'hosting', konf }), konfiguracja: async () => konf, dolicz: async () => undefined };
    const provider = {
      budzetPlatformyWyczerpanyTeraz: async () => false,
      anthropicZBlokami: async () => ({ wynik: '{"ok":true,"prompt":"Bright bakery counter with fresh bread, morning light","alt":"Lada piekarni ze świeżym chlebem"}', wej: 1, wyj: 1, zapis5m: 0, zapis1h: 0, odczyt: 0, kosztUsd: 0.001 }),
    };
    const storage = { putObject: async () => undefined, removeObject: async () => undefined };
    const config = { get: (k: string) => (k === 'appKmsKey' ? 'k'.repeat(48) : undefined) };
    const zasoby = new KreatorZasobyService(p as never, config as never, storage as never, kreator as never, new BibliotekaZdjec([]));
    const g: GeneratorObrazow = generator ?? {
      nazwa: 'bfl',
      f: fetch,
      wlaczony: () => true,
      generuj: async (z) => {
        const obrazy = await Promise.all(Array.from({ length: z.ile }, (_, i) => sharp({ create: { width: 900, height: 600, channels: 3, background: `#5${i}3311` } }).jpeg().toBuffer()));
        return { obrazy: obrazy.map((dane) => ({ dane })), rozliczone: z.ile, moderowane: 0 };
      },
    };
    return new KreatorObrazyAiService(p as never, provider as never, kreator as never, zasoby, [g]);
  }

  it('rezerwacja atomowa: 12 równoległych po 4 przy limicie 20 → razem dokładnie 20; zwrot nie schodzi poniżej zera', async () => {
    const p = prisma();
    const u = await p.user.create({ data: { email: `k124-rez-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const s = serwis();
    const wyniki = await Promise.all(Array.from({ length: 12 }, () => s.rezerwuj(u.id, 4, 20)));
    const suma = wyniki.reduce((a, w) => a + (w?.ile ?? 0), 0);
    expect(suma).toBe(20);
    const w = await p.kreatorZuzycie.findUnique({ where: { userId_miesiac: { userId: u.id, miesiac: miesiacUtc() } } });
    expect(w?.obrazyAi).toBe(20);
    await s.zwolnij(u.id, miesiacUtc(), 25);
    expect((await p.kreatorZuzycie.findUnique({ where: { userId_miesiac: { userId: u.id, miesiac: miesiacUtc() } } }))?.obrazyAi).toBe(20);
    await s.zwolnij(u.id, miesiacUtc(), 3);
    expect((await p.kreatorZuzycie.findUnique({ where: { userId_miesiac: { userId: u.id, miesiac: miesiacUtc() } } }))?.obrazyAi).toBe(17);
  });

  it('generowanie: zasoby AI w bibliotece konta, licznik miesiąca, koszt w dzienniku AI bez treści opisu', async () => {
    const p = prisma();
    const u = await p.user.create({ data: { email: `k124-gen-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const strona = await p.kreatorStrona.create({ data: { userId: u.id, nazwa: 'Piekarnia', model: PRZYKLAD_SALON as never, wersjaModelu: 1, odcisk: 'o', status: 'GOTOWA' } });
    const w = await serwis().generuj(u.id, u.id, { opis: 'Lada piekarni pana Kowalskiego', stronaId: strona.id, proporcje: '3:2' });
    expect(w.zasoby).toHaveLength(2);
    expect(w).toMatchObject({ limit: 20, pozostalo: 18 });
    const zasoby = await p.kreatorZasob.findMany({ where: { userId: u.id } });
    expect(zasoby.map((z) => [z.zrodlo, z.autor, z.licencja, z.alt, z.stronaId])).toEqual([
      ['AI', 'Verris Kreator AI', 'wygenerowane-ai', 'Lada piekarni ze świeżym chlebem', strona.id],
      ['AI', 'Verris Kreator AI', 'wygenerowane-ai', 'Lada piekarni ze świeżym chlebem', strona.id],
    ]);
    expect((await p.kreatorZuzycie.findUnique({ where: { userId_miesiac: { userId: u.id, miesiac: miesiacUtc() } } }))?.obrazyAi).toBe(2);
    const logi = await p.aiInteractionLog.findMany({ where: { feature: 'kreator-obraz' } });
    expect(logi).toHaveLength(1);
    expect(Number(logi[0]!.costUsd)).toBeCloseTo(0.08, 6);
    expect(logi[0]).toMatchObject({ provider: 'bfl', model: 'flux-pro-1.1', status: 'COMPLETED', userId: u.id });
    expect(JSON.stringify(logi[0])).not.toContain('Kowalskiego');
  });

  it('błąd dostawcy → limit wraca do zera, koszt przyjętych zleceń zapisany', async () => {
    const p = prisma();
    const u = await p.user.create({ data: { email: `k124-blad-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
    const strona = await p.kreatorStrona.create({ data: { userId: u.id, nazwa: 'P', model: PRZYKLAD_SALON as never, wersjaModelu: 1, odcisk: 'o', status: 'GOTOWA' } });
    const { BladGeneratora, KOMUNIKATY_GENERATORA } = await import('../../src/kreator/generowanie/generator.js');
    const s = serwis({ nazwa: 'bfl', f: fetch, wlaczony: () => true, generuj: async () => Promise.reject(new BladGeneratora('blad', KOMUNIKATY_GENERATORA.blad, 'HTTP 500', 1)) });
    await expect(s.generuj(u.id, u.id, { opis: 'Lada piekarni', stronaId: strona.id })).rejects.toThrow(KOMUNIKATY_GENERATORA.blad);
    expect((await p.kreatorZuzycie.findUnique({ where: { userId_miesiac: { userId: u.id, miesiac: miesiacUtc() } } }))?.obrazyAi).toBe(0);
    const log = await p.aiInteractionLog.findFirst({ where: { feature: 'kreator-obraz' } });
    expect(log).toMatchObject({ status: 'FAILED' });
    expect(Number(log!.costUsd)).toBeCloseTo(0.04, 6);
  });
});
