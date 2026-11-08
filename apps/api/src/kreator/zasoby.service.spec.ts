import { Readable } from 'node:stream';
import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';
import { PRZYKLAD_SALON, walidujStrone, type Strona } from '@verris/kreator';
import { KreatorZasobyService, limitMiejscaZdjec, creditsTxt } from './zasoby.service.js';
import { sprawdzTokenMiniatury, sprawdzTokenZasobu, utworzTokenMiniatury, utworzTokenZasobu } from './zasoby-token.js';
import { BLAD_CUDZEGO_ZASOBU, idZasobow, uzupelnijWymiary } from './zasoby-model.js';
import { BibliotekaZdjec } from './biblioteka/biblioteka.js';
import { DostawcaOpenverse } from './biblioteka/openverse.js';
import type { Fetch } from './biblioteka/dostawca.js';

/** Paczka 122 – biblioteka zdjęć konta: własność, limity, usuwanie, pliki publiczne (token), publikacja. */
const KLUCZ = 'k'.repeat(48);
const JA = 'user-ja';
const OBCY = 'user-obcy';

type Wiersz = {
  id: string; userId: string; stronaId: string | null; zrodlo: string; autor: string | null; licencja: string | null;
  licencjaUrl: string | null; zrodloUrl: string | null; szerokosc: number; wysokosc: number; bajty: number; sha256: string;
  alt: string | null; createdAt: Date;
};

function srodowisko(opcje: { wersja?: 'proba' | 'hosting' | 'pro'; strony?: { id: string; userId: string; nazwa: string; model: unknown; opublikowanaAt?: Date | null; podgladDo?: Date | null }[]; f?: Fetch } = {}) {
  const zasoby: Wiersz[] = [];
  const obiekty = new Map<string, Buffer>();
  const strony = opcje.strony ?? [];
  const pasuje = (w: Wiersz, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => (k === 'id' && v && typeof v === 'object' && 'in' in v ? (v as { in: string[] }).in.includes(w.id) : (w as never)[k] === v));
  const prisma = {
    kreatorZasob: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => zasoby.find((w) => pasuje(w, where)) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) => zasoby.find((w) => w.id === where.id) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => zasoby.filter((w) => pasuje(w, where)),
      count: async ({ where }: { where: Record<string, unknown> }) => zasoby.filter((w) => pasuje(w, where)).length,
      aggregate: async ({ where }: { where: Record<string, unknown> }) => ({ _sum: { bajty: zasoby.filter((w) => pasuje(w, where)).reduce((a, w) => a + w.bajty, 0) || null } }),
      create: async ({ data }: { data: Omit<Wiersz, 'createdAt'> }) => {
        const w = { ...data, createdAt: new Date() } as Wiersz;
        zasoby.push(w);
        return w;
      },
      delete: async ({ where }: { where: { id: string } }) => zasoby.splice(zasoby.findIndex((w) => w.id === where.id), 1)[0],
    },
    kreatorStrona: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => strony.find((s) => s.id === where.id && s.userId === where.userId) ?? null,
      findMany: async ({ where }: { where: { userId: string } }) => strony.filter((s) => s.userId === where.userId),
    },
  };
  const storage = {
    putObject: vi.fn(async (_b: string, k: string, dane: Buffer) => void obiekty.set(k, dane)),
    getObjectBuffer: vi.fn(async (_b: string, k: string) => {
      const d = obiekty.get(k);
      if (!d) throw new Error('NoSuchKey');
      return d;
    }),
    getObjectStream: vi.fn(async (_b: string, k: string) => Readable.from([obiekty.get(k) ?? Buffer.alloc(0)])),
    removeObject: vi.fn(async (_b: string, k: string) => void obiekty.delete(k)),
  };
  const config = { get: (k: string) => (k === 'appKmsKey' ? KLUCZ : k === 'PUBLIC_API_URL' ? 'https://api.verris.test' : undefined) };
  const kreator = {
    dostep: async () => ({ dostep: true, wersja: opcje.wersja ?? 'hosting' }),
    konfiguracja: async () => ({ bibliotekiZdjec: ['pixabay', 'openverse', 'pexels'] }),
  };
  const biblioteka = new BibliotekaZdjec([new DostawcaOpenverse(opcje.f)]);
  const s = new KreatorZasobyService(prisma as never, config as never, storage as never, kreator as never, biblioteka);
  return { s, zasoby, obiekty, storage };
}

const jpeg = (w = 1200, h = 800, kolor = '#336699') => sharp({ create: { width: w, height: h, channels: 3, background: kolor } }).jpeg().toBuffer();

function salonZeZdjeciem(zasobId: string): Strona {
  const w = structuredClone(PRZYKLAD_SALON);
  const hero = w.strony[0]!.sekcje.find((x) => x.typ === 'hero')!;
  if (hero.typ !== 'hero') throw new Error('hero');
  hero.dane.obraz = { alt: 'Wnętrze', zrodlo: 'wlasne', zasobId, proporcje: '4:3', szerokosc: 9999 };
  const r = walidujStrone(w);
  if (!r.ok) throw new Error(r.bledy.join('\n'));
  return r.strona;
}

describe('KreatorZasobyService', () => {
  it('wgranie: pliki w magazynie pod kluczami konta, widok z podpisanym adresem; to samo zdjęcie drugi raz = ten sam zasób', async () => {
    const { s, zasoby, obiekty } = srodowisko();
    const plik = await jpeg();
    const { zasob } = await s.wgraj(JA, plik, { alt: 'Fotel' });
    expect(zasob).toMatchObject({ zrodlo: 'wlasne', szerokosc: 1200, wysokosc: 800, alt: 'Fotel' });
    expect([...obiekty.keys()].sort()).toEqual(
      [`${JA}/${zasob.id}/oryginal.webp`, ...[480, 960].flatMap((x) => [`${JA}/${zasob.id}/${x}.webp`, `${JA}/${zasob.id}/${x}.jpg`])].sort(),
    );
    expect(zasob.adres).toBe(`https://api.verris.test/kreator/z/${utworzTokenZasobu(KLUCZ, zasob.id)}/`);
    const drugi = await s.wgraj(JA, plik, {});
    expect(drugi.zasob.id).toBe(zasob.id);
    expect(zasoby).toHaveLength(1);
  });

  it('wgranie do cudzej strony → 404; plik nie-zdjęcie → 422 z polskim komunikatem', async () => {
    const { s } = srodowisko({ strony: [{ id: 'strona-obca', userId: OBCY, nazwa: 'X', model: {} }] });
    await expect(s.wgraj(JA, await jpeg(), { stronaId: 'strona-obca' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.wgraj(JA, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), {})).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('limit miejsca per wersja kreatora: próba 50 MB – przekroczenie → 403', async () => {
    expect([limitMiejscaZdjec('proba'), limitMiejscaZdjec('hosting'), limitMiejscaZdjec('pro')]).toEqual([50 * 1048576, 500 * 1048576, 2 * 1024 ** 3]);
    const { s, zasoby } = srodowisko({ wersja: 'proba' });
    zasoby.push({ id: 'x', userId: JA, stronaId: null, zrodlo: 'WLASNE', autor: null, licencja: null, licencjaUrl: null, zrodloUrl: null, szerokosc: 1, wysokosc: 1, bajty: 50 * 1048576 - 100, sha256: 'a', alt: null, createdAt: new Date() });
    await expect(s.wgraj(JA, await jpeg(), {})).rejects.toThrow(ForbiddenException);
    await expect(s.wgraj(JA, await jpeg(), {})).rejects.toThrow(/Brak miejsca na zdjęcia/);
  });

  it('usunięcie: cudzy → 404; użyty na opublikowanej stronie → 409; nieużyty – usuwa wiersz i pliki', async () => {
    const strony = [{ id: 's1', userId: JA, nazwa: 'Salon', model: {} as unknown, opublikowanaAt: new Date() as Date | null, podgladDo: null as Date | null }];
    const { s, obiekty } = srodowisko({ strony });
    const { zasob } = await s.wgraj(JA, await jpeg(), {});
    await expect(s.usun(OBCY, zasob.id)).rejects.toBeInstanceOf(NotFoundException);
    strony[0]!.model = salonZeZdjeciem(zasob.id);
    await expect(s.usun(JA, zasob.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(s.usun(JA, zasob.id)).rejects.toThrow('To zdjęcie jest na opublikowanej stronie „Salon”.');
    // Lista „Twoje zdjęcia” mówi, gdzie zdjęcie jest użyte (paczka 123).
    expect((await s.lista(JA)).zasoby[0]!.uzyte).toEqual([{ stronaId: 's1', nazwa: 'Salon', opublikowana: true }]);
    strony[0]!.opublikowanaAt = null as never;
    expect((await s.lista(JA)).zasoby[0]!.uzyte).toEqual([{ stronaId: 's1', nazwa: 'Salon', opublikowana: false }]);
    // Ważny link próbny = opublikowana.
    strony[0]!.podgladDo = new Date(Date.now() + 60_000);
    await expect(s.usun(JA, zasob.id)).rejects.toBeInstanceOf(ConflictException);
    strony[0]!.podgladDo = null;
    await expect(s.usun(JA, zasob.id)).resolves.toEqual({ ok: true });
    expect(obiekty.size).toBe(0);
  });

  it('plik publiczny: dobry token i istniejąca szerokość → strumień; podrobiony token, zła szerokość → 404', async () => {
    const { s } = srodowisko();
    const { zasob } = await s.wgraj(JA, await jpeg(), {});
    const token = utworzTokenZasobu(KLUCZ, zasob.id);
    const ok = await s.plik(token, '960.webp');
    expect(ok.typ).toBe('image/webp');
    const podrobiony = `${token.slice(0, 32)}${'0'.repeat(32)}`;
    await expect(s.plik(podrobiony, '960.webp')).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.plik(utworzTokenZasobu('inny-klucz', zasob.id), '960.webp')).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.plik(token, '1600.webp')).rejects.toBeInstanceOf(NotFoundException); // oryginał 1200 px
    await expect(s.plik(token, '960.png')).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.plik(token, '../oryginal.webp')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adresy do podglądu tylko dla zasobów konta', async () => {
    const { s } = srodowisko();
    const { zasob } = await s.wgraj(JA, await jpeg(), {});
    expect(Object.keys((await s.adresy(JA, [zasob.id])).adresy)).toEqual([zasob.id]);
    expect((await s.adresy(OBCY, [zasob.id])).adresy).toEqual({});
  });

  it('publikacja: warianty do assets/img/<id>-<szer>.<format>, wymiary z bazy; cudzy zasób → 422', async () => {
    const { s } = srodowisko();
    const { zasob } = await s.wgraj(JA, await jpeg(), {});
    const strona = salonZeZdjeciem(zasob.id);
    const p = await s.doPublikacji(JA, strona, 'pliki');
    expect(p.pliki.map((x) => x.sciezka).sort()).toEqual([480, 960].flatMap((x) => [`assets/img/${zasob.id}-${x}.jpg`, `assets/img/${zasob.id}-${x}.webp`]).sort());
    expect(p.pliki.every((x) => !x.tekst && x.dane.length > 0)).toBe(true);
    expect(p.adresZasobu!(zasob.id, 480, 'jpg')).toBe(`assets/img/${zasob.id}-480.jpg`);
    expect(JSON.stringify(p.strona)).toContain('"szerokosc":1200');
    const link = await s.doPublikacji(JA, strona, 'adresy');
    expect(link.pliki).toEqual([]);
    expect(link.adresZasobu!(zasob.id, 960, 'webp')).toMatch(/^https:\/\/api\.verris\.test\/kreator\/z\/[0-9a-f]{64}\/960\.webp$/);
    await expect(s.doPublikacji(OBCY, strona, 'pliki')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('import z Openverse: autor i licencja w zasobie, plik tylko z hosta źródła', async () => {
    const jpg = await jpeg(700, 500, '#884422');
    const f = (async (u: string | URL | Request) => {
      const url = String(u);
      if (url.startsWith('https://api.openverse.org/v1/images/')) {
        return new Response(
          JSON.stringify({
            id: '4bc43a04-ef46-4544-a0c1-63c63f56e276', url: 'https://upload.wikimedia.org/a.jpg', thumbnail: 'https://api.openverse.org/v1/images/4bc43a04-ef46-4544-a0c1-63c63f56e276/thumb/',
            width: 700, height: 500, creator: 'Ewa', license: 'cc0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/', foreign_landing_url: 'https://commons.wikimedia.org/x',
          }),
        );
      }
      if (url === 'https://upload.wikimedia.org/a.jpg') return new Response(jpg);
      throw new Error(`nieoczekiwany adres ${url}`);
    }) as Fetch;
    const { s } = srodowisko({ f });
    const { zasob } = await s.importuj(JA, { dostawca: 'openverse', id: '4bc43a04-ef46-4544-a0c1-63c63f56e276' });
    expect(zasob).toMatchObject({ zrodlo: 'openverse', autor: 'Ewa', licencja: 'cc0', zrodloUrl: 'https://commons.wikimedia.org/x', szerokosc: 700 });
    await expect(s.importuj(JA, { dostawca: 'pixabay', id: '1' })).rejects.toThrow(/nie jest teraz dostępna/);
  });

  it('wyszukiwanie: miniatury przez proxy API z tokenem (nie adres dostawcy); token miniatury podrobiony → 404', async () => {
    const f = (async () =>
      new Response(
        JSON.stringify({
          result_count: 1,
          results: [{ id: '4bc43a04-ef46-4544-a0c1-63c63f56e276', url: 'https://upload.wikimedia.org/a.jpg', thumbnail: 'https://api.openverse.org/v1/images/4bc43a04-ef46-4544-a0c1-63c63f56e276/thumb/', width: 10, height: 10, creator: 'Ewa', license: 'cc0' }],
        }),
      )) as Fetch;
    const { s } = srodowisko({ f });
    const r = await s.szukaj(JA, { q: 'kwiaty' });
    expect(r.dostawcy).toEqual([{ id: 'openverse', nazwa: 'Openverse' }]);
    expect(r.wyniki[0]!.miniatura).toMatch(/^https:\/\/api\.verris\.test\/kreator\/biblioteka\/m\//);
    const token = r.wyniki[0]!.miniatura.split('/m/')[1]!;
    expect(sprawdzTokenMiniatury(KLUCZ, token)).toEqual({ dostawca: 'openverse', url: 'https://api.openverse.org/v1/images/4bc43a04-ef46-4544-a0c1-63c63f56e276/thumb/' });
    await expect(s.miniatura(`${token.slice(0, -4)}0000`)).rejects.toBeInstanceOf(NotFoundException);
    // Podpisany, ale z adresem spoza hostów dostawcy (np. wyciek klucza) – i tak 404 bez zapytania.
    await expect(s.miniatura(utworzTokenMiniatury(KLUCZ, 'openverse', 'https://169.254.169.254/', new Date(Date.now() + 60_000)))).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('tokeny i model', () => {
  it('token zasobu: poprawny → id, zmieniony znak → null; termin tokenu miniatury', () => {
    const id = '3f2a9c4e-8b1d-4f6a-9c2e-1a2b3c4d5e6f';
    const t = utworzTokenZasobu(KLUCZ, id);
    expect(sprawdzTokenZasobu(KLUCZ, t)).toBe(id);
    expect(sprawdzTokenZasobu(KLUCZ, `${t.slice(0, 63)}${t[63] === 'a' ? 'b' : 'a'}`)).toBeNull();
    expect(sprawdzTokenZasobu(KLUCZ, 'x')).toBeNull();
    const m = utworzTokenMiniatury(KLUCZ, 'pixabay', 'https://pixabay.com/get/a.jpg', new Date(Date.now() - 1000));
    expect(sprawdzTokenMiniatury(KLUCZ, m)).toBeNull();
  });

  it('model: cudzy albo nieistniejący zasób → błąd zapisu; wymiary nadpisane z bazy', () => {
    const id = '3f2a9c4e-8b1d-4f6a-9c2e-1a2b3c4d5e6f';
    const strona = salonZeZdjeciem(id);
    expect(idZasobow(strona)).toEqual([id]);
    expect(() => uzupelnijWymiary(strona, [])).toThrow(BLAD_CUDZEGO_ZASOBU);
    const u = uzupelnijWymiary(strona, [{ id, szerokosc: 640, wysokosc: 480 }]);
    expect(JSON.stringify(u)).toContain('"szerokosc":640');
    expect(JSON.stringify(strona)).toContain('"szerokosc":9999'); // kopia, nie zmiana wejścia
  });

  it('credits.txt: autor, licencja i źródło', () => {
    const t = creditsTxt([{ id: 'a', zrodlo: 'PIXABAY', autor: 'Jan', licencja: 'pixabay', licencjaUrl: 'https://pixabay.com/service/license-summary/', zrodloUrl: 'https://pixabay.com/x' }] as never);
    expect(t).toContain('a: Jan – pixabay, licencja pixabay (https://pixabay.com/service/license-summary/), https://pixabay.com/x');
  });
});
