import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { DOMYSLNA_KONFIGURACJA_AI } from '../ai/ai-modele.js';
import { BLAD_MODELU_MARKI, KreatorMarkiAdminController } from './kreator-marki.admin.controller.js';
import { OfertaMarkiController } from './oferta-marki.controller.js';
import { KonfiguracjaMarkiService } from './konfiguracja-marki.service.js';
import { DOMYSLNA_KONFIGURACJA_MARKI, KLUCZ_KONFIGURACJI_MARKI, type KonfiguracjaMarki } from './konfiguracja-marki.js';
import { KonfiguracjaMarkiDto } from './dto/konfiguracja-marki.dto.js';

/**
 * Paczka 130 – Admin → Kreator marki: konfiguracja modułu (ustawienie platformy `kreator-marki.konfiguracja`),
 * konta testowe, ostrzeżenia o dokumentach prawnych, ceny brutto i netto, publiczna oferta dla verris.pl.
 * Na starym kodzie czerwony: kontrolerów i serwisu nie było.
 */

type Dok = string | null;

function stanowisko(konf: Partial<KonfiguracjaMarki> = {}, opcje: { uzytkownicy?: { id: string; email: string }[]; regulamin?: Dok; polityka?: Dok; tester?: boolean } = {}) {
  let zapisana: string | null = Object.keys(konf).length ? JSON.stringify({ ...DOMYSLNA_KONFIGURACJA_MARKI, ...konf }) : null;
  const uzytkownicy = opcje.uzytkownicy ?? [];
  const prisma = {
    platformSetting: {
      findUnique: vi.fn(async () => (zapisana === null ? null : { value: zapisana })),
      upsert: vi.fn(async ({ create }: { create: { value: string } }) => {
        zapisana = create.value;
        return {};
      }),
    },
    user: {
      findFirst: vi.fn(async ({ where }: { where: { email: { equals: string } } }) => {
        const u = uzytkownicy.find((x) => x.email.toLowerCase() === where.email.equals.toLowerCase());
        return u ? { id: u.id } : null;
      }),
      findMany: vi.fn(async () => uzytkownicy),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const u = uzytkownicy.find((x) => x.id === where.id);
        return u ? { email: u.email } : null;
      }),
    },
    promoRedemption: { count: vi.fn(async () => (opcje.tester ? 1 : 0)) },
    legalDocument: {
      findFirst: vi.fn(async ({ where }: { where: { kind: string } }) => {
        const tresc = where.kind === 'TERMS' ? opcje.regulamin : opcje.polityka;
        return tresc === null || tresc === undefined ? null : { version: '1.3.0', contentMarkdown: tresc };
      }),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const provider = { konfiguracja: vi.fn(async () => ({ ...DOMYSLNA_KONFIGURACJA_AI })), klucz: vi.fn(() => 'sk-ant') };
  const serwis = new KonfiguracjaMarkiService(prisma as never, audit as never);
  const c = new KreatorMarkiAdminController(prisma as never, provider as never, serwis);
  const zapis = (): KonfiguracjaMarki => JSON.parse(zapisana!) as KonfiguracjaMarki;
  return { c, serwis, prisma, audit, zapis, oferta: new OfertaMarkiController(serwis) };
}

const ADMIN = { userId: 'admin-1' };

describe('KreatorMarkiAdminController – strażnik', () => {
  const kontekst = (handler: unknown, role: string) =>
    ({
      getHandler: () => handler,
      getClass: () => KreatorMarkiAdminController,
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u1', role } }) }),
    }) as never;

  it.each(['konfiguracja', 'zapisz', 'dodajKonto', 'usunKonto'] as const)('%s: tylko ADMIN (STAFF i klient → 403)', (m) => {
    const g = new RolesGuard(new Reflector());
    const h = KreatorMarkiAdminController.prototype[m];
    expect(g.canActivate(kontekst(h, 'ADMIN'))).toBe(true);
    expect(g.canActivate(kontekst(h, 'STAFF'))).toBe(false);
    expect(g.canActivate(kontekst(h, 'USER'))).toBe(false);
  });
});

describe('KreatorMarkiAdminController – konfiguracja', () => {
  it('odczyt bez zapisu: wartości domyślne, ceny brutto i netto, modele Anthropic, użycie „brak danych”', async () => {
    const r = await stanowisko().c.konfiguracja();
    expect(r.konfiguracja).toEqual(DOMYSLNA_KONFIGURACJA_MARKI);
    expect(r.ceny).toEqual({ pakiet: { brutto: 149, netto: 121.14 }, drugaMarka: { brutto: 49, netto: 39.84 } });
    expect(r.modele.length).toBeGreaterThan(0);
    expect(r.modele.every((m) => m.model.startsWith('claude-'))).toBe(true);
    expect(r.kluczAnthropic).toBe(true);
    expect(r.uzycie).toMatchObject({ zrodlo: 'brak-danych', marki: 0, pakiety: 0 });
    expect(r.uzycie.miesiac).toMatch(/^\d{4}-\d{2}$/);
  });

  it('dokumenty: ostrzeżenie, dopóki obowiązujący Regulamin i Polityka nie wymieniają Kreatora marki', async () => {
    const bez = await stanowisko({}, { regulamin: 'Regulamin – Verris Kreator (§13a)', polityka: null }).c.konfiguracja();
    expect(bez.dokumenty).toEqual({ regulamin: { wersja: '1.3.0', wymieniaKreatorMarki: false }, polityka: { wersja: null, wymieniaKreatorMarki: false } });
    const z = await stanowisko({}, { regulamin: '§13b. Kreator marki i Pakiet marki', polityka: '2.13 Kreatorze marki' }).c.konfiguracja();
    expect(z.dokumenty.regulamin.wymieniaKreatorMarki).toBe(true);
    expect(z.dokumenty.polityka.wymieniaKreatorMarki).toBe(true);
  });

  it('zapis scala pola (cena Pakietu nie zeruje limitów), nie rusza listy kont, zapisuje audyt bez e-maili', async () => {
    const { c, prisma, audit, zapis } = stanowisko({ kontaTestowe: ['tajny@przyklad.pl'] });
    const r = await c.zapisz(
      { wlaczony: true, dostepnosc: 'beta', pakiet: { cenaBrutto: 199 }, wCenieHostingu: { zmianAiMies: 80 }, modelZmian: 'claude-haiku-4-5-20251001', ...({ kontaTestowe: [] } as object) },
      ADMIN,
    );
    expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: KLUCZ_KONFIGURACJI_MARKI } }));
    expect(zapis()).toEqual({
      ...DOMYSLNA_KONFIGURACJA_MARKI,
      wlaczony: true,
      dostepnosc: 'beta',
      kontaTestowe: ['tajny@przyklad.pl'],
      pakiet: { ...DOMYSLNA_KONFIGURACJA_MARKI.pakiet, cenaBrutto: 199 },
      wCenieHostingu: { ...DOMYSLNA_KONFIGURACJA_MARKI.wCenieHostingu, zmianAiMies: 80 },
      modelZmian: 'claude-haiku-4-5-20251001',
    });
    expect(r.ceny.pakiet).toEqual({ brutto: 199, netto: 161.79 });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_AI_SETTINGS_UPDATED', actorUserId: 'admin-1', details: { kreatorMarki: expect.objectContaining({ wlaczony: true, kontaTestowe: 1 }) } }),
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('tajny@przyklad.pl');
  });

  it('zapis: model spoza listy → 400 po polsku, bez zapisu', async () => {
    const { c, prisma } = stanowisko();
    await expect(c.zapisz({ modelGeneracji: 'claude-wymyslony-9' }, ADMIN)).rejects.toThrow(new BadRequestException(BLAD_MODELU_MARKI));
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
  });

  it('DTO: zakresy liczb, grosze w cenie, dostępność, tylko modele claude-, bez obcych pól – komunikaty po polsku', () => {
    const opcje = { whitelist: true, forbidNonWhitelisted: true };
    const bledy = JSON.stringify(
      validateSync(
        plainToInstance(KonfiguracjaMarkiDto, {
          dostepnosc: 'vip',
          pakiet: { cenaBrutto: 149.999, serie: -1 },
          wCenieHostingu: { marek: 1.5 },
          drugaMarka: { cenaBrutto: 20_000 },
          modelGeneracji: 'gpt-6',
          maksRozmiarWgraniaMb: 100,
          kontaTestowe: ['x@y.pl'],
        }),
        opcje,
      ),
    );
    for (const t of [
      'Dostępność: lista kont, beta albo wszyscy.',
      'Cena brutto: od 0 do 10000 zł, najwyżej 2 miejsca po przecinku.',
      'Serie w Pakiecie: liczba całkowita od 0 do 500.',
      'Marki na koncie: liczba całkowita od 0 do 20.',
      'Kreator marki obsługuje tylko modele Anthropic',
      'Maks. rozmiar wgrania (MB): liczba całkowita od 1 do 25.',
      'kontaTestowe',
    ])
      expect(bledy).toContain(t);
    expect(
      validateSync(plainToInstance(KonfiguracjaMarkiDto, { wlaczony: true, dostepnosc: 'wszyscy', pakiet: { cenaBrutto: 149, serie: 10 }, drugaMarka: { cenaBrutto: 49.5 }, maksRozmiarWgraniaMb: 10 }), opcje),
    ).toEqual([]);
  });
});

describe('KreatorMarkiAdminController – konta testowe', () => {
  it('dodanie istniejącego konta po e-mailu; nieistniejące → 404; duplikat → 409; usunięcie', async () => {
    const { c, zapis, prisma } = stanowisko({}, { uzytkownicy: [{ id: 'u-ola', email: 'ola@przyklad.pl' }] });
    const r = await c.dodajKonto({ email: ' Ola@Przyklad.PL ' }, ADMIN);
    expect(zapis().kontaTestowe).toEqual(['ola@przyklad.pl']);
    expect(r.konta).toEqual([{ wpis: 'ola@przyklad.pl', email: 'ola@przyklad.pl', istnieje: true }]);
    await expect(c.dodajKonto({ email: 'ola@przyklad.pl' }, ADMIN)).rejects.toThrow(ConflictException);
    prisma.platformSetting.upsert.mockClear();
    await expect(c.dodajKonto({ email: 'nikt@przyklad.pl' }, ADMIN)).rejects.toThrow(NotFoundException);
    expect(prisma.platformSetting.upsert).not.toHaveBeenCalled();
    await c.usunKonto('OLA@przyklad.pl', ADMIN);
    expect(zapis().kontaTestowe).toEqual([]);
    await expect(c.usunKonto('x@y.pl', ADMIN)).rejects.toThrow(NotFoundException);
  });
});

describe('KonfiguracjaMarkiService.dostep', () => {
  const u = [{ id: 'u1', email: 'jan@przyklad.pl' }];
  it('domyślnie nikt; konto z listy zawsze; beta – tylko tester z zaproszenia; wszyscy – każdy', async () => {
    expect(await stanowisko({}, { uzytkownicy: u, tester: true }).serwis.dostep('u1')).toBe(false);
    expect(await stanowisko({ kontaTestowe: ['jan@przyklad.pl'] }, { uzytkownicy: u }).serwis.dostep('u1')).toBe(true);
    expect(await stanowisko({ wlaczony: true, dostepnosc: 'beta' }, { uzytkownicy: u, tester: true }).serwis.dostep('u1')).toBe(true);
    expect(await stanowisko({ wlaczony: true, dostepnosc: 'beta' }, { uzytkownicy: u, tester: false }).serwis.dostep('u1')).toBe(false);
    expect(await stanowisko({ wlaczony: true, dostepnosc: 'lista' }, { uzytkownicy: u, tester: true }).serwis.dostep('u1')).toBe(false);
    expect(await stanowisko({ wlaczony: true, dostepnosc: 'wszyscy' }, { uzytkownicy: u }).serwis.dostep('u1')).toBe(true);
  });
});

describe('OfertaMarkiController – GET /public/oferta/kreator-marki', () => {
  it('moduł wyłączony albo nie dla wszystkich → tylko { dostepny: false }', async () => {
    expect(await stanowisko().oferta.kreatorMarki()).toEqual({ dostepny: false });
    expect(await stanowisko({ wlaczony: true, dostepnosc: 'beta' }).oferta.kreatorMarki()).toEqual({ dostepny: false });
  });

  it('włączony dla wszystkich → limity i ceny z ustawień (brutto i netto), bez listy kont', async () => {
    const r = await stanowisko({ wlaczony: true, dostepnosc: 'wszyscy', kontaTestowe: ['tajny@przyklad.pl'], pakiet: { ...DOMYSLNA_KONFIGURACJA_MARKI.pakiet, cenaBrutto: 99 } }).oferta.kreatorMarki();
    expect(r).toMatchObject({ dostepny: true, pakiet: { brutto: 99, netto: 80.49, serie: 10 }, drugaMarka: { brutto: 49, netto: 39.84 } });
    expect(JSON.stringify(r)).not.toContain('tajny');
  });
});
