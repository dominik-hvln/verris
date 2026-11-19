import { HttpException } from '@nestjs/common';
import { rysujSygnet, type Sygnet } from '@verris/kreator';
import { KreatorMarkiService, odciskZnaku, PROG_PODOBIENSTWA, zbytPodobny, znakZOdcisku } from './kreator-marki.service.js';
import { DOMYSLNA_KONFIGURACJA_MARKI } from './konfiguracja-marki.js';
import { StopkaEmailInstrukcja } from './stopka-email.js';
import { napisTestowy } from './test-marka.js';
import { sprawdzTokenMarki, utworzTokenMarki } from './token-marki.js';

/**
 * Paczka 131 – KreatorMarkiService z atrapą AI i bazy: jedna runda naprawy odpowiedzi (nie po max_tokens), zwrot limitu
 * przy błędzie AI, blokada nazw znanych marek przed wywołaniem AI, rejestr znaków (odcisk, podobieństwo), token plików
 * publicznych. Na starym kodzie czerwone: serwisu nie było.
 */

const MARKA_ID = '11111111-2222-4333-8444-555555555555';
const BRIEF = { nazwa: 'Łódka i Wiosło', branza: 'Turystyka', opis: 'Spływy kajakowe.', rodzaj: 'znak-i-napis', cechy: [], barwyLubiane: [], barwyOdrzucone: [] };

function stanowisko(odpowiedzi: { wynik: string; powodKonca?: string }[]) {
  const wywolania: unknown[] = [];
  const provider = {
    anthropicZBlokami: vi.fn(async (we: unknown) => {
      wywolania.push(we);
      const o = odpowiedzi.shift() ?? { wynik: '{}' };
      return { wynik: o.wynik, dostawca: 'anthropic', model: 'm', wej: 10, wyj: 10, zapis5m: 0, zapis1h: 0, odczyt: 0, kosztUsd: 0.001, powodKonca: o.powodKonca ?? 'end_turn' };
    }),
  };
  const zwolnienia: unknown[] = [];
  const prisma = {
    subscription: { findMany: vi.fn(async () => [{ isTrial: false, trialConvertedAt: null, status: 'ACTIVE', plan: { productKind: 'HOSTING' } }]), count: vi.fn(async () => 0) },
    kreatorMarka: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
        where.id === MARKA_ID && where.userId === 'u1'
          ? { id: MARKA_ID, userId: 'u1', nazwa: BRIEF.nazwa, zrodlo: 'nowa', etap: 'brief', wersja: 1, dane: { brief: BRIEF, marka: null, zgody: {} }, createdAt: new Date(), updatedAt: new Date() }
          : null,
      ),
      count: vi.fn(async () => 1),
      update: vi.fn(async ({ data }: { data: unknown }) => ({ id: MARKA_ID, userId: 'u1', nazwa: BRIEF.nazwa, zrodlo: 'nowa', etap: 'brief', wersja: 1, dane: (data as { dane: unknown }).dane, createdAt: new Date(), updatedAt: new Date() })),
    },
    kreatorMarkaSeria: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    kreatorMarkaZuzycie: {
      upsert: vi.fn(async () => ({})),
      updateMany: vi.fn(async (a: { data: Record<string, { increment?: number; decrement?: number }> }) => {
        if (Object.values(a.data).some((v) => v.decrement)) zwolnienia.push(a);
        return { count: 1 };
      }),
      update: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => null),
    },
    kreatorMarkaZakup: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    $queryRaw: vi.fn(async () => []),
  };
  const konfiguracja = { dostep: vi.fn(async () => true), konfiguracja: vi.fn(async () => ({ ...DOMYSLNA_KONFIGURACJA_MARKI, modelZmian: 'claude-tani', modelGeneracji: 'claude-glowny' })) };
  const audit = { record: vi.fn(async () => undefined) };
  const svc = new KreatorMarkiService(prisma as never, provider as never, konfiguracja as never, napisTestowy(), {} as never, audit as never, {} as never, { get: () => undefined } as never, new StopkaEmailInstrukcja());
  return { svc, provider, wywolania, zwolnienia, prisma, konfiguracja };
}

const KTO = { userId: 'u1', actorUserId: 'osoba-1' };
const status = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  return e instanceof HttpException ? { status: e.getStatus(), kod: (e.getResponse() as { kod?: string }).kod } : e;
};

describe('KreatorMarkiService – AI z atrapą', () => {
  it('jedna runda naprawy po błędzie walidacji: tańszy model zmian, wynik z drugiej odpowiedzi', async () => {
    const s = stanowisko([{ wynik: 'to nie JSON' }, { wynik: JSON.stringify({ t: ['Na wodzie od rana', 'Spływy dla rodzin', 'Kajak i cisza'] }) }]);
    const r = await s.svc.drobnaZmiana(KTO, MARKA_ID, { rodzaj: 'haslo' });
    expect(r.wynik).toEqual({ 1: 'Na wodzie od rana', 2: 'Spływy dla rodzin', 3: 'Kajak i cisza' });
    expect(s.provider.anthropicZBlokami).toHaveBeenCalledTimes(2);
    const [pierwsze, drugie] = s.wywolania as { model: string; wiadomosci: unknown[]; funkcja: string; actorUserId: string }[];
    expect(pierwsze).toMatchObject({ model: 'claude-tani', funkcja: 'kreator-marki', actorUserId: 'osoba-1' });
    expect(drugie!.wiadomosci).toHaveLength(3);
    expect(s.zwolnienia).toHaveLength(0);
  });

  it('odpowiedź ucięta (max_tokens) – bez naprawy, 503 i zwrot zmiany AI do limitu', async () => {
    const s = stanowisko([{ wynik: '{"t":["Na wod', powodKonca: 'max_tokens' }]);
    expect(await status(s.svc.drobnaZmiana(KTO, MARKA_ID, { rodzaj: 'haslo' }))).toEqual({ status: 503, kod: 'AI_NIEDOSTEPNE' });
    expect(s.provider.anthropicZBlokami).toHaveBeenCalledTimes(1);
    expect(s.zwolnienia).toHaveLength(1);
  });

  it('polecenie „w stylu znanej marki” – 422 bez wywołania AI i bez zużycia limitu', async () => {
    const s = stanowisko([]);
    expect(await status(s.svc.drobnaZmiana(KTO, MARKA_ID, { rodzaj: 'haslo', polecenie: 'zrób jak logo Nike' }))).toEqual({ status: 422, kod: 'ZNANA_MARKA' });
    expect(s.provider.anthropicZBlokami).not.toHaveBeenCalled();
    expect(s.prisma.kreatorMarkaZuzycie.updateMany).not.toHaveBeenCalled();
  });

  it('IDOR i moduł: cudza marka 404, moduł wyłączony 403 MODUL_NIEDOSTEPNY', async () => {
    const s = stanowisko([]);
    expect(await status(s.svc.drobnaZmiana({ userId: 'u2', actorUserId: 'u2' }, MARKA_ID, { rodzaj: 'haslo' }))).toMatchObject({ status: 404 });
    s.konfiguracja.dostep.mockResolvedValueOnce(false);
    expect(await status(s.svc.pobierz('u1', MARKA_ID))).toEqual({ status: 403, kod: 'MODUL_NIEDOSTEPNY' });
  });
});

describe('rejestr wydanych znaków', () => {
  const s1: Sygnet = { typ: 'biblioteka', rodzina: 'kolumna-litera', parametry: { zlobki: 3 }, litery: 'K', ziarno: 0 };
  const s2: Sygnet = { typ: 'biblioteka', rodzina: 'kreg-fala', parametry: {}, ziarno: 0 };

  it('odcisk: rodzina, parametry i pHash; marka bez znaku – brak odcisku', () => {
    const o = odciskZnaku(s1, 'Kolumna')!;
    expect(o.rodzina).toBe('kolumna-litera');
    expect(o.odciskParametrow).toMatch(/^kolumna-litera\|/);
    expect(o.pHash).toMatch(/^[0-9a-f]{16}$/);
    expect(odciskZnaku({ typ: 'brak' }, 'X')).toBeNull();
    expect(rysujSygnet(s2)).not.toBe('');
  });

  it('zbyt podobny: ten sam przepis albo pHash ≥ progu; inny znak – nie', () => {
    const a = odciskZnaku(s1, 'Kolumna')!;
    const b = odciskZnaku(s2, 'Kolumna')!;
    expect(zbytPodobny(a, [{ odciskParametrow: a.odciskParametrow, pHash: '0000000000000000' }])).toBe(true);
    expect(zbytPodobny(a, [{ odciskParametrow: null, pHash: a.pHash }])).toBe(true);
    expect(zbytPodobny(a, [{ odciskParametrow: b.odciskParametrow, pHash: b.pHash }])).toBe(false);
    expect(zbytPodobny(null, [{ odciskParametrow: null, pHash: a.pHash }])).toBe(false);
    expect(PROG_PODOBIENSTWA).toBeGreaterThan(0.85);
  });

  it('znak z odcisku do preselekcji: parametry odtworzone ze środka przedziału', () => {
    const z = znakZOdcisku('kolumna-litera', odciskZnaku(s1, 'Kolumna')!.odciskParametrow);
    expect(z.rodzina).toBe('kolumna-litera');
    expect(Object.keys(z.parametry ?? {}).length).toBeGreaterThan(0);
    expect(znakZOdcisku('nieznana', 'x|a=1|')).toEqual({ rodzina: 'nieznana' });
  });
});

describe('token plików publicznych', () => {
  it('podpis HMAC z kluczem aplikacji, zmiana znaku albo klucza = brak', () => {
    const t = utworzTokenMarki('k'.repeat(64), MARKA_ID);
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(sprawdzTokenMarki('k'.repeat(64), t)).toBe(MARKA_ID);
    expect(sprawdzTokenMarki('x'.repeat(64), t)).toBeNull();
    expect(sprawdzTokenMarki('k'.repeat(64), `${t.slice(0, -1)}${t.endsWith('0') ? '1' : '0'}`)).toBeNull();
    expect(sprawdzTokenMarki('k'.repeat(64), '../../etc')).toBeNull();
  });
});
