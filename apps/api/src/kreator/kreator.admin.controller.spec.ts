import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@verris/database';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { kosztZCacheUsd, DOMYSLNA_KONFIGURACJA_AI } from '../ai/ai-modele.js';
import { KreatorAdminController, BLAD_MODELU } from './kreator.admin.controller.js';
import { rozbicieKosztow, przychodPro, uzupelnijDni } from './kreator.admin.podsumowanie.js';
import { DOMYSLNA_KONFIGURACJA_KREATORA, KLUCZ_KONFIGURACJI_KREATORA, type KonfiguracjaKreatora } from './konfiguracja.js';
import { BibliotekaZdjec } from './biblioteka/biblioteka.js';
import { DostawcaPixabay } from './biblioteka/pixabay.js';
import { DostawcaOpenverse } from './biblioteka/openverse.js';
import { DostawcaPexels } from './biblioteka/pexels.js';
import { KontoTestoweDto } from './dto/kreator-admin.dto.js';

/**
 * Paczka 123 – ekran „Kreator stron” w adminie: konfiguracja (modele tylko Anthropic z listy, biblioteki zdjęć
 * z informacją o kluczu bez klucza), konta testowe po e-mailu istniejącego konta, podsumowanie miesiąca z kosztem
 * cache i przychodem Kreatora Pro. Zapytania SQL na prawdziwej bazie – test/integration/kreator-admin.int-spec.ts.
 */

const KLUCZ_PIXABAY = 'pixabay-SEKRET-123';
const ceny = DOMYSLNA_KONFIGURACJA_AI.ceny;

function stanowisko(konf: Partial<KonfiguracjaKreatora> = {}, uzytkownicy: { id: string; email: string }[] = [], regulamin: string | null = 'Regulamin – Hosting, VPS, Domeny') {
  let zapisana: KonfiguracjaKreatora = { ...DOMYSLNA_KONFIGURACJA_KREATORA, ...konf };
  const prisma = {
    user: {
      findFirst: vi.fn(async ({ where }: { where: { email: { equals: string } } }) => {
        const u = uzytkownicy.find((x) => x.email.toLowerCase() === where.email.equals.toLowerCase());
        return u ? { id: u.id } : null;
      }),
      findMany: vi.fn(async () => uzytkownicy),
    },
    legalDocument: { findFirst: vi.fn(async () => (regulamin === null ? null : { version: '1.2.0', contentMarkdown: regulamin })) },
    platformSetting: {
      upsert: vi.fn(async ({ create }: { create: { value: string } }) => {
        zapisana = JSON.parse(create.value) as KonfiguracjaKreatora;
        return {};
      }),
    },
    kreatorZuzycie: {
      aggregate: vi.fn(async () => ({ _sum: { generacje: 4, zmiany: 31, kosztUsd: new Prisma.Decimal('1.2345'), cacheZapis: 1000, cacheOdczyt: 9000 } })),
      count: vi.fn(async () => 3),
    },
    $queryRaw: vi.fn(async (sql: TemplateStringsArray) => {
      const s = sql.join('?');
      if (s.includes('FROM "KreatorStrona"')) return [{ razem: 7, konta: 4, opublikowane: 2, generowane: 1, bledne: 1 }];
      if (s.includes('GROUP BY "model"')) {
        return [{ model: 'claude-sonnet-5-5', wywolania: 5, wej: 1000, wyj: 500, zapis5m: 0, zapis1h: 10_000, odczyt: 40_000, kosztUsd: 0.051 }];
      }
      if (s.includes('GROUP BY 1')) return [{ dzien: '2026-11-08', wywolania: 5, generacje: 3, zmiany: 2, kosztUsd: 0.051 }];
      throw new Error(`nieoczekiwane zapytanie: ${s}`);
    }),
    subscription: { findMany: vi.fn(async () => [{ priceAmount: new Prisma.Decimal('9.90'), interval: 'MONTH' }, { priceAmount: new Prisma.Decimal('99.00'), interval: 'YEAR' }]) },
    kreatorZasob: { aggregate: vi.fn(async () => ({ _count: { _all: 12 }, _sum: { bajty: 3_500_000 } })) },
    kreatorStrona: {
      findMany: vi.fn(async () => [
        { id: 's1', updatedAt: new Date('2026-11-08T10:00:00Z'), bladOpis: `Nie udało się wygenerować strony – ${'x'.repeat(300)}`, user: { email: 'jan@przyklad.pl' } },
      ]),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const provider = { konfiguracja: vi.fn(async () => ({ ...DOMYSLNA_KONFIGURACJA_AI })), klucz: vi.fn(() => 'sk-ant') };
  const kreator = { konfiguracja: vi.fn(async () => zapisana) };
  const biblioteka = new BibliotekaZdjec([new DostawcaPixabay(KLUCZ_PIXABAY), new DostawcaOpenverse(), new DostawcaPexels(undefined)]);
  const c = new KreatorAdminController(prisma as never, provider as never, audit as never, kreator as never, biblioteka);
  return { c, prisma, audit, zapisana: () => zapisana };
}

const ADMIN = { userId: 'admin-1' };

describe('KreatorAdminController – strażnik', () => {
  const kontekst = (handler: unknown, role: string) =>
    ({
      getHandler: () => handler,
      getClass: () => KreatorAdminController,
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u1', role } }) }),
    }) as never;

  it.each(['konfiguracja', 'zapisz', 'dodajKonto', 'usunKonto', 'podsumowanie'] as const)('%s: tylko ADMIN (STAFF i klient → 403)', (m) => {
    const g = new RolesGuard(new Reflector());
    const h = KreatorAdminController.prototype[m];
    expect(g.canActivate(kontekst(h, 'ADMIN'))).toBe(true);
    expect(g.canActivate(kontekst(h, 'STAFF'))).toBe(false);
    expect(g.canActivate(kontekst(h, 'USER'))).toBe(false);
  });
});

describe('KreatorAdminController – konfiguracja', () => {
  it('odczyt: modele tylko Anthropic, biblioteki z informacją o kluczu (bez wartości klucza), konta testowe z istnieniem', async () => {
    const { c } = stanowisko({ kontaTestowe: ['jan@przyklad.pl', 'nikt@przyklad.pl'] }, [{ id: 'u-jan', email: 'Jan@Przyklad.pl' }]);
    const r = await c.konfiguracja();
    expect(r.modele.length).toBeGreaterThan(0);
    expect(r.modele.every((m) => m.model.startsWith('claude-'))).toBe(true);
    expect(r.modele.find((m) => m.model === 'claude-sonnet-5-5')).toMatchObject({ nazwa: 'Claude Sonnet 5.5', cenaWej: 2, cenaWyj: 10, mnoznikOdczytuCache: 0.05 });
    expect(r.biblioteki).toEqual([
      { id: 'pixabay', nazwa: 'Pixabay', wymagaKlucza: true, gotowa: true },
      { id: 'openverse', nazwa: 'Openverse', wymagaKlucza: false, gotowa: true },
      { id: 'pexels', nazwa: 'Pexels', wymagaKlucza: true, gotowa: false },
    ]);
    expect(JSON.stringify(r)).not.toContain(KLUCZ_PIXABAY);
    expect(r.konta).toEqual([
      { wpis: 'jan@przyklad.pl', email: 'Jan@Przyklad.pl', istnieje: true },
      { wpis: 'nikt@przyklad.pl', email: null, istnieje: false },
    ]);
    expect(r.kluczAnthropic).toBe(true);
    expect(r.regulamin).toEqual({ wersja: '1.2.0', wymieniaKreator: false });
    expect(r.miesiac).toMatchObject({ generacje: 4, zmiany: 31, kosztUsd: 1.2345 });
  });

  it('ostrzeżenie o Regulaminie znika, gdy obowiązująca wersja opisuje Verris Kreator; brak Regulaminu = ostrzeżenie', async () => {
    expect((await stanowisko({}, [], '§1 pkt 6 … Verris Kreator (§13a)').c.konfiguracja()).regulamin).toEqual({ wersja: '1.2.0', wymieniaKreator: true });
    expect((await stanowisko({}, [], null).c.konfiguracja()).regulamin).toEqual({ wersja: null, wymieniaKreator: false });
  });

  it('zapis: włączenie, modele i kolejność bibliotek → ustawienie platformy + wpis w dzienniku', async () => {
    const { c, prisma, audit, zapisana } = stanowisko({ kontaTestowe: ['a@b.pl'] });
    await c.zapisz({ wlaczony: true, modelGeneracji: 'claude-opus-5-5', modelZmian: 'claude-haiku-4-5-20251001', bibliotekiZdjec: ['openverse', 'pixabay'] }, ADMIN);
    expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: KLUCZ_KONFIGURACJI_KREATORA } }));
    expect(zapisana()).toEqual({ wlaczony: true, modelGeneracji: 'claude-opus-5-5', modelZmian: 'claude-haiku-4-5-20251001', bibliotekiZdjec: ['openverse', 'pixabay'], kontaTestowe: ['a@b.pl'] });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ADMIN_AI_SETTINGS_UPDATED', actorUserId: 'admin-1', details: { kreator: expect.objectContaining({ wlaczony: true, kontaTestowe: 1 }) } }));
  });

  it('zapis: model spoza listy (także claude-… bez ceny) → 400 po polsku, bez zapisu', async () => {
    const { c, prisma } = stanowisko();
    await expect(c.zapisz({ modelGeneracji: 'claude-wymyslony-9' }, ADMIN)).rejects.toThrow(new BadRequestException(BLAD_MODELU));
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });
});

describe('KreatorAdminController – konta testowe', () => {
  it('dodanie istniejącego konta po e-mailu (wielkość liter bez znaczenia) → małymi literami na liście', async () => {
    const { c, zapisana, audit } = stanowisko({}, [{ id: 'u-ola', email: 'ola@przyklad.pl' }]);
    const r = await c.dodajKonto({ email: ' Ola@Przyklad.PL ' }, ADMIN);
    expect(zapisana().kontaTestowe).toEqual(['ola@przyklad.pl']);
    expect(r.konta).toEqual([{ wpis: 'ola@przyklad.pl', email: 'ola@przyklad.pl', istnieje: true }]);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ details: { kreator: expect.objectContaining({ kontoTestoweDodane: 'u-ola' }) } }));
  });

  it('nieistniejące konto → 404 z komunikatem, lista bez zmian', async () => {
    const { c, prisma } = stanowisko();
    await expect(c.dodajKonto({ email: 'nikt@przyklad.pl' }, ADMIN)).rejects.toThrow(NotFoundException);
    await expect(c.dodajKonto({ email: 'nikt@przyklad.pl' }, ADMIN)).rejects.toThrow('Nie ma konta z adresem nikt@przyklad.pl');
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it('konto już na liście (po e-mailu albo identyfikatorze) → 409', async () => {
    const u = [{ id: 'u-ola', email: 'ola@przyklad.pl' }];
    await expect(stanowisko({ kontaTestowe: ['ola@przyklad.pl'] }, u).c.dodajKonto({ email: 'ola@przyklad.pl' }, ADMIN)).rejects.toThrow(ConflictException);
    await expect(stanowisko({ kontaTestowe: ['u-ola'] }, u).c.dodajKonto({ email: 'ola@przyklad.pl' }, ADMIN)).rejects.toThrow(ConflictException);
  });

  it('usunięcie wpisu; nieznany wpis → 404', async () => {
    const { c, zapisana } = stanowisko({ kontaTestowe: ['a@b.pl', 'c@d.pl'] });
    await c.usunKonto('A@B.pl', ADMIN);
    expect(zapisana().kontaTestowe).toEqual(['c@d.pl']);
    await expect(c.usunKonto('x@y.pl', ADMIN)).rejects.toThrow(NotFoundException);
  });

  it('DTO: zły adres e-mail → komunikat po polsku', () => {
    const bledy = validateSync(plainToInstance(KontoTestoweDto, { email: 'nie-email' }), { whitelist: true, forbidNonWhitelisted: true });
    expect(bledy.flatMap((e) => Object.values(e.constraints ?? {}))).toContain('Podaj poprawny adres e-mail konta klienta.');
  });
});

describe('Podsumowanie miesiąca', () => {
  it('rozbicie kosztu cache (Sonnet 5.5: wej. 2 USD, wyj. 10 USD / 1 mln; zapis 1 h × 2, odczyt × 0,05)', () => {
    const u = { wej: 1000, wyj: 500, zapis5m: 0, zapis1h: 10_000, odczyt: 40_000 };
    const r = rozbicieKosztow([{ model: 'claude-sonnet-5-5', wywolania: 5, ...u, kosztUsd: 0.05 }], ceny);
    expect(r.wejscieUsd).toBeCloseTo(0.002, 9);
    expect(r.wyjscieUsd).toBeCloseTo(0.005, 9);
    expect(r.cacheZapisUsd).toBeCloseTo(0.04, 9);
    expect(r.cacheOdczytUsd).toBeCloseTo(0.004, 9);
    expect(r.razemUsd).toBeCloseTo(0.051, 9);
    // Ta sama suma co koszt liczony przy wywołaniu.
    expect(r.razemUsd).toBeCloseTo(kosztZCacheUsd(DOMYSLNA_KONFIGURACJA_AI, 'claude-sonnet-5-5', u), 9);
    // Bez cache: 50 000 tokenów × 2 USD = 0,10; oszczędność 0,10 − (0,04 + 0,004).
    expect(r.bezCacheUsd).toBeCloseTo(0.1, 9);
    expect(r.oszczednoscUsd).toBeCloseTo(0.056, 9);
    expect(r.zapisanyUsd).toBeCloseTo(0.05, 9);
    expect(r.wywolania).toBe(5);
  });

  it('zapis 5 min × 1,25; mnożnik odczytu zależy od modelu; sam zapis bez odczytów = oszczędność ujemna', () => {
    const r = rozbicieKosztow(
      [
        { model: 'claude-haiku-4-5-20251001', wywolania: 1, wej: 0, wyj: 0, zapis5m: 100_000, zapis1h: 0, odczyt: 0, kosztUsd: 0 },
        { model: 'claude-haiku-4-5-20251001', wywolania: 1, wej: 0, wyj: 0, zapis5m: 0, zapis1h: 0, odczyt: 100_000, kosztUsd: 0 },
      ],
      ceny,
    );
    expect(r.cacheZapisUsd).toBeCloseTo(0.125, 9); // 100k × 1,25 × 1 USD
    expect(r.cacheOdczytUsd).toBeCloseTo(0.01, 9); // 100k × 0,1 × 1 USD
    expect(r.oszczednoscUsd).toBeCloseTo(0.2 - 0.135, 9);
    expect(rozbicieKosztow([{ model: 'claude-haiku-4-5-20251001', wywolania: 1, wej: 0, wyj: 0, zapis5m: 100_000, zapis1h: 0, odczyt: 0, kosztUsd: 0 }], ceny).oszczednoscUsd).toBeCloseTo(-0.025, 9);
  });

  it('przychód Kreatora Pro: rok / 12, netto jak na fakturze (23%)', () => {
    const p = przychodPro([
      { priceAmount: '9.90', interval: 'MONTH' },
      { priceAmount: '9.90', interval: 'MONTH' },
      { priceAmount: '99.00', interval: 'YEAR' },
    ]);
    expect(p).toEqual({ aktywne: 3, miesieczne: 2, roczne: 1, miesiecznieBrutto: 28.05, miesiecznieNetto: 22.81 });
  });

  it('30 dni bez dziur (UTC), dni bez wywołań = 0', () => {
    const d = uzupelnijDni([{ dzien: '2026-11-07', wywolania: 2, generacje: 1, zmiany: 1, kosztUsd: 0.5 }], new Date('2026-11-08T23:30:00Z'));
    expect(d).toHaveLength(30);
    expect(d[0].dzien).toBe('2026-10-10');
    expect(d[29]).toEqual({ dzien: '2026-11-08', wywolania: 0, generacje: 0, zmiany: 0, kosztUsd: 0 });
    expect(d[28]).toMatchObject({ dzien: '2026-11-07', wywolania: 2 });
  });

  it('GET podsumowanie: liczby, koszt z cache, Pro, magazyn i błędy bez treści stron (opis skrócony)', async () => {
    const { c } = stanowisko();
    const r = await c.podsumowanie();
    expect(r.konta).toEqual({ zeStronami: 4, aktywneWMiesiacu: 3 });
    expect(r.strony).toEqual({ razem: 7, opublikowane: 2, generowane: 1, bledne: 1 });
    expect(r).toMatchObject({ generacje: 4, zmiany: 31 });
    expect(r.koszt).toMatchObject({ cacheZapisUsd: 0.04, cacheOdczytUsd: 0.004, razemUsd: 0.051, oszczednoscUsd: 0.056 });
    expect(r.pro).toEqual({ aktywne: 2, miesieczne: 1, roczne: 1, miesiecznieBrutto: 18.15, miesiecznieNetto: 14.76 });
    expect(r.magazyn).toEqual({ zdjecia: 12, bajty: 3_500_000 });
    expect(r.dni).toHaveLength(30);
    expect(r.bledy).toHaveLength(1);
    expect(r.bledy[0]).toMatchObject({ id: 's1', email: 'jan@przyklad.pl', at: '2026-11-08T10:00:00.000Z' });
    expect(r.bledy[0].opis.length).toBeLessThanOrEqual(160);
    expect(r.bledy[0].opis.endsWith('…')).toBe(true);
    expect(Object.keys(r.bledy[0]).sort()).toEqual(['at', 'email', 'id', 'opis']);
  });
});
