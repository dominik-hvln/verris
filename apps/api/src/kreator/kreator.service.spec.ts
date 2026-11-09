import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { funkcjeAiKreatora, PRZYKLAD_SALON, PRZYKLAD_SALON_EN, skrotTresci, tlumaczenieNieaktualne, walidujStrone, type FunkcjeAiKreatora, type Strona } from '@verris/kreator';
import { KreatorService, LIMIT_WERSJI } from './kreator.service.js';
import { KLUCZ_KONFIGURACJI_KREATORA, miesiacUtc } from './konfiguracja.js';
import type { RendererKreatora } from './zaleznosci.js';
import { TlumaczenieDto, ZmienNazweDto } from './dto/kreator.dto.js';

/**
 * Serwis kreatora na atrapie Prismy w pamięci (tabele kreatora + to, z czego liczy się wersja kreatora)
 * i atrapach AI/renderera. Zapytania na prawdziwym Postgresie – test/integration/kreator.int-spec.ts.
 */
type Rek = Record<string, unknown>;

function pasuje(r: Rek, where: Rek = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
      const w = v as Rek;
      if ('not' in w && r[k] === w.not) return false;
      if ('lt' in w && !((r[k] as number) < (w.lt as number))) return false;
      if ('gt' in w && !((r[k] as number) > (w.gt as number))) return false;
      if ('in' in w && !(w.in as unknown[]).includes(r[k])) return false;
      return true;
    }
    return r[k] === v;
  });
}

function zastosuj(r: Rek, data: Rek) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && ('increment' in v || 'decrement' in v)) {
      const o = v as { increment?: unknown; decrement?: unknown };
      r[k] = Number(r[k] ?? 0) + Number(o.increment ?? 0) - Number(o.decrement ?? 0);
    } else if (v && typeof v === 'object' && (v as object).constructor?.name === 'DbNull') r[k] = null;
    else r[k] = v;
  }
  r.updatedAt = new Date();
}

function usluga(x: Rek): Rek {
  return { status: 'ACTIVE', plan: { productKind: 'HOSTING' }, createdAt: new Date(0), ...x };
}

function pasujeUsluga(x: Rek, where: Rek): boolean {
  const u = usluga(x);
  if (where.userId !== undefined && u.userId !== where.userId) return false;
  const st = where.status as { in?: string[] } | undefined;
  if (st?.in && !st.in.includes(u.status as string)) return false;
  const pk = (where.plan as { productKind?: string | { in: string[] } } | undefined)?.productKind;
  const rodzaj = (u.plan as { productKind: string }).productKind;
  if (typeof pk === 'string' && rodzaj !== pk) return false;
  if (pk && typeof pk === 'object' && !pk.in.includes(rodzaj)) return false;
  return true;
}

function bazaAtrapa() {
  const strony: Rek[] = [];
  const wersje: Rek[] = [];
  const zuzycie: Rek[] = [];
  const db = {
    strony,
    wersje,
    zuzycie,
    /** Paczka 122 – zdjęcia z biblioteki kont (KreatorZasob). */
    zasoby: [] as Rek[],
    subs: [{ userId: 'u1', isTrial: false, trialConvertedAt: null }] as Rek[],
    /** Plan KREATOR_PRO w sprzedaży (paczka 121) – null = przed migracją danych. */
    planPro: null as Rek | null,
    ustawienia: { [KLUCZ_KONFIGURACJI_KREATORA]: JSON.stringify({ wlaczony: true }) } as Record<string, string>,
  };
  let n = 0;
  const prisma = {
    platformSetting: { findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (db.ustawienia[where.key] ? { value: db.ustawienia[where.key] } : null)) },
    user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({ email: `${where.id}@example.com` })) },
    // Usługa bez `status`/`plan` = działający hosting (ACTIVE, HOSTING); abonament Pro – plan.productKind KREATOR_PRO.
    subscription: {
      findMany: vi.fn(async ({ where }: { where: Rek }) => db.subs.filter((x) => pasujeUsluga(x, where)).map(usluga)),
      findFirst: vi.fn(async ({ where }: { where: Rek }) => db.subs.filter((x) => pasujeUsluga(x, where)).map(usluga).at(-1) ?? null),
    },
    plan: { findFirst: vi.fn(async () => db.planPro) },
    kreatorZasob: {
      findMany: vi.fn(async ({ where }: { where: { userId: string; id: { in: string[] } } }) =>
        db.zasoby.filter((z) => z.userId === where.userId && where.id.in.includes(z.id as string)),
      ),
      aggregate: vi.fn(async ({ where }: { where: { userId: string } }) => ({
        _sum: { bajty: db.zasoby.filter((z) => z.userId === where.userId).reduce((a, z) => a + Number(z.bajty ?? 0), 0) || null },
      })),
    },
    kreatorStrona: {
      count: vi.fn(async ({ where }: { where: Rek }) => strony.filter((s) => pasuje(s, where)).length),
      create: vi.fn(async ({ data }: { data: Rek }) => {
        const r = { id: `s${++n}`, propozycje: null, bladOpis: null, opublikowanaAt: null, domena: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        strony.push(r);
        return r;
      }),
      findFirst: vi.fn(async ({ where }: { where: Rek }) => strony.find((s) => pasuje(s, where)) ?? null),
      findMany: vi.fn(async ({ where }: { where: Rek }) => strony.filter((s) => pasuje(s, where))),
      updateMany: vi.fn(async ({ where, data }: { where: Rek; data: Rek }) => {
        const t = strony.filter((s) => pasuje(s, where));
        t.forEach((s) => zastosuj(s, data));
        return { count: t.length };
      }),
      deleteMany: vi.fn(async ({ where }: { where: Rek }) => {
        const przed = strony.length;
        for (let i = strony.length - 1; i >= 0; i--) if (pasuje(strony[i], where)) strony.splice(i, 1);
        return { count: przed - strony.length };
      }),
    },
    kreatorWersja: {
      aggregate: vi.fn(async ({ where }: { where: Rek }) => ({
        _max: { numer: wersje.filter((v) => pasuje(v, where)).reduce<number | null>((m, v) => Math.max(m ?? 0, v.numer as number), null) },
      })),
      create: vi.fn(async ({ data }: { data: Rek }) => {
        wersje.push({ id: `v${++n}`, createdAt: new Date(), ...data });
        return {};
      }),
      count: vi.fn(async ({ where }: { where: Rek }) => wersje.filter((v) => pasuje(v, where)).length),
      findFirst: vi.fn(async ({ where }: { where: Rek }) => wersje.find((v) => pasuje(v, where)) ?? null),
      findMany: vi.fn(async ({ where, orderBy, take }: { where: Rek; orderBy?: { numer: 'asc' | 'desc' }; take?: number }) => {
        const w = wersje.filter((v) => pasuje(v, where)).sort((a, b) => ((a.numer as number) - (b.numer as number)) * (orderBy?.numer === 'desc' ? -1 : 1));
        return take ? w.slice(0, take) : w;
      }),
      deleteMany: vi.fn(async ({ where }: { where: Rek }) => {
        const ids = (where.id as { in: string[] }).in;
        for (let i = wersje.length - 1; i >= 0; i--) if (ids.includes(wersje[i].id as string)) wersje.splice(i, 1);
        return { count: ids.length };
      }),
    },
    kreatorZuzycie: {
      upsert: vi.fn(async ({ create }: { create: Rek }) => {
        if (!zuzycie.some((z) => z.userId === create.userId && z.miesiac === create.miesiac)) {
          zuzycie.push({ generacje: 0, zmiany: 0, wejTokeny: 0, wyjTokeny: 0, cacheZapis: 0, cacheOdczyt: 0, kosztUsd: 0, ...create });
        }
        return {};
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Rek; data: Rek }) => {
        const t = zuzycie.filter((z) => pasuje(z, where));
        t.forEach((z) => zastosuj(z, data));
        return { count: t.length };
      }),
      update: vi.fn(async ({ where, data }: { where: { userId_miesiac: Rek }; data: Rek }) => {
        const z = zuzycie.find((x) => pasuje(x, where.userId_miesiac))!;
        zastosuj(z, data);
        return z;
      }),
      findUnique: vi.fn(async ({ where }: { where: { userId_miesiac: Rek } }) => zuzycie.find((x) => pasuje(x, where.userId_miesiac)) ?? null),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  return { db, prisma };
}

const SALON = (() => {
  const w = walidujStrone(PRZYKLAD_SALON);
  if (!w.ok) throw new Error(w.bledy.join('; '));
  return w.strona;
})();
const zeStylem = (styl: string): Strona => ({ ...structuredClone(SALON), motyw: { ...SALON.motyw, styl } });

function aiAtrapa() {
  const ai = {
    wybierzKierunki: vi.fn((_b: unknown, ile: number) =>
      Array.from({ length: ile }, (_, i) => ({ styl: `styl-${i + 1}`, fonty: { naglowki: 'A', tekst: 'B' }, barwa: 10, charakterPalety: 'jasna', warianty: {}, zaokraglenie: 'lekkie', skalaTypografii: 'wyrazista' })),
    ),
    budujZapytanieGeneracji: vi.fn((_b: unknown, wersja: string, k: { styl: string }) => ({
      system: [{ tekst: 'MASTER', cache: '1h' }, { tekst: k.styl, cache: null }],
      wiadomosci: [{ role: 'user', content: 'brief' }],
      maxTokens: 20000,
      rodzaj: `generacja-${wersja}`,
    })),
    odczytajWynikGeneracji: vi.fn((t: string) => (t.startsWith('{') ? walidujStrone(JSON.parse(t)) : { ok: false, bledy: ['seo.tytul: za długi'] })),
    wiadomosciNaprawy: vi.fn((odp: string, bledy: string[]) => [{ role: 'assistant', content: odp }, { role: 'user', content: `Popraw: ${bledy.join(', ')}` }]),
    budujZapytanieZmiany: vi.fn(() => ({ system: [{ tekst: 'MASTER', cache: '1h' }], wiadomosci: [{ role: 'user', content: 'zmiana' }], maxTokens: 4000, rodzaj: 'zmiana-lite' })),
    odczytajWynikZmiany: vi.fn((_s: unknown, t: string) => (t.startsWith('{') ? walidujStrone(JSON.parse(t)) : { ok: false, bledy: ['x'] })),
    odciskStrony: vi.fn((s: Strona) => `odcisk-${s.motyw.styl}`),
  };
  return ai as typeof ai & FunkcjeAiKreatora;
}

function zbuduj(odpowiedzi: Array<string | Error>) {
  const { db, prisma } = bazaAtrapa();
  const ai = aiAtrapa();
  const provider = {
    anthropicZBlokami: vi.fn(async (i: { model: string }) => {
      const o = odpowiedzi.shift();
      if (o === undefined || o instanceof Error) throw o ?? new Error('brak odpowiedzi');
      return { wynik: o, dostawca: 'anthropic', model: i.model, wej: 100, wyj: 2000, zapis5m: 0, zapis1h: 4000, odczyt: 0, kosztUsd: 0.03, powodKonca: 'end_turn' };
    }),
  };
  const renderer: RendererKreatora = {
    renderuj: vi.fn(() => [
      { sciezka: 'index.html', tresc: '<html><head><link rel="stylesheet" href="assets/s.css"></head><body><script src="assets/s.js"></script></body></html>' },
      { sciezka: 'assets/s.css', tresc: 'body{color:red}' },
      { sciezka: 'assets/s.js', tresc: 'console.log(1)' },
    ]),
  };
  const config = { get: (k: string) => (k === 'PUBLIC_API_URL' ? 'https://api.verris.test/' : undefined) };
  const svc = new KreatorService(prisma as never, provider as never, config as never, ai, renderer);
  // Zadanie w tle uruchamiamy w teście jawnie (await), a nie w setImmediate.
  const zadania: Array<() => Promise<void>> = [];
  (svc as unknown as { wTle: (f: () => Promise<void>) => void }).wTle = (f) => zadania.push(f);
  const dokonczZadania = async () => {
    while (zadania.length) await zadania.shift()!();
  };
  return { svc, db, prisma, ai, provider, renderer, dokonczZadania };
}

const BRIEF = { opis: 'Salon fryzjerski w Poznaniu, strzyżenie i koloryzacja.', typ: 'wizytowka' as const, firma: { nazwa: 'Salon', branza: 'fryzjer' } };
const zuzycie = (db: { zuzycie: Rek[] }) => db.zuzycie.find((z) => z.userId === 'u1' && z.miesiac === miesiacUtc());

describe('KreatorService – dostęp i wersje', () => {
  it('bez działającego hostingu → 403 na każdej trasie, /stan mówi dlaczego', async () => {
    const { svc, db } = zbuduj([]);
    db.subs = [];
    await expect(svc.lista('u1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.utworz('u1', 'u1', { nazwa: 'x', brief: BRIEF })).rejects.toBeInstanceOf(ForbiddenException);
    const stan = await svc.stan('u1');
    expect(stan).toMatchObject({ dostep: false, wersja: null, plan: null });
    expect(stan.powod).toMatch(/hostingiem/);
  });

  it('paczka 126: korzyść „Zdjęcia AI” w /stan tylko przy włączonym generowaniu zdjęć AI w konfiguracji', async () => {
    const { svc, db } = zbuduj([]);
    const ids = async () => (await svc.stan('u1')).korzysciPro.map((k) => k.id);
    expect(await ids()).not.toContain('zdjecia-ai');
    expect(await ids()).toContain('warianty');
    db.ustawienia[KLUCZ_KONFIGURACJI_KREATORA] = JSON.stringify({ wlaczony: true, obrazyAi: { wlaczone: true, dostawca: 'bfl' } });
    expect(await ids()).toContain('zdjecia-ai');
  });

  it('kreator wyłączony: tylko konta testowe (po e-mailu albo ID)', async () => {
    const { svc, db } = zbuduj([]);
    db.ustawienia[KLUCZ_KONFIGURACJI_KREATORA] = JSON.stringify({ wlaczony: false, kontaTestowe: ['U2@example.com'] });
    expect((await svc.stan('u1')).dostep).toBe(false);
    db.subs.push({ userId: 'u2', isTrial: false, trialConvertedAt: null });
    expect((await svc.stan('u2')).dostep).toBe(true);
    db.ustawienia[KLUCZ_KONFIGURACJI_KREATORA] = JSON.stringify({ wlaczony: false, kontaTestowe: ['u1'] });
    expect((await svc.stan('u1')).dostep).toBe(true);
  });

  it('wersja: próba (tylko usługi w próbie), hosting (płatny), pro (abonament KREATOR_PRO przy płatnym hostingu)', async () => {
    const { svc, db } = zbuduj([]);
    db.subs = [{ userId: 'u1', isTrial: true, trialConvertedAt: null }];
    expect((await svc.stan('u1')).wersja).toBe('proba');
    // Abonament przy samej próbie hostingu nie włącza Pro (kupić go można tylko przy płatnym hostingu).
    db.subs.push({ userId: 'u1', isTrial: false, trialConvertedAt: null, plan: { productKind: 'KREATOR_PRO' }, priceAmount: '9.90' });
    expect((await svc.stan('u1')).wersja).toBe('proba');
    db.subs.push({ userId: 'u1', isTrial: true, trialConvertedAt: new Date() });
    const stan = await svc.stan('u1');
    expect(stan.wersja).toBe('pro');
    expect(stan.plan?.wariantyGeneracji).toBe(3);
    db.subs[1].status = 'SUSPENDED';
    expect((await svc.stan('u1')).wersja).toBe('hosting');
  });

  it('stan: cennik Pro z planu w bazie (netto jak faktura), abonament z datą końca i sposobem odnawiania', async () => {
    const { svc, db } = zbuduj([]);
    // Bez planu w sprzedaży – cennik z decyzji, zakup wyłączony.
    let stan = await svc.stan('u1');
    expect(stan.cenaPro).toEqual({ miesiacBrutto: 9.9, miesiacNetto: 8.05, rokBrutto: 99, rokNetto: 80.49 });
    expect(stan.pro.zakup).toEqual({ mozliwy: false, powod: expect.stringContaining('niedostępny') });
    // Paczka 123: zajęte miejsce na zdjęcia (suma bajtów biblioteki konta) i limit z planu.
    expect(stan.zuzycie.zdjeciaBajty).toBe(0);
    db.zasoby.push({ id: 'z1', userId: 'u1', bajty: 3 * 1048576 }, { id: 'z2', userId: 'u2', bajty: 7 });
    stan = await svc.stan('u1');
    expect(stan.zuzycie.zdjeciaBajty).toBe(3 * 1048576);
    expect(stan.plan?.miejsceZdjecMb).toBe(500);
    db.planPro = { id: 'plan-pro', priceMonthly: '12.30', priceYearly: '123.00' };
    stan = await svc.stan('u1');
    expect(stan.cenaPro).toEqual({ miesiacBrutto: 12.3, miesiacNetto: 10, rokBrutto: 123, rokNetto: 100 });
    expect(stan.pro).toMatchObject({ planId: 'plan-pro', zakup: { mozliwy: true, powod: null }, abonament: null });
    const koniec = new Date('2026-12-08T10:00:00Z');
    db.subs.push({
      id: 'sub-pro', userId: 'u1', plan: { productKind: 'KREATOR_PRO' }, interval: 'YEAR', paymentSource: 'STRIPE_CARD',
      currentPeriodEnd: koniec, cancelAt: koniec, priceAmount: '99.00', listPriceAmount: null,
    });
    stan = await svc.stan('u1');
    expect(stan.pro.zakup).toEqual({ mozliwy: false, powod: expect.stringContaining('Masz już abonament') });
    expect(stan.pro.abonament).toEqual({
      id: 'sub-pro', status: 'ACTIVE', interval: 'YEAR', aktywnyDo: koniec.toISOString(), odnowienie: 'karta', bezOdnowienia: true, cena: '99.00',
      powodBezOdnowienia: null, nastepnyOkres: null,
    });
    // Paczka 123: odnowienie wyłączone, a płatnego hostingu już nie ma (anulowany) → powód „brak hostingu”.
    db.subs[0]!.status = 'CANCELED';
    stan = await svc.stan('u1');
    expect(stan.pro.abonament?.powodBezOdnowienia).toBe('brak-hostingu');
    // Hosting zawieszony (wraca po zapłacie) – nadal „jest hosting”.
    db.subs[0]!.status = 'SUSPENDED';
    expect((await svc.stan('u1')).pro.abonament?.powodBezOdnowienia).toBeNull();
  });

  it('cudza strona → 404 (odczyt, zapis, podgląd, usunięcie)', async () => {
    const { svc, db } = zbuduj([]);
    db.strony.push({ id: 'obca', userId: 'u2', status: 'GOTOWA', model: SALON, propozycje: null });
    await expect(svc.pobierz('u1', 'obca')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.zapiszRecznie('u1', 'obca', SALON)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.podglad('u1', 'obca', {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.usun('u1', 'obca')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.zmienNazwe('u1', 'obca', 'Moja')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.strony).toHaveLength(1);
    expect(db.strony[0].nazwa).toBeUndefined();
  });

  it('PATCH nazwy: własna strona – nazwa przycięta i zapisana; pusta / ponad 80 znaków → 400; bez dostępu → 403', async () => {
    const { svc, db } = zbuduj([]);
    db.strony.push({ id: 'moja', userId: 'u1', nazwa: 'Stara', status: 'GOTOWA', model: SALON, propozycje: null });
    expect(await svc.zmienNazwe('u1', 'moja', '  Salon   na Rynku ')).toEqual({ id: 'moja', nazwa: 'Salon na Rynku' });
    expect(db.strony[0].nazwa).toBe('Salon na Rynku');
    await expect(svc.zmienNazwe('u1', 'moja', '   ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.zmienNazwe('u1', 'moja', 'x'.repeat(81))).rejects.toBeInstanceOf(BadRequestException);
    expect(db.strony[0].nazwa).toBe('Salon na Rynku');
    db.subs = [];
    await expect(svc.zmienNazwe('u1', 'moja', 'Nowa')).rejects.toBeInstanceOf(ForbiddenException);

    const dto = (nazwa: unknown) => validate(plainToInstance(ZmienNazweDto, { nazwa }));
    expect(await dto('Salon')).toHaveLength(0);
    expect(await dto('')).not.toHaveLength(0);
    expect(await dto('x'.repeat(81))).not.toHaveLength(0);
    expect(await dto(5)).not.toHaveLength(0);
  });
});

describe('KreatorService – limity per wersja', () => {
  it('próba: 1 strona i 1 generacja w miesiącu – druga odmowa PRZED wywołaniem AI', async () => {
    const { svc, db, provider, dokonczZadania } = zbuduj([JSON.stringify(SALON)]);
    db.subs = [{ userId: 'u1', isTrial: true, trialConvertedAt: null }];
    await svc.utworz('u1', 'u1', { nazwa: 'Pierwsza', brief: BRIEF });
    await dokonczZadania();
    await expect(svc.utworz('u1', 'u1', { nazwa: 'Druga', brief: BRIEF })).rejects.toThrow(/najwyżej 1 stronę/);
    db.strony.length = 0; // nawet po usunięciu strony limit generacji miesiąca zostaje
    await expect(svc.utworz('u1', 'u1', { nazwa: 'Druga', brief: BRIEF })).rejects.toThrow(/limit generacji stron \(1\)/);
    expect(provider.anthropicZBlokami).toHaveBeenCalledTimes(1);
  });

  it('hosting: limit zmian AI (200) liczony w KreatorZuzycie, odmowa bez wywołania AI', async () => {
    const { svc, db, provider } = zbuduj([]);
    db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: SALON, propozycje: null });
    db.zuzycie.push({ userId: 'u1', miesiac: miesiacUtc(), generacje: 0, zmiany: 200, kosztUsd: 0 });
    await expect(svc.zmienAi('u1', 'u1', 's1', { polecenie: 'Krótszy nagłówek' })).rejects.toThrow(/limit zmian AI \(200\)/);
    expect(provider.anthropicZBlokami).not.toHaveBeenCalled();
  });
});

describe('KreatorService – zadanie generacji', () => {
  it('sukces: model zapisany, wersja AI_GENERACJA, odcisk i branża, zużycie z kosztem cache', async () => {
    const { svc, db, provider, ai, dokonczZadania } = zbuduj([JSON.stringify(SALON)]);
    const { id } = await svc.utworz('u1', 'osoba', { nazwa: 'Salon', brief: BRIEF });
    expect(db.strony[0]).toMatchObject({ id, status: 'GENEROWANIE', branza: 'fryzjer' });
    await dokonczZadania();
    expect(db.strony[0]).toMatchObject({ status: 'GOTOWA', odcisk: 'odcisk-cieply-nowoczesny', propozycje: null, bladOpis: null });
    expect(db.wersje).toEqual([expect.objectContaining({ stronaId: id, numer: 1, zrodlo: 'AI_GENERACJA' })]);
    expect(provider.anthropicZBlokami).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-5-5', funkcja: 'kreator', userId: 'u1', actorUserId: 'osoba', maxTokens: 20000, system: [{ tekst: 'MASTER', cache: '1h' }, { tekst: 'styl-1', cache: null }] }),
    );
    expect(zuzycie(db)).toMatchObject({ generacje: 1, wejTokeny: 100, wyjTokeny: 2000, cacheZapis: 4000, cacheOdczyt: 0, kosztUsd: 0.03 });
    // Brief idzie do odczytu wyniku – kontrakt odrzuca ceny spoza briefu i dane kontaktowe, których klient nie podał.
    expect(ai.odczytajWynikGeneracji).toHaveBeenCalledWith(JSON.stringify(SALON), 'hosting', expect.objectContaining({ opis: BRIEF.opis, firma: BRIEF.firma }));
  });

  it('naprawa: błąd walidacji → jedna runda z doklejoną odpowiedzią i listą błędów, potem sukces', async () => {
    const { svc, db, provider, ai, dokonczZadania } = zbuduj(['to nie JSON', JSON.stringify(SALON)]);
    await svc.utworz('u1', 'u1', { nazwa: 'Salon', brief: BRIEF });
    await dokonczZadania();
    expect(db.strony[0].status).toBe('GOTOWA');
    expect(ai.wiadomosciNaprawy).toHaveBeenCalledWith('to nie JSON', ['seo.tytul: za długi']);
    const drugie = provider.anthropicZBlokami.mock.calls[1][0] as unknown as { wiadomosci: unknown[] };
    expect(drugie.wiadomosci).toEqual([
      { role: 'user', content: 'brief' },
      { role: 'assistant', content: 'to nie JSON' },
      { role: 'user', content: 'Popraw: seo.tytul: za długi' },
    ]);
    expect(zuzycie(db)).toMatchObject({ generacje: 1, wyjTokeny: 4000 });
  });

  it('błąd AI → status BLAD z polskim opisem, limit generacji zwrócony, koszt nieudanej próby zapisany', async () => {
    const { svc, db, dokonczZadania } = zbuduj([new ServiceUnavailableException('{"type":"overloaded_error"}')]);
    await svc.utworz('u1', 'u1', { nazwa: 'Salon', brief: BRIEF });
    expect(zuzycie(db)?.generacje).toBe(1); // zarezerwowane przed AI
    await dokonczZadania();
    expect(db.strony[0]).toMatchObject({ status: 'BLAD' });
    expect(db.strony[0].bladOpis).toMatch(/Nie udało się wygenerować/);
    expect(db.strony[0].bladOpis).not.toMatch(/overloaded/);
    expect(zuzycie(db)?.generacje).toBe(0);
    expect(db.wersje).toHaveLength(0);
  });

  it('dwie złe odpowiedzi (także po naprawie) → BLAD bez zużycia limitu, ale z kosztem tokenów', async () => {
    const { svc, db, dokonczZadania } = zbuduj(['źle', 'dalej źle']);
    await svc.utworz('u1', 'u1', { nazwa: 'Salon', brief: BRIEF });
    await dokonczZadania();
    expect(db.strony[0].status).toBe('BLAD');
    expect(zuzycie(db)).toMatchObject({ generacje: 0, wyjTokeny: 4000, kosztUsd: 0.06 });
  });

  it('Pro: 3 kierunki, pierwszy przed resztą; pierwsza poprawna propozycja = model, reszta w propozycje; wybór propozycji', async () => {
    const { svc, db, ai, dokonczZadania } = zbuduj([JSON.stringify(zeStylem('a')), JSON.stringify(zeStylem('b')), JSON.stringify(zeStylem('c'))]);
    db.subs.push({ userId: 'u1', isTrial: false, trialConvertedAt: null, plan: { productKind: 'KREATOR_PRO' }, priceAmount: '9.90' });
    db.strony.push({ id: 'stara', userId: 'u9', branza: 'fryzjer', odcisk: 'odcisk-x', status: 'GOTOWA' });
    const { id } = await svc.utworz('u1', 'u1', { nazwa: 'Salon', brief: BRIEF });
    await dokonczZadania();
    expect(ai.wybierzKierunki).toHaveBeenCalledWith(expect.objectContaining({ typ: 'wizytowka' }), 3, ['odcisk-x'], undefined, 'pro');
    const s = db.strony.find((x) => x.id === id)!;
    expect((s.model as Strona).motyw.styl).toBe('a');
    expect((s.propozycje as Strona[]).map((p) => p.motyw.styl)).toEqual(['b', 'c']);

    const po = await svc.wybierzPropozycje('u1', id, 2);
    expect(po.model?.motyw.styl).toBe('c');
    expect((po.propozycje as Strona[]).map((p) => p.motyw.styl)).toEqual(['b', 'a']);
    expect(db.wersje.map((v) => v.numer)).toEqual([1, 2]);
    await expect(svc.wybierzPropozycje('u1', id, 3)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('strona usunięta w trakcie generacji → nic nie zapisujemy, limit wraca', async () => {
    const { svc, db, dokonczZadania } = zbuduj([JSON.stringify(SALON)]);
    const { id } = await svc.utworz('u1', 'u1', { nazwa: 'Salon', brief: BRIEF });
    await svc.usun('u1', id);
    await dokonczZadania();
    expect(db.wersje).toHaveLength(0);
    expect(zuzycie(db)?.generacje).toBe(0);
  });

  it('generacja przerwana (restart API) → BLAD przy odczycie i zwrot rezerwacji', async () => {
    const { svc, db } = zbuduj([]);
    const dawno = new Date(Date.now() - 21 * 60_000);
    db.strony.push({ id: 's1', userId: 'u1', status: 'GENEROWANIE', model: {}, createdAt: dawno, updatedAt: dawno, propozycje: null });
    db.zuzycie.push({ userId: 'u1', miesiac: miesiacUtc(dawno), generacje: 1, zmiany: 0, kosztUsd: 0 });
    const lista = await svc.lista('u1');
    expect(lista[0]).toMatchObject({ status: 'BLAD', bladOpis: expect.stringMatching(/przerwane/) });
    expect(db.zuzycie[0].generacje).toBe(0);
  });

  it('dane firmy niezgodne ze schematem → 400 z listą błędów, bez rezerwacji', async () => {
    const { svc, db } = zbuduj([]);
    await expect(svc.utworz('u1', 'u1', { nazwa: 'x', brief: { ...BRIEF, firma: { telefon: 'abc' } } })).rejects.toMatchObject({
      response: { bledy: [expect.stringMatching(/^firma\.telefon/)] },
    });
    expect(db.zuzycie).toHaveLength(0);
  });
});

describe('KreatorService – edycja, wersje, podgląd', () => {
  it('zmiana AI: sukces = wersja AI_ZMIANA i zużyta zmiana; nieudana (także po naprawie) = 422 i zmiana zwrócona', async () => {
    const zmieniony = zeStylem('nowy');
    const { svc, db } = zbuduj([JSON.stringify(zmieniony), 'źle', 'źle']);
    db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: SALON, propozycje: null });
    const r = await svc.zmienAi('u1', 'u1', 's1', { polecenie: 'Inny styl', sekcjaId: 'start' });
    expect(r.model?.motyw.styl).toBe('nowy');
    expect(db.wersje).toEqual([expect.objectContaining({ numer: 1, zrodlo: 'AI_ZMIANA', opis: 'Inny styl' })]);
    expect(zuzycie(db)?.zmiany).toBe(1);

    await expect(svc.zmienAi('u1', 'u1', 's1', { polecenie: 'Coś' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(zuzycie(db)?.zmiany).toBe(1);
    await expect(svc.zmienAi('u1', 'u1', 's1', { polecenie: 'Coś', sekcjaId: 'nie-ma' })).rejects.toThrow(/Nie ma takiej sekcji/);
  });

  it('zmiana AI: błąd dostawcy → 503 po polsku bez treści dostawcy, zmiana zwrócona', async () => {
    const { svc, db } = zbuduj([new ServiceUnavailableException('{"type":"rate_limit_error","message":"anthropic"}')]);
    db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: SALON, propozycje: null });
    const e = await svc.zmienAi('u1', 'u1', 's1', { polecenie: 'Coś' }).then(() => null, (x: unknown) => x as Error);
    expect(e).toBeInstanceOf(ServiceUnavailableException);
    expect(e?.message).toMatch(/Kreator AI jest chwilowo niedostępny/);
    expect(zuzycie(db)?.zmiany).toBe(0);
  });

  it(`zapis ręczny: walidacja modelu (400 z błędami), wersje RECZNA, przycinanie do ${LIMIT_WERSJI} najstarszych ręcznych`, async () => {
    const { svc, db } = zbuduj([]);
    db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: SALON, propozycje: null });
    await expect(svc.zapiszRecznie('u1', 's1', { ...SALON, strony: [] })).rejects.toMatchObject({ response: { bledy: expect.any(Array) } });
    db.wersje.push({ id: 'ai', stronaId: 's1', numer: 1, zrodlo: 'AI_GENERACJA', model: SALON });
    for (let i = 2; i <= LIMIT_WERSJI; i++) db.wersje.push({ id: `r${i}`, stronaId: 's1', numer: i, zrodlo: 'RECZNA', model: SALON });
    await svc.zapiszRecznie('u1', 's1', zeStylem('po-zapisie'));
    expect(db.wersje).toHaveLength(LIMIT_WERSJI);
    expect(db.wersje.some((v) => v.id === 'ai')).toBe(true); // wersji AI nie przycinamy
    expect(db.wersje.some((v) => v.id === 'r2')).toBe(false); // najstarsza ręczna wypadła
    expect(db.wersje.at(-1)).toMatchObject({ numer: LIMIT_WERSJI + 1, zrodlo: 'RECZNA' });
  });

  it('przywrócenie wersji: nowy wpis PRZYWROCENIE z modelem tamtej wersji; nieistniejąca → 404', async () => {
    const { svc, db } = zbuduj([]);
    db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: zeStylem('teraz'), propozycje: null });
    db.wersje.push({ id: 'v1', stronaId: 's1', numer: 1, zrodlo: 'AI_GENERACJA', model: zeStylem('dawniej') });
    const r = await svc.przywroc('u1', 's1', 1);
    expect(r.model?.motyw.styl).toBe('dawniej');
    expect(db.wersje.at(-1)).toMatchObject({ numer: 2, zrodlo: 'PRZYWROCENIE', opis: 'Przywrócono wersję 1' });
    await expect(svc.przywroc('u1', 's1', 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('podgląd: renderer w trybie podglądu z bazą fontów API, CSS i JS inline, nagłówki sandbox/noindex/no-store', async () => {
    const { svc, db, renderer } = zbuduj([]);
    db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: SALON, propozycje: null });
    const { html, naglowki } = await svc.podglad('u1', 's1', { pro: '1' });
    expect(renderer.renderuj).toHaveBeenCalledWith(expect.objectContaining({ firma: expect.any(Object) }), {
      tryb: 'podglad',
      wersja: 'hosting',
      podgladPro: true,
      bazaFontow: 'https://api.verris.test/fonts/kreator',
    });
    expect(html).toContain('<style>body{color:red}</style>');
    expect(html).toContain('<script>console.log(1)</script>');
    expect(naglowki['Content-Security-Policy']).toMatch(/^sandbox allow-scripts;/);
    expect(naglowki['Content-Security-Policy']).not.toMatch(/allow-same-origin/);
    expect(naglowki).toMatchObject({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
    await expect(svc.podglad('u1', 's1', { podstrona: 'nie-ma' })).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('paczka 122 – zdjęcia z biblioteki w modelu (Obraz.zasobId)', () => {
    const ZASOB = '3f2a9c4e-8b1d-4f6a-9c2e-1a2b3c4d5e6f';
    const zeZdjeciem = (): Strona => {
      const m = structuredClone(SALON);
      const hero = m.strony[0]!.sekcje.find((x) => x.typ === 'hero')!;
      if (hero.typ !== 'hero') throw new Error('hero');
      hero.dane.obraz = { alt: 'Wnętrze', zrodlo: 'wlasne', zasobId: ZASOB, proporcje: '4:3', szerokosc: 5000 };
      return m;
    };

    it('zapis ręczny z cudzym zdjęciem → 400 bez nowej wersji; z własnym – wymiary z bazy', async () => {
      const { svc, db } = zbuduj([]);
      db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: SALON, propozycje: null });
      db.zasoby.push({ id: ZASOB, userId: 'obcy', szerokosc: 800, wysokosc: 600 });
      await expect(svc.zapiszRecznie('u1', 's1', zeZdjeciem())).rejects.toBeInstanceOf(BadRequestException);
      expect(db.wersje).toHaveLength(0);
      db.zasoby[0]!.userId = 'u1';
      const r = await svc.zapiszRecznie('u1', 's1', zeZdjeciem());
      const hero = r.model!.strony[0]!.sekcje.find((x) => x.typ === 'hero')!;
      expect(hero.typ === 'hero' && hero.dane.obraz).toMatchObject({ zasobId: ZASOB, szerokosc: 800, wysokosc: 600 });
    });

    it('zmiana AI wstawiająca cudze zdjęcie → odrzucona, limit zmian zwrócony', async () => {
      const { svc, db } = zbuduj([JSON.stringify(zeZdjeciem())]);
      db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: SALON, propozycje: null });
      await expect(svc.zmienAi('u1', 'u1', 's1', { polecenie: 'Dodaj zdjęcie' })).rejects.toBeInstanceOf(BadRequestException);
      expect(db.wersje).toHaveLength(0);
      expect(zuzycie(db)?.zmiany).toBe(0);
    });

    it('podgląd: zdjęcia z biblioteki dostają podpisany adres API (adresZasobu)', async () => {
      const { svc, db, renderer } = zbuduj([]);
      (svc as unknown as { config: { get: (k: string) => string | undefined } }).config = {
        get: (k: string) => (k === 'PUBLIC_API_URL' ? 'https://api.verris.test/' : k === 'appKmsKey' ? 'k'.repeat(48) : undefined),
      };
      db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: zeZdjeciem(), propozycje: null });
      await svc.podglad('u1', 's1', {});
      const opcje = vi.mocked(renderer.renderuj).mock.calls[0]![1] as { adresZasobu?: (id: string, s: number, f: 'webp' | 'jpg') => string };
      expect(opcje.adresZasobu!(ZASOB, 960, 'webp')).toMatch(/^https:\/\/api\.verris\.test\/kreator\/z\/[0-9a-f]{64}\/960\.webp$/);
    });
  });
});

describe('KreatorService – ponowna generacja (paczka 123)', () => {
  it('utworzenie zapisuje brief przy stronie (bez pól spoza formularza)', async () => {
    const { svc, db } = zbuduj([]);
    const { id } = await svc.utworz('u1', 'u1', { nazwa: 'Salon', brief: BRIEF });
    expect(db.strony.find((s) => s.id === id)?.brief).toEqual(BRIEF);
  });

  it('strona z błędem: ta sama strona generowana od nowa z zapisanego briefu, limit zarezerwowany, bez nowej strony', async () => {
    const { svc, db, ai, dokonczZadania } = zbuduj([JSON.stringify(SALON)]);
    db.strony.push({ id: 's1', userId: 'u1', nazwa: 'Salon', status: 'BLAD', bladOpis: 'Nie udało się', model: {}, brief: BRIEF, propozycje: null, createdAt: new Date(), updatedAt: new Date() });
    const w = await svc.generujPonownie('u1', 'u1', 's1');
    expect(w).toMatchObject({ id: 's1', status: 'GENEROWANIE', bladOpis: null });
    expect(zuzycie(db)?.generacje).toBe(1);
    await dokonczZadania();
    expect(db.strony).toHaveLength(1);
    expect(db.strony[0]).toMatchObject({ status: 'GOTOWA', model: SALON });
    expect(ai.budujZapytanieGeneracji.mock.calls[0]![0]).toEqual(BRIEF);
    // Bez historii wersji „przed” – strona z błędem nie miała projektu.
    expect(db.wersje.map((v) => v.zrodlo)).toEqual(['AI_GENERACJA']);
  });

  it('gotowa strona: bieżący model najpierw w historii wersji; nieudana generacja zwraca poprzedni projekt i limit', async () => {
    const { svc, db, dokonczZadania } = zbuduj(['źle', 'źle']);
    const stary = zeStylem('stary');
    db.strony.push({ id: 's1', userId: 'u1', nazwa: 'Salon', status: 'GOTOWA', model: stary, brief: BRIEF, propozycje: null, createdAt: new Date(), updatedAt: new Date() });
    db.wersje.push({ stronaId: 's1', numer: 3, model: stary, zrodlo: 'AI_GENERACJA' });
    await svc.generujPonownie('u1', 'u1', 's1');
    expect(db.wersje.at(-1)).toMatchObject({ stronaId: 's1', numer: 4, model: stary, zrodlo: 'RECZNA', opis: 'Projekt przed wygenerowaniem od nowa' });
    await dokonczZadania();
    expect(db.strony[0]).toMatchObject({ status: 'GOTOWA', model: stary, bladOpis: expect.stringMatching(/zostawiliśmy poprzedni projekt/) });
    expect(zuzycie(db)?.generacje).toBe(0);
  });

  it('w trakcie generowania → 409; strona bez briefu (sprzed paczki) → 409; wyczerpany limit → 403 bez zmiany strony', async () => {
    const { svc, db } = zbuduj([]);
    db.strony.push({ id: 's1', userId: 'u1', status: 'GENEROWANIE', model: {}, brief: BRIEF, propozycje: null, updatedAt: new Date() });
    db.strony.push({ id: 's2', userId: 'u1', status: 'BLAD', model: {}, brief: null, propozycje: null });
    db.strony.push({ id: 's3', userId: 'u1', status: 'BLAD', model: {}, brief: BRIEF, propozycje: null });
    await expect(svc.generujPonownie('u1', 'u1', 's1')).rejects.toThrow(/jeszcze generowana/);
    await expect(svc.generujPonownie('u1', 'u1', 's2')).rejects.toThrow(/przed zapisywaniem opisu/);
    db.zuzycie.push({ userId: 'u1', miesiac: miesiacUtc(), generacje: 3, zmiany: 0, kosztUsd: 0 });
    await expect(svc.generujPonownie('u1', 'u1', 's3')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.strony[2].status).toBe('BLAD');
    await expect(svc.generujPonownie('u1', 'u1', 'obca')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('KreatorService – wersje językowe (paczka 124)', () => {
  /** Odpowiedź „modelu” z tłumaczeniem strony głównej salonu na angielski (fikstura salon-en). */
  const odpEn = (klucz = '', sciezka = '') => {
    const en = PRZYKLAD_SALON_EN.strony.find((p) => p.slug === 'en')!;
    return JSON.stringify({ podstrony: [{ klucz, sciezka, tytul: klucz ? 'Prices' : en.tytul, seo: en.seo, sekcje: en.sekcje }], stopka: 'An intimate hair salon in Poznan.' });
  };
  const zPro = (db: { subs: Rek[] }) => db.subs.push({ userId: 'u1', isTrial: false, trialConvertedAt: null, plan: { productKind: 'KREATOR_PRO' }, priceAmount: '9.90' });
  const zbudujT = (odpowiedzi: Array<string | Error>) => {
    const z = zbuduj(odpowiedzi);
    z.ai.budujZapytanieTlumaczenia = vi.fn(funkcjeAiKreatora.budujZapytanieTlumaczenia);
    z.ai.odczytajWynikTlumaczenia = vi.fn(funkcjeAiKreatora.odczytajWynikTlumaczenia);
    return z;
  };

  it('tylko Kreator Pro – bez Pro 403 bez wywołania AI i bez zużycia limitu', async () => {
    const { svc, db, provider } = zbudujT([odpEn()]);
    db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: SALON, propozycje: null });
    await expect(svc.tlumacz('u1', 'u1', 's1', { jezyk: 'en' })).rejects.toThrow(/dostępne w Kreatorze Pro/);
    expect(provider.anthropicZBlokami).not.toHaveBeenCalled();
    expect(zuzycie(db)?.zmiany ?? 0).toBe(0);
  });

  it('Pro: nowa wersja – strona główna + stopka, jedna zmiana AI na podstronę, wersja w historii, skrót oryginału', async () => {
    const { svc, db, ai } = zbudujT([odpEn()]);
    zPro(db);
    db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: SALON, propozycje: null });
    const r = await svc.tlumacz('u1', 'u1', 's1', { jezyk: 'en' });
    expect(r.przetlumaczone).toEqual(['']);
    expect(ai.budujZapytanieTlumaczenia).toHaveBeenCalledWith(expect.anything(), 'en', [''], 'pro', true);
    const model = r.model!;
    expect(model.jezykiDodatkowe).toEqual(['en']);
    const en = model.strony.find((p) => p.slug === 'en')!;
    expect(en.tlumaczenie?.zrodlo).toBe(skrotTresci(model.strony[0]!));
    expect(model.stopka.tlumaczenia?.en?.tekst).toBe('An intimate hair salon in Poznan.');
    expect(zuzycie(db)?.zmiany).toBe(1);
    expect(db.wersje).toEqual([expect.objectContaining({ zrodlo: 'AI_ZMIANA', opis: 'Tłumaczenie (angielski): Start' })]);
    // Zmiana oryginału po tłumaczeniu = tłumaczenie nieaktualne (edytor pokazuje ostrzeżenie).
    const zmieniony = structuredClone(model);
    zmieniony.strony[0]!.tytul = 'Strona główna';
    expect(tlumaczenieNieaktualne(zmieniony, zmieniony.strony.find((p) => p.slug === 'en')!)).toBe(true);
  });

  it('pierwsze tłumaczenie języka zawsze dokłada stronę główną; nieudana strona główna = 422 i zwrot limitu', async () => {
    const z = structuredClone(SALON);
    z.strony.push({ ...structuredClone(z.strony[0]!), slug: 'cennik', tytul: 'Cennik' });
    const { svc, db, ai } = zbudujT(['zła odpowiedź', 'nadal zła']);
    zPro(db);
    db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: z, propozycje: null });
    await expect(svc.tlumacz('u1', 'u1', 's1', { jezyk: 'de', podstrony: ['cennik'] })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(ai.budujZapytanieTlumaczenia).toHaveBeenCalledTimes(1);
    expect(ai.budujZapytanieTlumaczenia).toHaveBeenCalledWith(expect.anything(), 'de', [''], 'pro', true);
    expect(zuzycie(db)?.zmiany).toBe(0);
    expect(db.wersje).toEqual([]);
  });

  it('limit zmian AI: brak miejsca → 403 bez wywołania AI', async () => {
    const { svc, db, provider } = zbudujT([odpEn()]);
    zPro(db);
    db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: SALON, propozycje: null });
    db.zuzycie.push({ userId: 'u1', miesiac: miesiacUtc(), generacje: 0, zmiany: 1000, kosztUsd: 0 });
    await expect(svc.tlumacz('u1', 'u1', 's1', { jezyk: 'en' })).rejects.toThrow(/limit zmian AI \(1000\)/);
    expect(provider.anthropicZBlokami).not.toHaveBeenCalled();
  });

  it('język główny i nieznana podstrona → 400', async () => {
    const { svc, db } = zbudujT([]);
    zPro(db);
    db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: SALON, propozycje: null });
    await expect(svc.tlumacz('u1', 'u1', 's1', { jezyk: 'pl' as never })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.tlumacz('u1', 'u1', 's1', { jezyk: 'en', podstrony: ['nie-ma'] })).rejects.toThrow(/Nie ma takiej podstrony/);
  });

  it('DTO: tylko en/de/uk, najwyżej 5 podstron naraz', async () => {
    const bledy = async (x: unknown) => (await validate(plainToInstance(TlumaczenieDto, x))).length;
    expect(await bledy({ jezyk: 'en' })).toBe(0);
    expect(await bledy({ jezyk: 'pl' })).toBeGreaterThan(0);
    expect(await bledy({ jezyk: 'en', podstrony: ['a', 'b', 'c', 'd', 'e', 'f'] })).toBeGreaterThan(0);
    expect(await bledy({ jezyk: 'en', podstrony: ['', 'blog/wpis'] })).toBe(0);
  });

  it('zmiana sekcji AI w wersji językowej: podstrona z żądania trafia do zapytania i odczytu', async () => {
    const { svc, db, ai } = zbuduj(['{}']);
    zPro(db);
    const model = walidujStrone(PRZYKLAD_SALON_EN);
    if (!model.ok) throw new Error(model.bledy.join());
    db.strony.push({ id: 's1', userId: 'u1', status: 'GOTOWA', model: model.strona, propozycje: null });
    await svc.zmienAi('u1', 'u1', 's1', { polecenie: 'Shorter', sekcjaId: 'start', podstrona: 'en' }).catch(() => undefined);
    expect(ai.budujZapytanieZmiany).toHaveBeenCalledWith(expect.anything(), 'Shorter', 'start', 'pro', 'en');
    await expect(svc.zmienAi('u1', 'u1', 's1', { polecenie: 'Shorter', sekcjaId: 'start', podstrona: 'cennik' })).rejects.toThrow(/Nie ma takiej sekcji/);
  });
});
