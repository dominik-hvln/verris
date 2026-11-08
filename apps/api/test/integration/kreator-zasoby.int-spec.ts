import { ConflictException, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { PRZYKLAD_SALON, walidujStrone, type FunkcjeAiKreatora, type Strona } from '@verris/kreator';
import { KreatorService } from '../../src/kreator/kreator.service.js';
import { KreatorZasobyService } from '../../src/kreator/zasoby.service.js';
import { KLUCZ_KONFIGURACJI_KREATORA } from '../../src/kreator/konfiguracja.js';
import { BibliotekaZdjec } from '../../src/kreator/biblioteka/biblioteka.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * Paczka 122 – zdjęcia kreatora na prawdziwym Postgresie (migracja 20261108150000_kreator_zasoby): enum źródła,
 * limit miejsca z sumy `bajty` konta, zdjęcie należy do konta (zapis strony z cudzym zasobem odrzucony),
 * odmowa usunięcia zdjęcia z opublikowanej strony, SetNull przy usunięciu strony i kaskada przy usunięciu konta.
 * Magazyn obiektów – atrapa w pamięci (bez MinIO).
 */
const KLUCZ = 'k'.repeat(48);
const config = { get: (k: string) => (k === 'appKmsKey' ? KLUCZ : k === 'PUBLIC_API_URL' ? 'https://api.verris.test' : undefined) };

function magazyn() {
  const obiekty = new Map<string, Buffer>();
  return {
    obiekty,
    putObject: async (_b: string, k: string, d: Buffer) => void obiekty.set(k, d),
    getObjectBuffer: async (_b: string, k: string) => obiekty.get(k)!,
    removeObject: async (_b: string, k: string) => void obiekty.delete(k),
  };
}

function serwisy() {
  const kreator = new KreatorService(prisma() as never, {} as never, config as never, { odciskStrony: () => 'odcisk' } as unknown as FunkcjeAiKreatora, { renderuj: () => [] });
  const m = magazyn();
  const zasoby = new KreatorZasobyService(prisma() as never, config as never, m as never, kreator, new BibliotekaZdjec([]));
  return { kreator, zasoby, m };
}

async function klient(trial = false) {
  const plan = await utworzPlan({ productKind: 'HOSTING' });
  const user = await prisma().user.create({ data: { email: `zasoby-${Math.random().toString(36).slice(2)}@test.verris.pl`, passwordHash: 'x' } });
  await prisma().subscription.create({ data: { userId: user.id, planId: plan.id, interval: 'MONTH', priceAmount: 45, status: 'ACTIVE', isTrial: trial } });
  return user;
}

const jpeg = (kolor: string) => sharp({ create: { width: 1000, height: 700, channels: 3, background: kolor } }).jpeg().toBuffer();

function zeZdjeciem(zasobId: string): Strona {
  const w = structuredClone(PRZYKLAD_SALON);
  const hero = w.strony[0]!.sekcje.find((x) => x.typ === 'hero')!;
  if (hero.typ !== 'hero') throw new Error('hero');
  hero.dane.obraz = { alt: 'Wnętrze', zrodlo: 'wlasne', zasobId, proporcje: '4:3' };
  const r = walidujStrone(w);
  if (!r.ok) throw new Error(r.bledy.join('; '));
  return r.strona;
}

describe('Verris Kreator – zdjęcia (baza)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().$executeRawUnsafe('TRUNCATE TABLE "KreatorStrona", "KreatorWersja", "KreatorZuzycie", "KreatorZasob" CASCADE;');
    await prisma().platformSetting.create({ data: { key: KLUCZ_KONFIGURACJI_KREATORA, value: JSON.stringify({ wlaczony: true }) } });
  });
  afterAll(rozlacz);

  it('wgranie zapisuje wiersz (enum WLASNE, wymiary, bajty, sha256); lista ze stronicowaniem i zajętym miejscem', async () => {
    const u = await klient();
    const { zasoby } = serwisy();
    const { zasob } = await zasoby.wgraj(u.id, await jpeg('#123456'), { alt: 'Fotel' });
    const w = await prisma().kreatorZasob.findUniqueOrThrow({ where: { id: zasob.id } });
    expect(w).toMatchObject({ userId: u.id, zrodlo: 'WLASNE', szerokosc: 1000, wysokosc: 700, alt: 'Fotel' });
    expect(w.sha256).toMatch(/^[0-9a-f]{64}$/);
    const l = await zasoby.lista(u.id);
    expect(l.razem).toBe(1);
    expect(l.miejsce).toEqual({ zajete: w.bajty, limit: 500 * 1048576 });
  });

  it('limit miejsca z sumy bajtów konta (próba 50 MB); cudze zdjęcia się nie liczą', async () => {
    const proba = await klient(true);
    const inny = await klient();
    await prisma().kreatorZasob.create({ data: { userId: inny.id, zrodlo: 'PIXABAY', szerokosc: 1, wysokosc: 1, bajty: 2_000_000_000, sha256: 'x' } });
    const { zasoby } = serwisy();
    await expect(zasoby.wgraj(proba.id, await jpeg('#222222'), {})).resolves.toBeTruthy();
    await prisma().kreatorZasob.create({ data: { userId: proba.id, zrodlo: 'WLASNE', szerokosc: 1, wysokosc: 1, bajty: 50 * 1048576, sha256: 'y' } });
    await expect(zasoby.wgraj(proba.id, await jpeg('#333333'), {})).rejects.toThrow(/Brak miejsca/);
  });

  it('zapis strony z cudzym zdjęciem odrzucony; z własnym – wymiary z bazy; usunięcie strony zostawia zdjęcie (SetNull)', async () => {
    const a = await klient();
    const b = await klient();
    const { kreator, zasoby } = serwisy();
    const strona = await prisma().kreatorStrona.create({ data: { userId: a.id, nazwa: 'S', model: {}, wersjaModelu: 1, odcisk: '', status: 'GOTOWA' } });
    const cudzy = (await zasoby.wgraj(b.id, await jpeg('#444444'), {})).zasob;
    await expect(kreator.zapiszRecznie(a.id, strona.id, zeZdjeciem(cudzy.id))).rejects.toThrow(/nie ma w Twojej bibliotece/);
    const wlasny = (await zasoby.wgraj(a.id, await jpeg('#555555'), { stronaId: strona.id })).zasob;
    const r = await kreator.zapiszRecznie(a.id, strona.id, zeZdjeciem(wlasny.id));
    expect(JSON.stringify(r.model)).toContain('"szerokosc":1000');
    await kreator.usun(a.id, strona.id);
    expect((await prisma().kreatorZasob.findUniqueOrThrow({ where: { id: wlasny.id } })).stronaId).toBeNull();
  });

  it('usunięcie: zdjęcie na opublikowanej stronie → 409, cudze → 404; usunięcie konta kasuje zasoby (kaskada)', async () => {
    const a = await klient();
    const { zasoby, m } = serwisy();
    const { zasob } = await zasoby.wgraj(a.id, await jpeg('#666666'), {});
    await prisma().kreatorStrona.create({
      data: { userId: a.id, nazwa: 'Opublikowana', model: zeZdjeciem(zasob.id) as never, wersjaModelu: 1, odcisk: '', status: 'GOTOWA', opublikowanaAt: new Date() },
    });
    await expect(zasoby.usun(a.id, zasob.id)).rejects.toBeInstanceOf(ConflictException);
    const b = await klient();
    await expect(zasoby.usun(b.id, zasob.id)).rejects.toBeInstanceOf(NotFoundException);
    await prisma().kreatorStrona.updateMany({ where: { userId: a.id }, data: { opublikowanaAt: null } });
    await zasoby.usun(a.id, zasob.id);
    expect(m.obiekty.size).toBe(0);
    const drugi = await zasoby.wgraj(a.id, await jpeg('#777777'), {});
    await prisma().user.delete({ where: { id: a.id } });
    expect(await prisma().kreatorZasob.findUnique({ where: { id: drugi.zasob.id } })).toBeNull();
  });
});
