import { ConflictException, ForbiddenException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';
import { PLANY_KREATORA, PRZYKLAD_SALON, type WersjaKreatora } from '@verris/kreator';
import { DOMYSLNA_KONFIGURACJA_KREATORA, FUNKCJA_AI_OBRAZU, type KonfiguracjaKreatora } from '../konfiguracja.js';
import { KreatorZasobyService, AUTOR_AI, LICENCJA_AI } from '../zasoby.service.js';
import { BibliotekaZdjec } from '../biblioteka/biblioteka.js';
import { KreatorObrazyAiService, WKROTCE, obrazPodSciezka } from './obrazy-ai.service.js';
import { BladGeneratora, KOMUNIKATY_GENERATORA, type GeneratorObrazow, type ZlecenieObrazow } from './generator.js';
import { STALE_ZAKAZY } from './prompt-obrazu.js';

/**
 * Paczka 124 – zdjęcia AI: włącznik i klucz („wkrótce”), limity per wersja (rezerwacja przed kosztem, zwrot przy
 * błędzie, moderacja zużywa limit), odmowa promptu po polsku, koszt w dzienniku AI, import wyniku jako zasób konta
 * (źródło AI, autor, licencja, alt, XMP „trainedAlgorithmicMedia”).
 */
const JA = 'user-ja';
const STRONA = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';

type Zasob = Record<string, unknown> & { id: string; userId: string; bajty: number; sha256: string };

function srodowisko(o: {
  wersja?: WersjaKreatora;
  konf?: Partial<KonfiguracjaKreatora['obrazyAi']>;
  zuzyte?: number;
  odpowiedzAi?: string;
  generator?: (z: ZlecenieObrazow) => Promise<{ obrazy: { dane: Buffer }[]; rozliczone: number; moderowane: number }>;
  budzet?: boolean;
  maKlucz?: boolean;
} = {}) {
  const wersja = o.wersja ?? 'hosting';
  const konf: KonfiguracjaKreatora = { ...DOMYSLNA_KONFIGURACJA_KREATORA, obrazyAi: { ...DOMYSLNA_KONFIGURACJA_KREATORA.obrazyAi, wlaczone: true, ...o.konf } };
  const zuzycie = { obrazyAi: o.zuzyte ?? 0 };
  const zasoby: Zasob[] = [];
  const logi: Record<string, unknown>[] = [];
  const obiekty = new Map<string, Buffer>();
  const prisma = {
    kreatorZuzycie: {
      upsert: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => ({ ...zuzycie })),
      updateMany: vi.fn(async ({ where, data }: { where: { obrazyAi: { lte?: number; gte?: number } }; data: { obrazyAi: { increment?: number; decrement?: number } } }) => {
        if (where.obrazyAi.lte !== undefined && zuzycie.obrazyAi > where.obrazyAi.lte) return { count: 0 };
        if (where.obrazyAi.gte !== undefined && zuzycie.obrazyAi < where.obrazyAi.gte) return { count: 0 };
        zuzycie.obrazyAi += (data.obrazyAi.increment ?? 0) - (data.obrazyAi.decrement ?? 0);
        return { count: 1 };
      }),
    },
    kreatorStrona: { findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => (where.id === STRONA && where.userId === JA ? { id: STRONA, model: PRZYKLAD_SALON } : null)) },
    kreatorZasob: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string; sha256: string } }) => zasoby.find((z) => z.userId === where.userId && z.sha256 === where.sha256) ?? null),
      aggregate: vi.fn(async () => ({ _sum: { bajty: zasoby.reduce((a, z) => a + z.bajty, 0) } })),
      create: vi.fn(async ({ data }: { data: Zasob }) => {
        const z = { ...data, createdAt: new Date() };
        zasoby.push(z);
        return z;
      }),
    },
    aiInteractionLog: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => void logi.push(data)) },
  };
  const provider = {
    budzetPlatformyWyczerpanyTeraz: vi.fn(async () => o.budzet ?? false),
    anthropicZBlokami: vi.fn(async () => ({
      wynik: o.odpowiedzAi ?? '{"ok":true,"prompt":"Bright hair salon interior with plants, soft daylight","alt":"Jasne wnętrze salonu z roślinami"}',
      wej: 300, wyj: 80, zapis5m: 0, zapis1h: 0, odczyt: 0, kosztUsd: 0.0014,
    })),
  };
  const kreator = {
    dostep: vi.fn(async () => ({ dostep: true, wersja, konf })),
    konfiguracja: vi.fn(async () => konf),
    dolicz: vi.fn(async () => undefined),
  };
  const storage = { putObject: vi.fn(async (_b: string, k: string, d: Buffer) => void obiekty.set(k, d)), removeObject: vi.fn(async () => undefined) };
  const config = { get: (k: string) => (k === 'appKmsKey' ? 'k'.repeat(48) : k === 'PUBLIC_API_URL' ? 'https://api.verris.test' : undefined) };
  const zasobySvc = new KreatorZasobyService(prisma as never, config as never, storage as never, kreator as never, new BibliotekaZdjec([]));
  const zlecenia: ZlecenieObrazow[] = [];
  const generator: GeneratorObrazow = {
    nazwa: 'bfl',
    f: fetch,
    wlaczony: () => o.maKlucz ?? true,
    generuj: async (z) => {
      zlecenia.push(z);
      if (o.generator) return o.generator(z);
      const obrazy = await Promise.all(Array.from({ length: z.ile }, (_, i) => sharp({ create: { width: 1280, height: 960, channels: 3, background: `#3${i}6699` } }).jpeg().toBuffer()));
      return { obrazy: obrazy.map((dane) => ({ dane })), rozliczone: z.ile, moderowane: 0 };
    },
  };
  const s = new KreatorObrazyAiService(prisma as never, provider as never, kreator as never, zasobySvc, [generator]);
  return { s, zuzycie, zasoby, logi, obiekty, provider, kreator, zlecenia };
}

const DTO = { opis: 'Fryzjerka przy pracy w jasnym salonie', stronaId: STRONA, proporcje: '4:3' as const };

describe('KreatorObrazyAiService – dostępność', () => {
  it('bez klucza dostawcy albo z wyłącznikiem admina: stan „wkrótce”, generowanie 503 bez rezerwacji', async () => {
    for (const e of [srodowisko({ maKlucz: false }), srodowisko({ konf: { wlaczone: false } })]) {
      expect(await e.s.stan(JA)).toMatchObject({ dostepne: false, powod: WKROTCE, limit: 20, pozostalo: 20, warianty: 2 });
      await expect(e.s.generuj(JA, JA, DTO)).rejects.toThrow(new ServiceUnavailableException(WKROTCE));
      expect(e.zuzycie.obrazyAi).toBe(0);
      expect(e.provider.anthropicZBlokami).not.toHaveBeenCalled();
    }
  });

  it('budżet platformy wyczerpany → 503 przed promptem i bez rezerwacji', async () => {
    const e = srodowisko({ budzet: true });
    await expect(e.s.generuj(JA, JA, DTO)).rejects.toThrow(ServiceUnavailableException);
    expect(e.provider.anthropicZBlokami).not.toHaveBeenCalled();
    expect(e.zuzycie.obrazyAi).toBe(0);
  });
});

describe('KreatorObrazyAiService – limity per wersja', () => {
  it.each([
    ['proba', 1, 3],
    ['hosting', 2, 20],
    ['pro', 4, 100],
  ] as const)('%s: %i wariantów na generowanie, limit %i miesięcznie', async (wersja, warianty, limit) => {
    const e = srodowisko({ wersja });
    expect(await e.s.stan(JA)).toMatchObject({ dostepne: true, limit, warianty, pozostalo: limit });
    const w = await e.s.generuj(JA, JA, DTO);
    expect(w.zasoby).toHaveLength(warianty);
    expect(e.zlecenia[0]!.ile).toBe(warianty);
    expect(e.zuzycie.obrazyAi).toBe(warianty);
    expect(w).toMatchObject({ limit, pozostalo: limit - warianty });
    expect(PLANY_KREATORA[wersja].obrazowAiMies).toBe(limit);
  });

  it('końcówka limitu: zostało mniej niż warianty → tyle, ile zostało; wyczerpany → 403 po polsku bez kosztu', async () => {
    const e = srodowisko({ wersja: 'pro', zuzyte: 98 });
    const w = await e.s.generuj(JA, JA, DTO);
    expect(e.zlecenia[0]!.ile).toBe(2);
    expect(w.zasoby).toHaveLength(2);
    expect(e.zuzycie.obrazyAi).toBe(100);
    await expect(e.s.generuj(JA, JA, DTO)).rejects.toThrow(new ForbiddenException('Wykorzystano miesięczny limit zdjęć AI (100). Odnowi się 1. dnia miesiąca – do tego czasu wgraj zdjęcie albo wybierz je z biblioteki.'));
    expect(e.provider.anthropicZBlokami).toHaveBeenCalledTimes(1);
  });

  it('odmowa promptu (zasady) → 422 z komunikatem modelu, limit zwrócony, do dostawcy obrazów nic nie idzie', async () => {
    const e = srodowisko({ odpowiedzAi: '{"ok":false,"powod":"Nie generujemy zdjęć znanych osób – opisz anonimową osobę."}' });
    await expect(e.s.generuj(JA, JA, DTO)).rejects.toThrow(new UnprocessableEntityException('Nie generujemy zdjęć znanych osób – opisz anonimową osobę.'));
    expect(e.zlecenia).toHaveLength(0);
    expect(e.zuzycie.obrazyAi).toBe(0);
    expect(e.kreator.dolicz).toHaveBeenCalledWith(JA, expect.objectContaining({ wej: 300, wyj: 80, kosztUsd: 0.0014 }));
  });

  it('błąd dostawcy obrazów → 503, limit zwrócony, koszt zleceń przyjętych w dzienniku', async () => {
    const e = srodowisko({ generator: async () => Promise.reject(new BladGeneratora('czas', KOMUNIKATY_GENERATORA.czas, 'termin', 2)) });
    await expect(e.s.generuj(JA, JA, DTO)).rejects.toThrow(new ServiceUnavailableException(KOMUNIKATY_GENERATORA.czas));
    expect(e.zuzycie.obrazyAi).toBe(0);
    expect(e.logi).toEqual([expect.objectContaining({ feature: FUNKCJA_AI_OBRAZU, provider: 'bfl', status: 'FAILED', inputSummary: expect.objectContaining({ obrazy: 2, udane: 0 }) })]);
    expect(Number(e.logi[0]!.costUsd)).toBeCloseTo(0.08, 6);
  });

  it('moderacja dostawcy → 422 i limit ZUŻYTY (skutek opisu); częściowa moderacja → zasób tylko z udanych', async () => {
    const e = srodowisko({ generator: async () => Promise.reject(new BladGeneratora('moderacja', KOMUNIKATY_GENERATORA.moderacja, 'Content Moderated', 2)) });
    await expect(e.s.generuj(JA, JA, DTO)).rejects.toThrow(UnprocessableEntityException);
    expect(e.zuzycie.obrazyAi).toBe(2);

    const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#224466' } }).jpeg().toBuffer();
    const c = srodowisko({ wersja: 'pro', generator: async () => ({ obrazy: [{ dane: jpg }], rozliczone: 4, moderowane: 2 }) });
    const w = await c.s.generuj(JA, JA, DTO);
    expect(w.zasoby).toHaveLength(1);
    expect(w.moderowane).toBe(2);
    expect(c.zuzycie.obrazyAi).toBe(3); // 1 zapisane + 2 moderowane; 1 wariant (błąd) zwrócony
  });

  it('jedno generowanie naraz na konto → 409', async () => {
    let pusc!: () => void;
    const e = srodowisko({
      generator: async (z) => {
        await new Promise<void>((r) => (pusc = r));
        const dane = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#000' } }).jpeg().toBuffer();
        return { obrazy: [{ dane }], rozliczone: z.ile, moderowane: 0 };
      },
    });
    const pierwsze = e.s.generuj(JA, JA, DTO);
    await vi.waitFor(() => expect(e.zlecenia).toHaveLength(1));
    await expect(e.s.generuj(JA, JA, DTO)).rejects.toThrow(ConflictException);
    pusc();
    await expect(pierwsze).resolves.toMatchObject({ zasoby: [expect.anything()] });
  });
});

describe('KreatorObrazyAiService – wynik jako zasób', () => {
  it('prompt po angielsku ze stałymi zakazami do dostawcy; zasób: źródło AI, autor, licencja, alt z opisu, XMP trainedAlgorithmicMedia w plikach', async () => {
    const e = srodowisko();
    const w = await e.s.generuj(JA, 'czlowiek-1', { ...DTO, proporcje: undefined, sciezkaObrazu: 'strony.0.sekcje.0.dane.obraz' });
    expect(e.zlecenia[0]!.prompt).toBe(`Bright hair salon interior with plants, soft daylight ${STALE_ZAKAZY}`);
    expect(e.zlecenia[0]!.model).toBe('flux-pro-1.1');
    expect(w.zasoby[0]).toMatchObject({ zrodlo: 'ai', autor: AUTOR_AI, licencja: LICENCJA_AI, alt: 'Jasne wnętrze salonu z roślinami', szerokosc: 1280, wysokosc: 960 });
    expect(e.zasoby[0]).toMatchObject({ stronaId: STRONA, zrodlo: 'AI' });
    // Proporcje z modelu pod ścieżką, gdy panel ich nie podał.
    const obraz = obrazPodSciezka(walidowany(), 'strony.0.sekcje.0.dane.obraz');
    expect(e.zlecenia[0]!.proporcje).toBe(obraz?.proporcje ?? '4:3');
    const pliki = [...e.obiekty.entries()];
    expect(pliki.length).toBeGreaterThan(2);
    for (const [, dane] of pliki) {
      const m = await sharp(dane).metadata();
      expect(m.xmp?.toString()).toContain('digitalsourcetype/trainedAlgorithmicMedia');
    }
    expect(e.logi[0]).toMatchObject({ feature: FUNKCJA_AI_OBRAZU, userId: JA, actorUserId: 'czlowiek-1', status: 'COMPLETED' });
    expect(JSON.stringify(e.logi[0])).not.toContain('Fryzjerka');
  });

  it('obca strona → 404, ścieżka obrazu ze śmieciami → brak obrazu', async () => {
    const e = srodowisko();
    await expect(e.s.generuj(JA, JA, { ...DTO, stronaId: '00000000-0000-4000-8000-000000000000' })).rejects.toThrow('Nie znaleziono strony.');
    expect(obrazPodSciezka(walidowany(), '__proto__.x')).toBeUndefined();
    expect(obrazPodSciezka(walidowany(), 'strony.0.tytul')).toBeUndefined();
  });
});

function walidowany() {
  return structuredClone(PRZYKLAD_SALON) as Parameters<typeof obrazPodSciezka>[0];
}
