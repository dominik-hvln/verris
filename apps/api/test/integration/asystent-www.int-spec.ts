import { AsystentWwwService } from '../../src/ai/asystent-www/asystent-www.service.js';
import { KLUCZ_ASYSTENTA_WWW } from '../../src/ai/asystent-www/konfiguracja.js';
import { LeadsService } from '../../src/leads/leads.service.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * Asystent AI na verris.pl (1.11.2026) na prawdziwym Postgresie: zapis rozmowy i kosztu (transakcja z increment),
 * retencja 30 dni z kaskadą wiadomości, limity kosztu i dobowy limit IP liczone zapytaniami do bazy,
 * przebieg rozmowy w mailu „Poproś o telefon”. Anthropic zastąpiony atrapą (bez prawdziwych wywołań).
 */
describe('asystent AI www – baza', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().$executeRawUnsafe('TRUNCATE TABLE "AsystentRozmowa", "AsystentWiadomosc", "AiInteractionLog" CASCADE;');
    await prisma().platformSetting.create({ data: { key: KLUCZ_ASYSTENTA_WWW, value: JSON.stringify({ wlaczony: true, limitDziennyUsd: 1, limitMiesiecznyUsd: 5 }) } });
  });
  afterAll(rozlacz);

  function asystent() {
    const odpowiedzi: string[] = [];
    const provider = {
      klucz: () => 'sk-test',
      wywolajModelem: vi.fn(async (i: { model: string; system: string }) => ({
        wynik: odpowiedzi.shift() ?? '{"kategoria":"oferta"}',
        dostawca: 'anthropic' as const,
        model: i.model,
        wej: 1000,
        wyj: 200,
        kosztUsd: 0.004,
      })),
    };
    const svc = new AsystentWwwService(
      prisma() as never,
      provider as never,
      { retrieve: async () => [] } as never,
      { get: (k: string) => (k === 'ASYSTENT_IP_SALT' ? 'sol-testowa' : undefined) } as never,
      { isEnabled: () => false, verify: async () => undefined } as never,
    );
    const runda = (tekst: string) => odpowiedzi.push('{"kategoria":"oferta"}', JSON.stringify({ odpowiedz: tekst, zrodla: ['cennik'], nieWiem: false }));
    return { svc, provider, runda };
  }

  it('zapisuje rozmowę, wiadomości i koszt; druga wiadomość idzie z historią; IP tylko jako skrót', async () => {
    await utworzPlan({ slug: 'verris-hosting', productKind: 'HOSTING', priceMonthly: 45, priceYearly: 449 });
    const { svc, provider, runda } = asystent();
    runda('Hosting kosztuje 45,00 zł brutto.');
    const r1 = await svc.zapytaj({ pytanie: 'Ile kosztuje hosting?' }, { ip: '203.0.113.7' });
    runda('Tak, rocznie taniej.');
    const r2 = await svc.zapytaj({ rozmowaId: r1.rozmowaId, pytanie: 'A rocznie?' }, { ip: '203.0.113.7' });
    expect(r2.rozmowaId).toBe(r1.rozmowaId);

    const rozmowa = await prisma().asystentRozmowa.findUniqueOrThrow({ where: { id: r1.rozmowaId }, include: { wiadomosci: { orderBy: { createdAt: 'asc' } } } });
    expect(rozmowa.liczbaWymian).toBe(2);
    expect(Number(rozmowa.kosztUsd)).toBeCloseTo(0.016, 6);
    expect(rozmowa.wiadomosci.map((w) => [w.rola, w.tresc])).toEqual([
      ['USER', 'Ile kosztuje hosting?'],
      ['ASSISTANT', 'Hosting kosztuje 45,00 zł brutto.'],
      ['USER', 'A rocznie?'],
      ['ASSISTANT', 'Tak, rocznie taniej.'],
    ]);
    expect(rozmowa.wiadomosci[1].zrodla).toEqual([{ id: 'cennik', tytul: 'Cennik', url: 'https://verris.pl/cennik' }]);
    expect(rozmowa.ipHash).not.toContain('203.0.113.7');
    // Cena z bazy trafia do źródeł (brutto i netto).
    expect(provider.wywolajModelem.mock.calls[1][0].system).toContain('45,00 zł brutto (36,59 zł netto)');
    // Historia rozmowy idzie do modelu przy drugim pytaniu.
    expect(JSON.stringify(provider.wywolajModelem.mock.calls[3][0])).toContain('Ile kosztuje hosting?');
    // Koszt w dzienniku AI: 2 pytania × (strażnik + odpowiedź).
    const log = await prisma().aiInteractionLog.findMany({ where: { feature: { startsWith: 'asystent_www' } } });
    expect(log).toHaveLength(4);
    expect(await svc.kosztOd(new Date(Date.now() - 60_000))).toBeCloseTo(0.016, 6);
  });

  it('retencja: rozmowy bez wiadomości od 30 dni znikają razem z wiadomościami, nowsze zostają', async () => {
    const stara = await prisma().asystentRozmowa.create({ data: { ipHash: 'a', wiadomosci: { create: [{ rola: 'USER', tresc: 'stare' }] } } });
    const nowa = await prisma().asystentRozmowa.create({ data: { ipHash: 'b', wiadomosci: { create: [{ rola: 'USER', tresc: 'nowe' }] } } });
    await prisma().$executeRawUnsafe(`UPDATE "AsystentRozmowa" SET "updatedAt" = now() - interval '31 days' WHERE id = '${stara.id}'`);
    await prisma().$executeRawUnsafe(`UPDATE "AsystentRozmowa" SET "updatedAt" = now() - interval '29 days' WHERE id = '${nowa.id}'`);

    expect(await asystent().svc.usunStare()).toBe(1);
    expect(await prisma().asystentRozmowa.findMany({ select: { id: true } })).toEqual([{ id: nowa.id }]);
    expect((await prisma().asystentWiadomosc.findMany()).map((w) => w.tresc)).toEqual(['nowe']);
  });

  it('limit kosztu: dzienny liczy tylko funkcje asystenta; po przekroczeniu 503 bez wywołania AI', async () => {
    const { svc, provider } = asystent();
    await prisma().aiInteractionLog.create({
      data: { feature: 'chatbot_basic', provider: 'anthropic', model: 'x', costUsd: 50, status: 'COMPLETED', promptHash: 'h1' },
    });
    expect(await svc.limitKosztuPrzekroczony(await svc.konfiguracja())).toBeNull();
    await prisma().aiInteractionLog.create({
      data: { feature: 'asystent_www', provider: 'anthropic', model: 'x', costUsd: 1, status: 'COMPLETED', promptHash: 'h2' },
    });
    expect(await svc.limitKosztuPrzekroczony(await svc.konfiguracja())).toBe('dzienny');
    await expect(svc.zapytaj({ pytanie: 'Hej' }, { ip: '203.0.113.7' })).rejects.toMatchObject({ status: 503 });
    expect(provider.wywolajModelem).not.toHaveBeenCalled();
  });

  it('limit miesięczny: koszt z wcześniejszych dni miesiąca też się liczy', async () => {
    const { svc } = asystent();
    const teraz = new Date('2026-11-20T12:00:00Z');
    await prisma().aiInteractionLog.create({
      data: { feature: 'asystent_www_straznik', provider: 'anthropic', model: 'x', costUsd: 5, status: 'COMPLETED', promptHash: 'h3', createdAt: new Date('2026-11-03T10:00:00Z') },
    });
    expect(await svc.limitKosztuPrzekroczony(await svc.konfiguracja(), teraz)).toBe('miesięczny');
    expect(await svc.limitKosztuPrzekroczony(await svc.konfiguracja(), new Date('2026-12-02T12:00:00Z'))).toBeNull();
  });

  it('dobowy limit 60 pytań liczony po skrócie IP (relacja w bazie)', async () => {
    const { svc } = asystent();
    const ipHash = svc.ipHash('203.0.113.7');
    await prisma().asystentRozmowa.create({
      data: { ipHash, wiadomosci: { create: Array.from({ length: 60 }, (_, i) => ({ rola: 'USER', tresc: `p${i}` })) } },
    });
    await expect(svc.zapytaj({ pytanie: 'Hej' }, { ip: '203.0.113.7' })).rejects.toMatchObject({ status: 429 });
    // Inny adres nie jest blokowany.
    const b = asystent();
    b.runda('Tak.');
    await expect(b.svc.zapytaj({ pytanie: 'Hej' }, { ip: '198.51.100.1' })).resolves.toMatchObject({ odpowiedz: 'Tak.' });
  });

  it('„Poproś o telefon” z rozmowąId: mail do zespołu z przebiegiem rozmowy z bazy', async () => {
    const r = await prisma().asystentRozmowa.create({
      data: { ipHash: 'x', wiadomosci: { create: [{ rola: 'USER', tresc: 'Czy przeniesiecie sklep?' }] } },
    });
    await prisma().asystentWiadomosc.create({ data: { rozmowaId: r.id, rola: 'ASSISTANT', tresc: 'Tak, w cenie.', createdAt: new Date(Date.now() + 1000) } });
    const maile: Array<{ text: string }> = [];
    const leads = new LeadsService(
      prisma() as never,
      { send: async (m: { text: string }) => void maile.push(m) } as never,
      { get: () => undefined } as never,
      { record: async () => undefined } as never,
    );
    await leads.submitCallback(
      { name: 'Ola', phone: '600123456', preferredTime: 'rano', consentText: 'Numer wykorzystamy tylko do tej rozmowy.', rozmowaId: r.id } as never,
      {},
    );
    await vi.waitFor(() => expect(maile).toHaveLength(1));
    expect(maile[0].text).toMatch(/Czy przeniesiecie sklep\?[\s\S]*Tak, w cenie\./);
  });
});
