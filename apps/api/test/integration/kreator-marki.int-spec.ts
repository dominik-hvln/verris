import { HttpException } from '@nestjs/common';
import sharp from 'sharp';
import { MigawkaMarki } from '@verris/kreator';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { Prisma } from '@verris/database';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { BillingService } from '../../src/billing/billing.service.js';
import { KonfiguracjaMarkiService } from '../../src/kreator-marki/konfiguracja-marki.service.js';
import { DOMYSLNA_KONFIGURACJA_MARKI, KLUCZ_KONFIGURACJI_MARKI } from '../../src/kreator-marki/konfiguracja-marki.js';
import { KreatorMarkiService } from '../../src/kreator-marki/kreator-marki.service.js';
import { ZakupMarkiService } from '../../src/kreator-marki/zakup-marki.js';
import { DostawcaMarkiVerris } from '../../src/kreator-marki/dostawca-marki.js';
import { StopkaEmailInstrukcja } from '../../src/kreator-marki/stopka-email.js';
import { napisTestowy } from '../../src/kreator-marki/test-marka.js';
import { prisma, rozlacz, ustawModelFakturowania, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * Paczka 131 — Kreator marki na prawdziwej bazie: seria propozycji z AI (atrapa dostawcy) i limit miesięczny, wybór
 * kierunku z rejestrem wydanych znaków (409 PODOBNY_ZNAK w tej samej branży), IDOR, zakup Pakietu z portfela (faktura
 * w tej samej transakcji, pula serii), brak środków, okres próbny (402 PROBA), usunięcie marki (odcisk zostaje bez
 * powiązań), migawka dla Kreatora stron. Atrapy: dostawca AI, magazyn obiektów, płatność kartą, pliki krojów (fixture).
 */

const BRIEF = { nazwa: 'Łódka i Wiosło', podpis: 'Wypożyczalnia kajaków', branza: 'Turystyka wodna', opis: 'Spływy kajakowe dla rodzin.', rodzaj: 'znak-i-napis' };
/**
 * Odpowiedź serii jak od modelu (paczka 134): slot „SYMBOL” – symbol SVG z koncepcją, slot z biblioteki – pierwsza
 * dozwolona rodzina; barwa z początku zakresu.
 */
const SYMBOL_RZEKI = "<circle cx='50' cy='50' r='44'/><path fill='#fff' d='M10 52Q30 38 50 52T90 52V64Q70 50 50 64T10 64Z'/>";
const ODP_SERII = (tresc: string) => {
  const sloty = [...tresc.matchAll(/^k\d – (SYMBOL)?.*?r: ([a-z0-9-]+)\(.*?b: (\d+)/gm)];
  return JSON.stringify({
    st: { g: 'Rodziny z dziećmi', c: 'spokój', s: 'nurt rzeki' },
    k: sloty.map((m) => ({ c: 'Nurt rzeki w kole – spływy z briefu', ...(m[1] ? { s: SYMBOL_RZEKI } : { r: m[2] }), b: Number(m[3]), d: 'Spokojny rytm rzeki w prostym znaku.' })),
  });
};

function srodowisko(odpowiedzAi: (tresc: string) => string = ODP_SERII) {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const konfiguracja = new KonfiguracjaMarkiService(p, audit);
  const provider = {
    anthropicZBlokami: vi.fn(async (we: { wiadomosci: { content: unknown }[] }) => ({ wynik: odpowiedzAi(String(we.wiadomosci[0]?.content ?? '')), dostawca: 'anthropic', model: 'claude-sonnet-5-5', wej: 400, wyj: 900, zapis5m: 0, zapis1h: 0, odczyt: 6000, kosztUsd: 0.01, powodKonca: 'end_turn' })),
  };
  const magazyn = new Map<string, Buffer>();
  const storage = {
    putObject: vi.fn(async (_b: string, k: string, d: Buffer) => void magazyn.set(k, d)),
    getObjectBuffer: vi.fn(async (_b: string, k: string) => magazyn.get(k) ?? Buffer.alloc(0)),
    removeObject: vi.fn(async (_b: string, k: string) => void magazyn.delete(k)),
  };
  // Prawdziwy BillingService (doładowanie i webhook Stripe); atrapy: Stripe, poczta, VAT nabywcy, księgowanie wpłaty.
  const ledger = new WalletLedgerService(p);
  const sesje: { metadata: Record<string, string> }[] = [];
  const stripe = { createCheckoutSession: vi.fn(async (o: { metadata: Record<string, string> }) => (sesje.push(o), { id: `cs_${sesje.length}`, url: 'https://platnosc.test/sesja' })) };
  const doladowanie = {
    ustalTraktowanie: async () => ({ traktowanie: { kod: 'PL23', stawka: 23, kraj: 'PL' }, vies: null }),
    zaksieguj: async (i: { userId: string; kwotaMinor: number; idempotencyKey: string }) => {
      const wpis = await ledger.credit({ userId: i.userId, type: 'TOPUP', amount: i.kwotaMinor / 100, idempotencyKey: i.idempotencyKey });
      return { wpis, kredytK: new Prisma.Decimal(i.kwotaMinor / 100) };
    },
  };
  const billing = new BillingService(
    p, ledger, stripe as never, audit, { get: () => undefined } as never, {} as never, {} as never,
    { send: async () => undefined } as never, {} as never, { safeAward: () => undefined } as never, doladowanie as never,
  );
  const zakupy = new ZakupMarkiService(p, ledger, audit, billing, konfiguracja);
  zakupy.onModuleInit();
  /** Webhook Stripe checkout.session.completed dla ostatniej sesji (ta sama ścieżka co produkcja: handleCheckoutCompleted). */
  const zaplacono = async (userId: string, kwotaMinor: number) => {
    const ostatnia = sesje[sesje.length - 1]!;
    await (billing as unknown as { handleCheckoutCompleted(e: unknown): Promise<void> }).handleCheckoutCompleted({
      id: `evt_${sesje.length}`,
      data: { object: { id: `cs_${sesje.length}`, payment_status: 'paid', amount_total: kwotaMinor, currency: 'pln', client_reference_id: userId, metadata: ostatnia.metadata, payment_intent: `pi_${sesje.length}` } },
    });
  };
  const config = { get: (k: string) => ({ appKmsKey: 'k'.repeat(64), PUBLIC_API_URL: 'https://api.verris.test' })[k] };
  const svc = new KreatorMarkiService(p, provider as never, konfiguracja, napisTestowy(), zakupy, audit, storage as never, config as never, new StopkaEmailInstrukcja());
  return { svc, provider, stripe, sesje, zaplacono, magazyn, dostawca: new DostawcaMarkiVerris(svc) };
}

let n = 0;
async function klient(saldo = 0, hosting: 'platny' | 'proba' | 'brak' = 'platny') {
  n += 1;
  const u = await prisma().user.create({ data: { email: `k131-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo } });
  if (hosting !== 'brak') {
    const plan = await utworzPlan();
    await prisma().subscription.create({
      data: { userId: u.id, planId: plan.id, interval: 'MONTH', priceAmount: 45, status: 'ACTIVE', paymentSource: 'WALLET', isTrial: hosting === 'proba', currentPeriodEnd: new Date(Date.now() + 20 * 86400000) },
    });
  }
  return { userId: u.id, actorUserId: u.id };
}

async function konfiguracja(zm: Record<string, unknown> = {}) {
  const value = JSON.stringify({ ...DOMYSLNA_KONFIGURACJA_MARKI, wlaczony: true, dostepnosc: 'wszyscy', wCenieHostingu: { marek: 1, seriiMies: 1, zmianAiMies: 5 }, ...zm });
  await prisma().platformSetting.upsert({ where: { key: KLUCZ_KONFIGURACJI_MARKI }, create: { key: KLUCZ_KONFIGURACJI_MARKI, value }, update: { value } });
}

const kod = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(HttpException);
  const h = e as HttpException;
  return { status: h.getStatus(), kod: (h.getResponse() as { kod?: string }).kod };
};
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);

describe('Paczka 131 – Kreator marki (baza)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().kreatorMarkaOdcisk.deleteMany({});
    await ustawModelFakturowania('przy_obciazeniu');
    await konfiguracja();
  });
  afterAll(rozlacz);

  it('moduł wyłączony = 403 MODUL_NIEDOSTEPNY; bez hostingu = 403 BRAK_HOSTINGU', async () => {
    const { svc } = srodowisko();
    await konfiguracja({ wlaczony: false });
    const k = await klient();
    expect(await kod(svc.stan(k.userId))).toEqual({ status: 403, kod: 'MODUL_NIEDOSTEPNY' });
    await konfiguracja();
    const bez = await klient(0, 'brak');
    expect(await kod(svc.utworz(bez, { zrodlo: 'nowa', brief: BRIEF }))).toEqual({ status: 403, kod: 'BRAK_HOSTINGU' });
    expect((await svc.stan(bez.userId)).dostepny).toBe(false);
  });

  it('seria z AI zużywa limit miesięczny; po limicie 402 LIMIT_SERII; błąd AI = 503 bez serii i bez zużycia limitu', async () => {
    const s = srodowisko();
    const k = await klient();
    const m = await s.svc.utworz(k, { zrodlo: 'nowa', brief: BRIEF });
    expect(m.etap).toBe('brief');
    const w = await s.svc.seria(k, m.id);
    expect(w.etap).toBe('kierunki');
    expect(w.serie[0]!.kierunki).toHaveLength(6);
    expect(w.serie[0]!.strategia).toMatchObject({ cecha: 'spokój' });
    expect(w.serie[0]!.kierunki.some((x) => x.dlaczego === 'Spokojny rytm rzeki w prostym znaku.')).toBe(true);
    expect(w.serie[0]!.kierunki.filter((x) => x.zrodloZnaku === 'ai')).toHaveLength(4);
    expect(w.serie[0]!.zrodlo).toBe('ai');
    expect(s.provider.anthropicZBlokami).toHaveBeenCalledWith(expect.objectContaining({ funkcja: 'kreator-marki', model: 'claude-sonnet-5-5', userId: k.userId }));
    expect((await s.svc.stan(k.userId)).limity.serie).toEqual({ uzyte: 1, limit: 1 });
    expect(await kod(s.svc.seria(k, m.id))).toEqual({ status: 402, kod: 'LIMIT_SERII' });
    // dostawca AI niedostępny (paczka 134): 503, seria nie powstaje (bez losowych szablonów), limit wraca
    await konfiguracja({ wCenieHostingu: { marek: 1, seriiMies: 2, zmianAiMies: 5 } });
    const zle = srodowisko(() => {
      throw new Error('503');
    });
    expect(await kod(zle.svc.seria(k, m.id))).toEqual({ status: 503, kod: 'AI_NIEDOSTEPNE' });
    expect((await zle.svc.pobierz(k.userId, m.id)).serie).toHaveLength(1);
    expect((await zle.svc.stan(k.userId)).limity.serie.uzyte).toBe(1);
    const zuz = await prisma().kreatorMarkaZuzycie.findFirstOrThrow({ where: { userId: k.userId } });
    expect(Number(zuz.kosztUsd)).toBeGreaterThan(0);
  });

  it('wybór kierunku: odcisk w rejestrze; ten sam znak w tej samej branży u innej firmy = 409 PODOBNY_ZNAK; inna branża – można', async () => {
    const s = srodowisko();
    const a = await klient();
    const mA = await s.svc.utworz(a, { zrodlo: 'nowa', brief: BRIEF });
    const wA = await s.svc.seria(a, mA.id);
    const kier = wA.serie[0]!.kierunki.find((x) => x.projekt.sygnet.typ === 'biblioteka')!;
    const wybrana = await s.svc.wybierz(a, mA.id, { seriaId: wA.serie[0]!.id, kierunekId: kier.id });
    expect(wybrana.etap).toBe('projekt');
    expect(wybrana.marka?.projekt.sygnet).toEqual(kier.projekt.sygnet);
    expect(wybrana.pliki.length).toBeGreaterThan(10);
    const odcisk = await prisma().kreatorMarkaOdcisk.findFirstOrThrow({ where: { markaId: mA.id } });
    expect(odcisk).toMatchObject({ userId: a.userId, branzaKlucz: 'turystyka wodna' });

    // druga firma z tej samej branży próbuje wydać identyczny znak (projekt podany przy wyborze)
    const b = await klient();
    const mB = await s.svc.utworz(b, { zrodlo: 'nowa', brief: { ...BRIEF, nazwa: 'Kajaki Nurt', podpis: undefined } });
    const wB = await s.svc.seria(b, mB.id);
    const kierB = wB.serie[0]!.kierunki.find((x) => x.projekt.sygnet.typ === 'biblioteka')!;
    const kopia = { ...kierB.projekt, sygnet: kier.projekt.sygnet };
    expect(await kod(s.svc.wybierz(b, mB.id, { seriaId: wB.serie[0]!.id, kierunekId: kierB.id, projekt: kopia }))).toEqual({ status: 409, kod: 'PODOBNY_ZNAK' });

    // sygnet AI / wgrany spoza kierunku – odmowa (nie da się „przemycić” dowolnego SVG)
    const obcy = { ...kierB.projekt, sygnet: { typ: 'ai', svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="currentColor"/></svg>' } };
    expect(await kod(s.svc.wybierz(b, mB.id, { seriaId: wB.serie[0]!.id, kierunekId: kierB.id, projekt: obcy }))).toEqual({ status: 400, kod: 'ZNAK_SPOZA_KIERUNKU' });

    const c = await klient();
    const mC = await s.svc.utworz(c, { zrodlo: 'nowa', brief: { ...BRIEF, branza: 'Księgowość', nazwa: 'Kolumna' } });
    const wC = await s.svc.seria(c, mC.id);
    const kierC = wC.serie[0]!.kierunki[0]!;
    await expect(s.svc.wybierz(c, mC.id, { seriaId: wC.serie[0]!.id, kierunekId: kierC.id, projekt: { ...kierC.projekt, sygnet: kier.projekt.sygnet } })).resolves.toMatchObject({ etap: 'projekt' });
  });

  it('IDOR: cudza marka = 404 przy odczycie, zmianie, plikach i usunięciu', async () => {
    const s = srodowisko();
    const a = await klient();
    const b = await klient();
    const m = await s.svc.utworz(a, { zrodlo: 'nowa', brief: BRIEF });
    const proby: (() => Promise<unknown>)[] = [
      () => s.svc.pobierz(b.userId, m.id),
      () => s.svc.zmienBrief(b, m.id, BRIEF),
      () => s.svc.seria(b, m.id),
      () => s.svc.logoSvg(b.userId, m.id, {}),
      () => s.svc.plik(b, m.id, 'favicon.svg'),
      () => s.svc.eksport(b, m.id),
      () => s.svc.usun(b, m.id),
      () => s.svc.pobierz(b.userId, 'nie-uuid'),
    ];
    for (const p of proby) expect((await kod(p())).status).toBe(404);
    expect(await prisma().kreatorMarka.count({ where: { id: m.id } })).toBe(1);
  });

  it('zakup Pakietu z portfela: obciążenie 149 zł z fakturą, wersja „pakiet”, pula serii, drugi zakup 409; brak środków', async () => {
    const s = srodowisko();
    const k = await klient(200);
    const w = await s.svc.zakup(k, 'PAKIET', { metoda: 'portfel', zgodaTresciCyfrowej: true });
    expect(w.status).toBe('oplacony');
    if (w.status !== 'oplacony') return;
    expect(w.stan.wersja).toBe('pakiet');
    expect(w.stan.pakiet).toMatchObject({ kupiony: true, cena: { brutto: 149, netto: 121.14 } });
    expect(w.stan.limity.serie).toEqual({ uzyte: 0, limit: 1 + 10 });
    expect(await saldo(k.userId)).toBeCloseTo(51, 2);
    const faktury = await prisma().invoice.findMany({ where: { userId: k.userId } });
    expect(faktury).toHaveLength(1);
    expect(faktury[0]!.amount.toFixed(2)).toBe('149.00');
    expect((faktury[0]!.lineItems as { name: string }[])[0]!.name).toBe('Kreator marki – Pakiet marki');
    const zakup = await prisma().kreatorMarkaZakup.findFirstOrThrow({ where: { userId: k.userId } });
    expect(zakup).toMatchObject({ status: 'OPLACONY', serie: 10, zmianyAi: 300 });
    expect(zakup.zgodaTresciCyfrowejAt).toBeInstanceOf(Date);
    expect(await kod(s.svc.zakup(k, 'PAKIET', { metoda: 'portfel', zgodaTresciCyfrowej: true }))).toEqual({ status: 409, kod: 'PAKIET_KUPIONY' });

    // limit miesięczny 1, potem pula Pakietu
    const m = await s.svc.utworz(k, { zrodlo: 'nowa', brief: BRIEF });
    await s.svc.seria(k, m.id);
    await s.svc.seria(k, m.id);
    expect((await prisma().kreatorMarkaZakup.findFirstOrThrow({ where: { userId: k.userId } })).serieUzyte).toBe(1);

    const biedny = await klient(20);
    expect(await s.svc.zakup(biedny, 'DRUGA_MARKA', { metoda: 'portfel', zgodaTresciCyfrowej: true })).toEqual({ status: 'brak-srodkow', brakuje: 29 });
    expect(await saldo(biedny.userId)).toBe(20);
    expect(await kod(s.svc.zakup(biedny, 'PAKIET', { metoda: 'portfel' }))).toEqual({ status: 400, kod: 'BRAK_ZGODY' });
  });

  it('druga marka i Pakiet kartą: przekierowanie z referencją zamówienia, realizacja przy zaksięgowaniu wpłaty (webhook), idempotentnie', async () => {
    const s = srodowisko();
    const k = await klient(100);
    await s.svc.utworz(k, { zrodlo: 'nowa', brief: BRIEF });
    expect(await kod(s.svc.utworz(k, { zrodlo: 'nowa', brief: { ...BRIEF, nazwa: 'Druga' } }))).toEqual({ status: 402, kod: 'LIMIT_MAREK' });
    const w = await s.svc.zakup(k, 'DRUGA_MARKA', { metoda: 'karta', zgodaTresciCyfrowej: true });
    expect(w).toEqual({ status: 'przekierowanie', url: 'https://platnosc.test/sesja' });
    const zakup = await prisma().kreatorMarkaZakup.findFirstOrThrow({ where: { userId: k.userId } });
    expect(s.sesje[0]!.metadata).toMatchObject({ kind: 'wallet_topup', userId: k.userId, kreatorMarkiZakup: zakup.id });
    expect(s.stripe.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 4900 }));
    // bez wpłaty nic się nie dzieje – samo saldo nie opłaca zamówienia kartą, odczyt stanu też nie
    await s.svc.stan(k.userId);
    expect(await saldo(k.userId)).toBe(100);
    expect((await prisma().kreatorMarkaZakup.findUniqueOrThrow({ where: { id: zakup.id } })).status).toBe('OCZEKUJE');
    // webhook: wpłata zaksięgowana → od razu obciążenie portfela i aktywacja
    await s.zaplacono(k.userId, 4900);
    expect((await prisma().kreatorMarkaZakup.findUniqueOrThrow({ where: { id: zakup.id } })).status).toBe('OPLACONY');
    expect(await saldo(k.userId)).toBe(100);
    // powtórzone powiadomienie – bez drugiego obciążenia
    await s.zaplacono(k.userId, 4900);
    expect(await saldo(k.userId)).toBe(100);
    expect(await prisma().walletTransaction.count({ where: { userId: k.userId, type: 'CHARGE_USAGE' } })).toBe(1);
    expect((await s.svc.stan(k.userId)).limity.marki).toEqual({ uzyte: 1, limit: 2 });
    await expect(s.svc.utworz(k, { zrodlo: 'nowa', brief: { ...BRIEF, nazwa: 'Druga' } })).resolves.toMatchObject({ etap: 'brief' });

    // Pakiet kartą: wersja „pakiet” zaraz po wpłacie
    const pk = await klient(0);
    expect(await s.svc.zakup(pk, 'PAKIET', { metoda: 'karta', zgodaTresciCyfrowej: true })).toMatchObject({ status: 'przekierowanie' });
    expect(await kod(s.svc.zakup(pk, 'PAKIET', { metoda: 'karta', zgodaTresciCyfrowej: true }))).toEqual({ status: 409, kod: 'ZAKUP_W_TOKU' });
    await s.zaplacono(pk.userId, 14900);
    const stan = await s.svc.stan(pk.userId);
    expect(stan.wersja).toBe('pakiet');
    expect(stan.pakiet.zawiera).toEqual({ serie: 10, zmianyAi: 300, aktualizacjeMies: 12 });
    expect(await saldo(pk.userId)).toBe(0);
    expect(await prisma().invoice.count({ where: { userId: pk.userId } })).toBeGreaterThanOrEqual(1);
  });

  it('okres próbny: projekt i podgląd tak, pliki 402 PROBA, zakup 402 PROBA; po wyborze pliki z blokadą PROBA', async () => {
    const s = srodowisko();
    const k = await klient(500, 'proba');
    const m = await s.svc.utworz(k, { zrodlo: 'nowa', brief: BRIEF });
    const w = await s.svc.seria(k, m.id);
    const wyb = await s.svc.wybierz(k, m.id, { seriaId: w.serie[0]!.id, kierunekId: w.serie[0]!.kierunki[1]!.id });
    expect(wyb.pliki.every((p) => p.blokada === 'PROBA')).toBe(true);
    expect(await s.svc.logoSvg(k.userId, m.id, { uklad: 'poziomy', wariant: 'kolor' })).toMatch(/^<svg/);
    expect(await kod(s.svc.plik(k, m.id, 'logo-poziome-kolor.svg'))).toEqual({ status: 402, kod: 'PROBA' });
    expect(await kod(s.svc.eksport(k, m.id))).toEqual({ status: 402, kod: 'PROBA' });
    expect(await kod(s.svc.zakup(k, 'PAKIET', { metoda: 'portfel', zgodaTresciCyfrowej: true }))).toEqual({ status: 402, kod: 'PROBA' });
    expect((await s.svc.stan(k.userId)).wersja).toBe('proba');
  });

  it('hosting bez Pakietu: logo do pobrania, KV 402 PAKIET_WYMAGANY, druk 409 TMVIEW_WYMAGANY do zgody z datą; usunięcie – odcisk zostaje bez powiązań', async () => {
    const s = srodowisko();
    const k = await klient();
    const m = await s.svc.utworz(k, { zrodlo: 'nowa', brief: BRIEF });
    const w = await s.svc.seria(k, m.id);
    await s.svc.wybierz(k, m.id, { seriaId: w.serie[0]!.id, kierunekId: w.serie[0]!.kierunki[2]!.id });
    expect((await s.svc.plik(k, m.id, 'logo-poziome-kolor.svg')).typ).toBe('image/svg+xml');
    expect(await kod(s.svc.plik(k, m.id, 'post.png'))).toEqual({ status: 402, kod: 'PAKIET_WYMAGANY' });
    expect(await kod(s.svc.plik(k, m.id, 'logo.pdf'))).toEqual({ status: 409, kod: 'TMVIEW_WYMAGANY' });
    const zg = await s.svc.zgody(k, m.id, { sprawdzilemTmview: true });
    expect(zg.marka?.zgody.sprawdzilemTmview).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((await s.svc.plik(k, m.id, 'logo.pdf')).dane.subarray(0, 5).toString()).toBe('%PDF-');
    expect(await prisma().auditLog.count({ where: { userId: k.userId, action: 'KREATOR_MARKI_ZGODA' } })).toBe(1);

    // stopka e-mail: logo z publicznego adresu https (token), instrukcje
    const stopka = await s.svc.stopkaEmail(k.userId, m.id);
    expect(stopka.html).toMatch(/src="https:\/\/api\.verris\.test\/kreator-marki\/p\/[0-9a-f]{64}\/logo-stopka\.png"/);
    expect(stopka.instrukcje.length).toBeGreaterThan(3);
    const token = /\/p\/([0-9a-f]{64})\//.exec(stopka.html)![1]!;
    expect((await s.svc.plikPubliczny(token, 'logo-stopka.png')).subarray(1, 4).toString()).toBe('PNG');
    expect((await kod(s.svc.plikPubliczny(token.replace(/.$/, (c) => (c === '0' ? '1' : '0')), 'logo-stopka.png'))).status).toBe(404);

    // migawka dla Kreatora stron przechodzi schemat strony
    const mig = await s.dostawca.migawka(k.userId, m.id);
    expect(MigawkaMarki.safeParse(mig).success).toBe(true);
    expect(await s.dostawca.migawka((await klient()).userId, m.id)).toBeNull();
    expect(await s.dostawca.lista(k.userId)).toEqual([expect.objectContaining({ markaId: m.id })]);

    await s.svc.usun(k, m.id);
    expect(await prisma().kreatorMarka.count({ where: { id: m.id } })).toBe(0);
    const odcisk = await prisma().kreatorMarkaOdcisk.findFirstOrThrow({ where: { branzaKlucz: 'turystyka wodna' } });
    expect(odcisk).toMatchObject({ userId: null, markaId: null });
  });

  it('wgranie logo: PNG → pomiar, wektor, analiza wizją (obraz w wiadomości), marka „wgrane” od razu z projektem; PDF 415; bez oświadczenia 400; logo znanej marki 422', async () => {
    const analiza = JSON.stringify({ e: ['koło', 'fala'], kn: 'Manrope', pr: ['Mały kontrast podpisu'], pp: { b: 250, ch: 'jasna' }, zm: 0, o: 'Granatowe koło z falą.' });
    const s = srodowisko(() => analiza);
    const k = await klient();
    const png = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#FFFFFF"/><circle cx="200" cy="200" r="150" fill="#1F3A5F"/><rect x="120" y="180" width="160" height="40" fill="#E07A3F"/></svg>')).png().toBuffer();
    expect(await kod(s.svc.wgraj(k, png, { zrodlo: 'wgrane', nazwa: 'Łódka' }))).toEqual({ status: 400, kod: 'BRAK_OSWIADCZENIA' });
    expect(await kod(s.svc.wgraj(k, Buffer.from('%PDF-1.7\n...'), { zrodlo: 'wgrane', oswiadczenie: 'tak' }))).toEqual({ status: 415, kod: 'PDF_NIEOBSLUGIWANY' });
    expect(await kod(s.svc.wgraj(k, Buffer.from('MZ\x90\x00 nie obraz'), { zrodlo: 'wgrane', oswiadczenie: 'tak' }))).toEqual({ status: 415, kod: 'TYP_NIEOBSLUGIWANY' });
    await konfiguracja({ maksRozmiarWgraniaMb: 1 });
    expect(await kod(s.svc.wgraj(k, Buffer.concat([png, Buffer.alloc(1024 * 1024)]), { zrodlo: 'wgrane', oswiadczenie: 'tak' }))).toEqual({ status: 413, kod: 'PLIK_ZA_DUZY' });
    await konfiguracja();

    const w = await s.svc.wgraj(k, png, { zrodlo: 'wgrane', oswiadczenie: 'tak', nazwa: 'Łódka', branza: 'Kajaki' });
    expect(w.etap).toBe('projekt');
    expect(w.marka?.projekt.sygnet.typ).toBe('wgrany');
    expect(w.marka?.zgody.oswiadczeniePraw).toMatch(/^\d{4}-/);
    expect(w.analiza).toMatchObject({ elementy: ['koło', 'fala'], krojPodobny: 'Manrope' });
    expect(w.analiza!.kolory[0]!.hex).toMatch(/^#/);
    expect(w.analiza!.oryginal).toMatch(/^data:image\/png;base64,/);
    expect(w.analiza!.zgodnosc).toBeGreaterThan(0.8);
    expect(w.pliki.filter((p) => p.grupa === 'logo').every((p) => p.plik.startsWith('logo-sygnet-'))).toBe(true);
    const wywolanie = (s.provider.anthropicZBlokami.mock.calls.at(-1) as unknown as [{ wiadomosci: { content: { type: string }[] }[]; rodzaj: string }])[0];
    expect(wywolanie.rodzaj).toBe('marka-analiza-logo');
    expect(wywolanie.wiadomosci[0]!.content[0]!.type).toBe('image');
    expect([...s.magazyn.keys()].every((x) => x.startsWith(`${k.userId}/marka/`))).toBe(true);
    expect(await prisma().auditLog.count({ where: { userId: k.userId, action: 'KREATOR_MARKI_WGRANO' } })).toBe(1);

    // KV pod wgrane logo: logo bez zmian, paleta materiałów i hasło od AI
    const kv = srodowisko(() => JSON.stringify({ b: 30, ch: 'ciepla', wz: 'gesty', h: 'Na wodzie od rana', f: 'Manrope' }));
    const poKv = await kv.svc.kvAi(k, w.id, { polecenie: 'ciepło, rodzinnie' });
    expect(poKv.marka?.projekt.sygnet).toEqual(w.marka?.projekt.sygnet);
    expect(poKv.marka?.kv).toMatchObject({ wzor: 'gesty', haslo: 'Na wodzie od rana' });
    expect(poKv.wersja).toBe(w.wersja + 1);

    // znana marka – odmowa, pliku nie zapisujemy
    const zm = srodowisko(() => JSON.stringify({ zm: 1 }));
    const k2 = await klient();
    expect(await kod(zm.svc.wgraj(k2, png, { zrodlo: 'odswiezenie', oswiadczenie: 'tak' }))).toEqual({ status: 422, kod: 'ZNANA_MARKA' });
    expect(zm.magazyn.size).toBe(0);
    expect(await prisma().kreatorMarka.count({ where: { userId: k2.userId } })).toBe(0);
  });

  it('SVG klienta: tylko po walidatorze (skrypt odrzucony), odświeżenie – 3 kierunki z „co zostaje / co się zmienia”', async () => {
    const s = srodowisko((t) => (t.includes('ODSWIEZENIE') ? JSON.stringify({ k: [{ t: 'ewolucja', r: 'obecny', b: 250, z: 'Koło i granat.', m: 'Nowy krój.', rp: 3 }, { t: 'odswiezenie', b: 240 }, { t: 'nowy', b: 30 }] }) : JSON.stringify({ e: ['koło'] })));
    const k = await klient();
    const zly = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>alert(1)</script><circle cx="50" cy="50" r="40" fill="#1F3A5F"/></svg>');
    expect(await kod(s.svc.wgraj(k, zly, { zrodlo: 'odswiezenie', oswiadczenie: 'tak' }))).toEqual({ status: 422, kod: 'SVG_NIEPOPRAWNY' });
    const dobry = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#1F3A5F"/><rect x="30" y="45" width="40" height="10" fill="#E07A3F"/></svg>');
    const w = await s.svc.wgraj(k, dobry, { zrodlo: 'odswiezenie', oswiadczenie: 'tak', nazwa: 'Łódka i Wiosło', branza: 'Kajaki' });
    expect(w).toMatchObject({ zrodlo: 'odswiezenie', etap: 'brief', marka: null });
    expect(w.analiza?.wektorSvg).toMatch(/^<svg/);
    expect(await kod(s.svc.seria(k, w.id))).toEqual({ status: 409, kod: 'ZLE_ZRODLO' });
    const o = await s.svc.odswiezenie(k, w.id);
    const kier = o.serie[0]!.kierunki;
    expect(kier.map((x) => x.odswiezenie?.typ)).toEqual(['ewolucja', 'odswiezenie', 'nowy']);
    expect(kier[0]).toMatchObject({ odswiezenie: { coZostaje: 'Koło i granat.', coSieZmienia: 'Nowy krój.', rozpoznawalnosc: 'wysoka' } });
    expect(kier[0]!.projekt.sygnet.typ).toBe('wgrany');
    const wyb = await s.svc.wybierz(k, w.id, { seriaId: o.serie[0]!.id, kierunekId: kier[0]!.id });
    expect(wyb.etap).toBe('projekt');
  });
});
