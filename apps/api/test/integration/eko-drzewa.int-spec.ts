import { EcoDrzewaService } from '../../src/eco/eco-drzewa.service.js';
import { EcoPointsService } from '../../src/eco/eco-points.service.js';
import { KLUCZE_DRZEW, KLUCZ_PUNKTY_NA_DRZEWO } from '../../src/eco/drzewa-model.js';
import { PosadzimyClient, type WynikZamowienia, type ZamowienieDrzew } from '../../src/eco/posadzimy.client.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * W6 (decyzja 12) — drzewa na prawdziwej bazie: wkład z opłaconej usługi (idempotentnie), wymiana punktów (pula
 * i własne drzewo), harmonogram sadzenia na atrapie API partnera (bez prawdziwego API): przydział FIFO z podziałem,
 * odrzucenie bez utraty wkładu, „niepewne” bez ponawiania, brak kredytów, środowisko testowe nie liczy się do
 * „posadzonych”, a licznik rośnie dopiero z certyfikatem.
 */
type Atrapa = {
  saldo: number;
  zamowienia: ZamowienieDrzew[];
  odpowiedz: (z: ZamowienieDrzew, n: number) => WynikZamowienia;
};

let nr = 0;
const przyjete = (z: ZamowienieDrzew, n: number): WynikZamowienia => ({
  rodzaj: 'przyjete',
  orderId: 1000 + n,
  certificateUrl: `https://panel.example/cert/${1000 + n}.pdf`,
  certificateImageUrl: null,
});

function uslugi(atrapa: Partial<Atrapa> = {}) {
  const a: Atrapa = { saldo: 100, zamowienia: [], odpowiedz: przyjete, ...atrapa };
  const config = { get: (k: string) => ({ POSADZIMY_API_TOKEN: 'tok-prod', POSADZIMY_API_TOKEN_TEST: 'tok-test' })[k] };
  const audit = { record: async () => undefined };
  const svc = new EcoDrzewaService(prisma() as never, config as never, audit as never);
  svc.fabrykaKlienta = () =>
    ({
      saldo: async () => a.saldo,
      zamow: async (z: ZamowienieDrzew) => {
        a.zamowienia.push(z);
        return a.odpowiedz(z, a.zamowienia.length);
      },
    }) as never;
  return { svc, a };
}

async function ustaw(wartosci: Record<string, string>) {
  for (const [key, value] of Object.entries(wartosci)) {
    await prisma().platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}

const sadzenieProd = () =>
  ustaw({
    [KLUCZE_DRZEW.WLACZONE]: '1',
    [KLUCZE_DRZEW.SRODOWISKO]: 'produkcja',
    [KLUCZE_DRZEW.ID_SADZENIA]: 'grp-1',
  });

async function klient(over: Record<string, unknown> = {}) {
  nr += 1;
  return prisma().user.create({ data: { email: `eko-${nr}@test.verris.pl`, passwordHash: 'x', ...over } });
}

async function usluga(userId: string, over: Record<string, unknown> = {}) {
  const plan = await utworzPlan();
  return prisma().subscription.create({
    data: { userId, planId: plan.id, interval: 'YEAR', priceAmount: '449.00', status: 'ACTIVE', ...over },
  });
}

const wklad = (userId: string, czesci: number, createdAt: Date) =>
  prisma().ecoWkladDrzewa.create({ data: { userId, zrodlo: 'USLUGA', czesci, createdAt } });

describe('EKO — drzewa (posadzimy.pl na atrapie)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('wkład z opłaconej usługi: 7,00% drzewa za rok, raz na płatność; odnowienie z kwoty obciążenia; okres próbny bez wkładu', async () => {
    const { svc } = uslugi();
    const u = await klient();
    const sub = await usluga(u.id);
    const p = prisma() as never;

    // Przez EcoPointsService — tak jak wołają go płatności (provisioning, odnowienia).
    const punkty = new EcoPointsService(prisma() as never, svc);
    await punkty.awardSubscriptionFirstPaid(p, u.id, sub.id);
    await punkty.awardSubscriptionFirstPaid(p, u.id, sub.id);
    let wklady = await prisma().ecoWkladDrzewa.findMany({ where: { userId: u.id } });
    expect(wklady).toHaveLength(1);
    expect(wklady[0]).toMatchObject({ czesci: 700, zrodlo: 'USLUGA', kwotaNettoGrosze: 36504, referenceId: `usluga:${sub.id}:pierwsza` });

    // Odnowienie z portfela: kwota z obciążenia tym kluczem (np. z rabatem), nie z cennika.
    await prisma().walletTransaction.create({
      data: { userId: u.id, type: 'CHARGE_SUBSCRIPTION', amount: '-381.65', balanceAfter: '0', idempotencyKey: 'odn-1', subscriptionId: sub.id },
    });
    await punkty.awardSubscriptionRenewal(p, { userId: u.id, subscriptionId: sub.id, referenceId: 'odn-1' });
    await punkty.awardSubscriptionRenewal(p, { userId: u.id, subscriptionId: sub.id, referenceId: 'odn-1' });
    wklady = await prisma().ecoWkladDrzewa.findMany({ where: { userId: u.id }, orderBy: { czesci: 'asc' } });
    expect(wklady.map((w) => w.czesci)).toEqual([595, 700]);

    const trial = await usluga(u.id, { isTrial: true });
    expect(await svc.wkladZUslugi(p, { userId: u.id, subscriptionId: trial.id, referenceId: 'pierwsza', pierwsza: true })).toBe(0);
    // Cudza usługa — brak wkładu.
    const inny = await klient();
    expect(await svc.wkladZUslugi(p, { userId: inny.id, subscriptionId: sub.id, referenceId: 'x', pierwsza: false })).toBe(0);
  });

  it('wymiana punktów: procent do puli albo własne drzewo; za mało punktów nic nie zdejmuje; subkonto odmowa', async () => {
    await ustaw({ [KLUCZ_PUNKTY_NA_DRZEWO]: '200' });
    const { svc } = uslugi();
    const u = await klient({ ecoPoints: 300, companyName: 'Piekarnia Kowalski' });

    expect(await svc.wymien({ userId: u.id }, { cel: 'PULA', procent: 10 })).toMatchObject({ punktyWydane: 20, czesci: 1000, punktyPo: 280 });
    expect(await svc.wymien({ userId: u.id }, { cel: 'WLASNE', drzewa: 1 })).toMatchObject({ punktyWydane: 200, punktyPo: 80 });
    await expect(svc.wymien({ userId: u.id }, { cel: 'WLASNE', drzewa: 1 })).rejects.toThrow(/Za mało punktów/);
    await expect(svc.wymien({ userId: u.id, customerOwnerId: u.id }, { cel: 'PULA', procent: 1 })).rejects.toThrow(/właściciel/);

    const po = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(po.ecoPoints).toBe(80);
    const ksiega = await prisma().ecoPointsLedgerEntry.findMany({ where: { userId: u.id }, orderBy: { delta: 'asc' } });
    expect(ksiega.map((w) => [w.reason, w.delta])).toEqual([
      ['EKO_DRZEWO_WLASNE', -200],
      ['EKO_DRZEWO_PULA', -20],
    ]);
    expect(await prisma().ecoWkladDrzewa.findFirst({ where: { userId: u.id } })).toMatchObject({ zrodlo: 'PUNKTY', czesci: 1000 });
    expect(await prisma().ecoZamowienieSadzenia.findFirst({ where: { userId: u.id } })).toMatchObject({
      rodzaj: 'WLASNE',
      liczbaDrzew: 1,
      status: 'OCZEKUJE',
      nazwaNaCertyfikacie: 'Verris',
      tekstCertyfikatu: 'Drzewo posadzone dzięki klientom Verris',
      punktyWydane: 200,
    });
  });

  it('pełna pula: jedno drzewo zbiorcze, przydział FIFO z podziałem; własne drzewo; liczniki dopiero z certyfikatem', async () => {
    await sadzenieProd();
    const { svc, a } = uslugi();
    const [ka, kb, kc] = [await klient(), await klient(), await klient({ ecoPoints: 1000 })];
    const t = (min: number) => new Date(Date.UTC(2026, 10, 1, 10, min));
    await wklad(ka.id, 6000, t(1));
    await wklad(kb.id, 3000, t(2));
    await wklad(kc.id, 2500, t(3));
    await svc.wymien({ userId: kc.id }, { cel: 'WLASNE', drzewa: 1 });

    expect(await svc.licznikVerris()).toBe(0);
    const r = await svc.przebieg();
    expect(r).toMatchObject({ saldo: 100, wyslane: 2, posadzone: 2, bledy: [] });
    // Decyzja 17 — własne drzewo klienta i drzewo zbiorcze: certyfikat tak samo na Verris.
    expect(a.zamowienia.map((z) => [z.customerName, z.certificateText, z.numberOfTrees, z.treeGroupID])).toEqual([
      ['Verris', 'Drzewo posadzone dzięki klientom Verris', 1, 'grp-1'], // własne (zaległe najpierw)
      ['Verris', 'Drzewo posadzone dzięki klientom Verris', 1, 'grp-1'],
    ]);

    const pula = await prisma().ecoZamowienieSadzenia.findFirstOrThrow({ where: { rodzaj: 'PULA' }, include: { wklady: true } });
    expect(pula).toMatchObject({ status: 'POSADZONE', liczbaDrzew: 1, srodowisko: 'produkcja' });
    expect(pula.wklady.map((w) => w.czesci).sort((x, y) => x - y)).toEqual([1000, 3000, 6000]);
    const reszta = await prisma().ecoWkladDrzewa.findMany({ where: { zamowienieId: null } });
    expect(reszta).toEqual([expect.objectContaining({ userId: kc.id, czesci: 1500, referenceId: null, createdAt: t(3) })]);

    expect(await svc.licznikVerris()).toBe(2);
    expect(await svc.licznikiKlienta(kc.id)).toEqual({ zWkladuCzesci: 1000, wlasne: 1 });
    expect(await svc.licznikOdznaki(kc.id, 'moje')).toBe(11_000);
    expect(await svc.licznikOdznaki(ka.id, 'verris')).toBe(20_000);

    const panel = await svc.panelKlienta(kc.id);
    expect(panel.liczniki).toEqual({ verris: 2, zWkladuCzesci: 1000, wlasne: 1 });
    expect(panel.czekaCzesci).toBe(1500);
    expect(panel.certyfikaty).toHaveLength(2);
    expect(panel.certyfikaty.every((c) => c.status === 'POSADZONE' && c.certificateUrl?.startsWith('https://'))).toBe(true);

    // Kolejny przebieg: pula ma 1500 części — nic nie wysyła.
    expect(await svc.przebieg()).toMatchObject({ wyslane: 0 });
  });

  it('odrzucenie przez API: zamówienie wraca do kolejki z wkładami (bez utraty), ponowienie dopiero po odstępie', async () => {
    await sadzenieProd();
    let odrzuc = true;
    const { svc, a } = uslugi({
      odpowiedz: (z, n) => (odrzuc ? { rodzaj: 'odrzucone', blad: 'HTTP 422: Invalid treeGroupID' } : przyjete(z, n)),
    });
    const k = await klient();
    await wklad(k.id, 10_000, new Date());
    const teraz = new Date();
    await svc.przebieg(teraz);
    const z = await prisma().ecoZamowienieSadzenia.findFirstOrThrow({ include: { wklady: true } });
    expect(z).toMatchObject({ status: 'OCZEKUJE', proby: 1, ostatniBlad: 'HTTP 422: Invalid treeGroupID' });
    expect(z.wklady).toHaveLength(1);
    expect(z.nastepnaProbaPo!.getTime()).toBe(teraz.getTime() + 3_600_000);

    await svc.przebieg(new Date(teraz.getTime() + 60_000));
    expect(a.zamowienia).toHaveLength(1);

    odrzuc = false;
    await svc.przebieg(new Date(teraz.getTime() + 3_600_000));
    expect(a.zamowienia).toHaveLength(2);
    expect(await prisma().ecoZamowienieSadzenia.count()).toBe(1);
    expect(await prisma().ecoZamowienieSadzenia.findFirstOrThrow()).toMatchObject({ status: 'POSADZONE', orderId: 1002, proby: 2 });
  });

  it('wynik niepewny (np. przekroczony czas): bez ponawiania; admin ponawia albo potwierdza z panelu partnera', async () => {
    await sadzenieProd();
    const { svc, a } = uslugi({ odpowiedz: () => ({ rodzaj: 'niepewne', blad: 'Brak odpowiedzi API sadzenia (TimeoutError)' }) });
    const k = await klient();
    await wklad(k.id, 20_000, new Date());
    await svc.przebieg();
    await svc.przebieg(new Date(Date.now() + 48 * 3_600_000));
    expect(a.zamowienia).toHaveLength(1);
    const z = await prisma().ecoZamowienieSadzenia.findFirstOrThrow();
    expect(z).toMatchObject({ status: 'NIEPEWNE', liczbaDrzew: 2 });
    expect(await svc.licznikVerris()).toBe(0);

    // Admin sprawdził u partnera: zamówienie jest — przepisuje orderId i certyfikat.
    await svc.potwierdz(z.id, { orderId: 555, certificateUrl: 'https://panel.example/cert/555.pdf' }, 'admin');
    expect(await svc.licznikVerris()).toBe(2);
    await expect(svc.ponow(z.id, 'admin')).rejects.toThrow(/niepewne/);
  });

  it('niepewne → admin „ponów” → wysłane w następnym przebiegu', async () => {
    await sadzenieProd();
    let n = 0;
    const { svc, a } = uslugi({
      odpowiedz: (z, i) => (++n === 1 ? { rodzaj: 'niepewne', blad: 'HTTP 502' } : przyjete(z, i)),
    });
    const k = await klient();
    await wklad(k.id, 10_000, new Date());
    await svc.przebieg();
    const z = await prisma().ecoZamowienieSadzenia.findFirstOrThrow();
    await svc.ponow(z.id, 'admin');
    await svc.przebieg();
    expect(a.zamowienia).toHaveLength(2);
    expect(await prisma().ecoZamowienieSadzenia.findFirstOrThrow()).toMatchObject({ status: 'POSADZONE' });
  });

  it('za mało kredytów API: nie tworzy drzewa z puli; własne drzewo czeka w kolejce', async () => {
    await sadzenieProd();
    await ustaw({ [KLUCZE_DRZEW.KREDYTY_NA_DRZEWO]: '5' });
    const { svc, a } = uslugi({ saldo: 4 });
    const k = await klient({ ecoPoints: 1000 });
    await wklad(k.id, 10_000, new Date());
    await svc.wymien({ userId: k.id }, { cel: 'WLASNE', drzewa: 1 });
    const r = await svc.przebieg();
    expect(a.zamowienia).toHaveLength(0);
    expect(r.bledy.join(' ')).toMatch(/za mało kredytów/);
    expect(await prisma().ecoZamowienieSadzenia.count()).toBe(1);
    expect(await prisma().ecoWkladDrzewa.count({ where: { zamowienieId: null } })).toBe(1);
  });

  it('środowisko testowe (RC) i zamówienie bez certyfikatu nie liczą się do „posadzonych”', async () => {
    await ustaw({ [KLUCZE_DRZEW.WLACZONE]: '1', [KLUCZE_DRZEW.SRODOWISKO]: 'test', [KLUCZE_DRZEW.ID_SADZENIA]: 'grp-rc' });
    const { svc } = uslugi();
    const k = await klient();
    await wklad(k.id, 10_000, new Date());
    await svc.przebieg();
    expect(await prisma().ecoZamowienieSadzenia.findFirstOrThrow()).toMatchObject({ status: 'POSADZONE', srodowisko: 'test' });
    expect(await svc.licznikVerris()).toBe(0);
    expect(await svc.licznikOdznaki(k.id, 'moje')).toBe(0);
    expect((await svc.panelKlienta(k.id)).certyfikaty[0]).toMatchObject({ testowe: true });

    await sadzenieProd();
    const bezCert = uslugi({ odpowiedz: () => ({ rodzaj: 'przyjete', orderId: 9, certificateUrl: null, certificateImageUrl: null }) });
    await wklad(k.id, 10_000, new Date());
    await bezCert.svc.przebieg();
    expect(await prisma().ecoZamowienieSadzenia.findFirstOrThrow({ where: { srodowisko: 'produkcja' } })).toMatchObject({
      status: 'ZLOZONE',
      orderId: 9,
    });
    expect(await svc.licznikVerris()).toBe(0);
  });

  it('wyłączone sadzenie albo brak ID sadzenia: przebieg nic nie wysyła, wkłady zostają w puli', async () => {
    const { svc, a } = uslugi();
    const k = await klient();
    await wklad(k.id, 30_000, new Date());
    expect((await svc.przebieg()).pominiety).toMatch(/wyłączone/);
    await ustaw({ [KLUCZE_DRZEW.WLACZONE]: '1' });
    expect((await svc.przebieg()).pominiety).toMatch(/ID sadzenia/);
    expect(a.zamowienia).toHaveLength(0);
    expect(await prisma().ecoWkladDrzewa.count({ where: { zamowienieId: null } })).toBe(1);
  });
  // ---------------------------------------------------------------------------------------------------------------
  // Decyzja 16 (4.11.2026) — wkład tylko od części zapłaconej pieniędzmi (kolejność jak przy zwrocie salda)
  // ---------------------------------------------------------------------------------------------------------------

  const tx = (userId: string, type: string, amount: string, at: Date, over: Record<string, unknown> = {}) =>
    prisma().walletTransaction.create({ data: { userId, type: type as never, amount, balanceAfter: '0', createdAt: at, ...over } });

  it('usługa z portfela w całości z kodu BETA — brak wkładu; punkty za płatność zostają', async () => {
    const { svc } = uslugi();
    const u = await klient();
    const sub = await usluga(u.id, { paymentSource: 'WALLET' });
    const t0 = new Date(Date.UTC(2026, 10, 4, 9, 0));
    await tx(u.id, 'PROMO_CREDIT', '500.00', t0, { idempotencyKey: `promo-beta:${u.id}` });
    await tx(u.id, 'CHARGE_SUBSCRIPTION', '-449.00', new Date(t0.getTime() + 60_000), { idempotencyKey: `sub-${sub.id}-initial`, subscriptionId: sub.id });

    const punkty = new EcoPointsService(prisma() as never, svc);
    expect(await punkty.awardSubscriptionFirstPaid(prisma() as never, u.id, sub.id)).toBe(true);
    expect(await prisma().ecoWkladDrzewa.count({ where: { userId: u.id } })).toBe(0);
  });

  it('usługa częściowo z kodu — wkład proporcjonalny do części z pieniędzy; odnowienie po zjedzeniu kodu — pełny', async () => {
    const { svc } = uslugi();
    const u = await klient();
    const sub = await usluga(u.id, { paymentSource: 'WALLET' });
    const t0 = new Date(Date.UTC(2026, 10, 4, 9, 0));
    const min = (n: number) => new Date(t0.getTime() + n * 60_000);
    await tx(u.id, 'PROMO_CREDIT', '100.00', t0, { idempotencyKey: `promo-beta:${u.id}` });
    await tx(u.id, 'TOPUP', '800.00', min(1), { paymentProvider: 'PAYNOW' });
    await tx(u.id, 'CHARGE_SUBSCRIPTION', '-449.00', min(2), { idempotencyKey: `sub-${sub.id}-initial`, subscriptionId: sub.id });
    // Kredyt z kodu po tym obciążeniu nie zmienia jego podziału.
    await tx(u.id, 'COMMISSION_CREDIT', '50.00', min(3));
    const p = prisma() as never;

    // 449 − 100 (kod schodzi najpierw) = 349 zł brutto z pieniędzy → 283,74 zł netto → ⌊28374 × 192 / 10 000⌋ = 544.
    expect(await svc.wkladZUslugi(p, { userId: u.id, subscriptionId: sub.id, referenceId: 'pierwsza', pierwsza: true })).toBe(544);
    expect(await prisma().ecoWkladDrzewa.findFirst({ where: { userId: u.id } })).toMatchObject({ czesci: 544, kwotaNettoGrosze: 28374 });

    // Odnowienie: prowizja 50 zł (darmowa) też schodzi najpierw → 45 − 45 = 0 → brak wkładu.
    await tx(u.id, 'CHARGE_SUBSCRIPTION', '-45.00', min(4), { idempotencyKey: 'odn-a', subscriptionId: sub.id });
    expect(await svc.wkladZUslugi(p, { userId: u.id, subscriptionId: sub.id, referenceId: 'odn-a', pierwsza: false })).toBe(0);
    // Kolejne: z prowizji zostało 5 zł → 40 zł z pieniędzy → 32,52 zł netto → 62 części.
    await tx(u.id, 'CHARGE_SUBSCRIPTION', '-45.00', min(5), { idempotencyKey: 'odn-b', subscriptionId: sub.id });
    expect(await svc.wkladZUslugi(p, { userId: u.id, subscriptionId: sub.id, referenceId: 'odn-b', pierwsza: false })).toBe(62);
    // Darmowe wyczerpane → całe 45 zł z pieniędzy → 70 części (jak bez kodów).
    await tx(u.id, 'CHARGE_SUBSCRIPTION', '-45.00', min(6), { idempotencyKey: 'odn-c', subscriptionId: sub.id });
    expect(await svc.wkladZUslugi(p, { userId: u.id, subscriptionId: sub.id, referenceId: 'odn-c', pierwsza: false })).toBe(70);
  });

  it('rekompensata SLA nie daje wkładu; usługa z portfela bez obciążenia (0 zł) — brak wkładu', async () => {
    const { svc } = uslugi();
    const u = await klient();
    const sub = await usluga(u.id, { paymentSource: 'WALLET', priceAmount: '45.00', interval: 'MONTH' });
    const t0 = new Date(Date.UTC(2026, 10, 4, 9, 0));
    await tx(u.id, 'ADJUSTMENT', '45.00', t0, { idempotencyKey: `sla-${sub.id}-2026-10` });
    await tx(u.id, 'CHARGE_SUBSCRIPTION', '-45.00', new Date(t0.getTime() + 60_000), { idempotencyKey: 'odn-sla', subscriptionId: sub.id });
    const p = prisma() as never;
    expect(await svc.wkladZUslugi(p, { userId: u.id, subscriptionId: sub.id, referenceId: 'odn-sla', pierwsza: false })).toBe(0);
    // Odnowienie za 0 zł (brak obciążenia tym kluczem) — wcześniej liczone z cennika.
    expect(await svc.wkladZUslugi(p, { userId: u.id, subscriptionId: sub.id, referenceId: 'odn-zero', pierwsza: false })).toBe(0);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Decyzja 17 (4.11.2026) — do API partnera nie idą dane klientów (prawdziwy klient HTTP na atrapie fetch)
  // ---------------------------------------------------------------------------------------------------------------

  it('body make_order: tylko Verris — także przy własnym drzewie klienta; bez nazwy, e-maila, NIP klienta', async () => {
    await sadzenieProd();
    const zadania: Array<{ url: string; body: Record<string, unknown> }> = [];
    let nrZam = 0;
    const fetch = async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      zadania.push({ url, body });
      if (url.endsWith('/check_credit_balance')) {
        return new Response(JSON.stringify({ status: 'success', data: { creditsBalance: 50 } }), { status: 200 });
      }
      nrZam += 1;
      return new Response(
        JSON.stringify({ status: 'success', data: { orderId: 700 + nrZam, certificateUrl: `https://cert.example/${700 + nrZam}.pdf` } }),
        { status: 201 },
      );
    };
    const { svc } = uslugi();
    svc.fabrykaKlienta = (_u, token) => new PosadzimyClient({ baseUrl: 'https://rc.api.example', token, fetch });

    const k = await klient({ ecoPoints: 600, companyName: 'Piekarnia Kowalski', firstName: 'Jan', lastName: 'Kowalski', nip: '9292069367' });
    await wklad(k.id, 10_000, new Date());
    await svc.wymien({ userId: k.id }, { cel: 'WLASNE', drzewa: 2 });
    expect(await prisma().user.findUniqueOrThrow({ where: { id: k.id } })).toMatchObject({ ecoPoints: 0 });
    await svc.przebieg();

    const zam = zadania.filter((z) => z.url.endsWith('/api/integration/make_order'));
    expect(zam.map((z) => z.body)).toEqual([
      { customerName: 'Verris', treeGroupID: 'grp-1', numberOfTrees: 2, certificateText: 'Drzewo posadzone dzięki klientom Verris' },
      { customerName: 'Verris', treeGroupID: 'grp-1', numberOfTrees: 1, certificateText: 'Drzewo posadzone dzięki klientom Verris' },
    ]);
    const wszystko = JSON.stringify(zadania.map((z) => z.body));
    for (const dana of ['Piekarnia', 'Kowalski', 'Jan', k.email, '9292069367', k.id]) expect(wszystko).not.toContain(dana);

    // Klient widzi swoje certyfikaty w panelu (przypisanie po naszej stronie).
    const panel = await svc.panelKlienta(k.id);
    expect(panel.liczniki.wlasne).toBe(2);
    expect(panel.certyfikaty.filter((c) => c.rodzaj === 'WLASNE')).toEqual([
      expect.objectContaining({ status: 'POSADZONE', certificateUrl: 'https://cert.example/701.pdf' }),
    ]);
  });

  it('zamówienie zapisane przed zmianą (z nazwą klienta w wierszu) i tak wychodzi do partnera jako Verris', async () => {
    await sadzenieProd();
    const { svc, a } = uslugi();
    const k = await klient();
    await prisma().ecoZamowienieSadzenia.create({
      data: {
        rodzaj: 'WLASNE',
        userId: k.id,
        liczbaDrzew: 1,
        nazwaNaCertyfikacie: 'Piekarnia Kowalski',
        tekstCertyfikatu: 'Drzewo z programu EKO w Verris',
        kosztDrzewaGrosze: 2000,
        srodowisko: 'produkcja',
      },
    });
    await svc.przebieg();
    expect(a.zamowienia).toEqual([
      { customerName: 'Verris', treeGroupID: 'grp-1', numberOfTrees: 1, certificateText: 'Drzewo posadzone dzięki klientom Verris' },
    ]);
  });
});
