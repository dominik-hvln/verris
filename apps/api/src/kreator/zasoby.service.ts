import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KreatorZrodloZasobu, type KreatorZasob } from '@verris/database';
import { szerokosciWariantow, type Strona, type WersjaKreatora } from '@verris/kreator';
import { PrismaService } from '../prisma/prisma.service.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';
import { ObjectBuckets } from '../storage/object-storage.types.js';
import { KreatorService } from './kreator.service.js';
import { BladObrazu, MAKS_BAJTOW_WEJSCIA, kluczOryginalu, kluczWariantu, przetworzObraz, type PrzetworzonyObraz } from './zasoby-obraz.js';
import { adresBazowyZasobu, sprawdzTokenMiniatury, sprawdzTokenZasobu, utworzTokenMiniatury } from './zasoby-token.js';
import { idZasobow, uzupelnijWymiary } from './zasoby-model.js';
import { BibliotekaZdjec, CZAS_CACHE_MS, MAKS_STRONA, NA_STRONE } from './biblioteka/biblioteka.js';
import { BladDostawcy, DOSTAWCY_ZDJEC, type NazwaDostawcy } from './biblioteka/dostawca.js';
import type { PlikPublikacji } from './publikacja.js';

/**
 * Limit miejsca na zdjęcia w bibliotece konta (suma oryginałów i wariantów) per wersja kreatora.
 * TODO (paczka 122): przenieść do PLANY_KREATORA w libs/kreator/src/plany.ts (pole `miejsceNaZdjecia`) – plany.ts
 * jest kontraktem wspólnym, ta paczka go nie zmienia.
 */
export const LIMIT_MIEJSCA_ZDJEC: Record<WersjaKreatora, number> = {
  proba: 50 * 1024 * 1024,
  hosting: 500 * 1024 * 1024,
  pro: 2 * 1024 * 1024 * 1024,
};
export const NA_STRONE_ZASOBOW = 48;
export const MAKS_ADRESOW = 100;
/** Katalog zdjęć w opublikowanej stronie (względem korzenia strony). */
export const KATALOG_ZDJEC = 'assets/img';

export const BIBLIOTEKA_ZDJEC = Symbol('BIBLIOTEKA_ZDJEC');

const NIE_MA = 'Nie znaleziono zdjęcia.';
const BLAD_MAGAZYNU = 'Nie udało się zapisać zdjęcia – spróbuj ponownie za chwilę.';

const ZRODLO_MODELU: Record<KreatorZrodloZasobu, 'wlasne' | 'pixabay' | 'openverse' | 'pexels' | 'ai'> = {
  WLASNE: 'wlasne',
  PIXABAY: 'pixabay',
  OPENVERSE: 'openverse',
  PEXELS: 'pexels',
  AI: 'ai',
};
const ZRODLO_DOSTAWCY: Record<NazwaDostawcy, KreatorZrodloZasobu> = {
  pixabay: KreatorZrodloZasobu.PIXABAY,
  openverse: KreatorZrodloZasobu.OPENVERSE,
  pexels: KreatorZrodloZasobu.PEXELS,
};

const PLIK_WARIANTU = /^(\d{3,4})\.(webp|jpg)$/;

export interface MetaZasobu {
  zrodlo: KreatorZrodloZasobu;
  autor?: string;
  licencja?: string;
  licencjaUrl?: string;
  zrodloUrl?: string;
}

/**
 * Verris Kreator – biblioteka zdjęć konta (paczka 122): wgranie, import z bibliotek zewnętrznych, lista, usunięcie,
 * publiczne pliki wariantów (token HMAC), adresy do podglądu i pliki do publikacji. Zdjęcia należą do konta
 * (`userId` = właściciel); cudzy zasób = 404, a w modelu strony – odrzucenie zapisu (zasoby-model.ts).
 */
@Injectable()
export class KreatorZasobyService {
  private readonly logger = new Logger(KreatorZasobyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: ObjectStorageService,
    private readonly kreator: KreatorService,
    @Inject(BIBLIOTEKA_ZDJEC) private readonly biblioteka: BibliotekaZdjec,
  ) {}

  // ---------------------------------------------------------------------------
  // Wgranie i import
  // ---------------------------------------------------------------------------

  async wgraj(userId: string, plik: Buffer | undefined, dto: { stronaId?: string; alt?: string }) {
    const wersja = await this.wersja(userId);
    if (!plik?.length) throw new BadRequestException('Wybierz zdjęcie do wgrania.');
    if (plik.length > MAKS_BAJTOW_WEJSCIA) throw new PayloadTooLargeException(`Zdjęcie jest za duże – limit ${MAKS_BAJTOW_WEJSCIA / 1048576} MB.`);
    await this.sprawdzStrone(userId, dto.stronaId);
    const obraz = await this.przetworz(plik);
    return { zasob: await this.zapisz(userId, wersja, obraz, { zrodlo: KreatorZrodloZasobu.WLASNE }, dto) };
  }

  async importuj(userId: string, dto: { dostawca: string; id: string; stronaId?: string; alt?: string }) {
    const wersja = await this.wersja(userId);
    await this.sprawdzStrone(userId, dto.stronaId);
    const konf = await this.kreator.konfiguracja();
    const p = await this.zDostawca(async () => {
      const d = this.biblioteka.dostawca(dto.dostawca, konf.bibliotekiZdjec);
      return this.biblioteka.pobierzOryginal(d, dto.id, MAKS_BAJTOW_WEJSCIA);
    });
    const obraz = await this.przetworz(p.dane);
    const meta: MetaZasobu = {
      zrodlo: ZRODLO_DOSTAWCY[dto.dostawca as NazwaDostawcy],
      autor: p.meta.autor,
      licencja: p.meta.licencja,
      ...(p.meta.licencjaUrl ? { licencjaUrl: p.meta.licencjaUrl } : {}),
      zrodloUrl: p.meta.zrodloUrl,
    };
    return { zasob: await this.zapisz(userId, wersja, obraz, meta, dto) };
  }

  private async przetworz(plik: Buffer): Promise<PrzetworzonyObraz> {
    try {
      return await przetworzObraz(plik);
    } catch (e) {
      if (e instanceof BladObrazu) throw new UnprocessableEntityException(e.message);
      throw e;
    }
  }

  /** Zapis: pliki w magazynie, potem wiersz w bazie. To samo zdjęcie drugi raz (sha256) = istniejący zasób. */
  private async zapisz(userId: string, wersja: WersjaKreatora, o: PrzetworzonyObraz, meta: MetaZasobu, dto: { stronaId?: string; alt?: string }) {
    const istniejacy = await this.prisma.kreatorZasob.findFirst({ where: { userId, sha256: o.sha256 } });
    if (istniejacy) return this.widok(istniejacy);
    const suma = await this.prisma.kreatorZasob.aggregate({ where: { userId }, _sum: { bajty: true } });
    const zajete = suma._sum.bajty ?? 0;
    const limit = LIMIT_MIEJSCA_ZDJEC[wersja];
    // Dwa równoległe wgrania mogą razem przekroczyć limit o jedno zdjęcie (≤ kilkanaście MB) – świadomie bez blokady.
    if (zajete + o.bajty > limit) {
      throw new ForbiddenException(
        `Brak miejsca na zdjęcia (zajęte ${mb(zajete)} z ${mb(limit)}). Usuń nieużywane zdjęcia z biblioteki${wersja === 'pro' ? '' : ' albo przejdź na wyższą wersję kreatora'}.`,
      );
    }
    const id = randomUUID();
    const klucze: string[] = [];
    try {
      const k = kluczOryginalu(userId, id);
      await this.storage.putObject(ObjectBuckets.KREATOR_ZASOBY, k, o.oryginal, { contentType: 'image/webp' });
      klucze.push(k);
      for (const w of o.warianty) {
        const kw = kluczWariantu(userId, id, w.szerokosc, w.format);
        await this.storage.putObject(ObjectBuckets.KREATOR_ZASOBY, kw, w.dane, { contentType: w.format === 'webp' ? 'image/webp' : 'image/jpeg' });
        klucze.push(kw);
      }
      const z = await this.prisma.kreatorZasob.create({
        data: {
          id,
          userId,
          stronaId: dto.stronaId ?? null,
          zrodlo: meta.zrodlo,
          autor: meta.autor?.slice(0, 120) || null,
          licencja: meta.licencja ?? null,
          licencjaUrl: meta.licencjaUrl ?? null,
          zrodloUrl: meta.zrodloUrl ?? null,
          szerokosc: o.szerokosc,
          wysokosc: o.wysokosc,
          bajty: o.bajty,
          sha256: o.sha256,
          alt: dto.alt?.trim().slice(0, 200) || null,
        },
      });
      return this.widok(z);
    } catch (e) {
      await this.usunPliki(klucze);
      if (e instanceof HttpException && !(e instanceof ServiceUnavailableException)) throw e;
      this.logger.error(`Zapis zdjęcia kreatora: ${e instanceof Error ? e.message : String(e)}`);
      throw new ServiceUnavailableException(BLAD_MAGAZYNU);
    }
  }

  // ---------------------------------------------------------------------------
  // Lista, usunięcie, adresy
  // ---------------------------------------------------------------------------

  async lista(userId: string, strona = 1) {
    const wersja = await this.wersja(userId);
    const s = Math.max(1, Math.min(1000, Math.floor(strona) || 1));
    const [zasoby, razem, suma] = await Promise.all([
      this.prisma.kreatorZasob.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip: (s - 1) * NA_STRONE_ZASOBOW, take: NA_STRONE_ZASOBOW }),
      this.prisma.kreatorZasob.count({ where: { userId } }),
      this.prisma.kreatorZasob.aggregate({ where: { userId }, _sum: { bajty: true } }),
    ]);
    return {
      zasoby: zasoby.map((z) => this.widok(z)),
      razem,
      strona: s,
      naStrone: NA_STRONE_ZASOBOW,
      miejsce: { zajete: suma._sum.bajty ?? 0, limit: LIMIT_MIEJSCA_ZDJEC[wersja] },
    };
  }

  /** Usunięcie – odmowa, gdy zdjęcie jest na opublikowanej stronie (domena albo ważny link próbny). */
  async usun(userId: string, id: string): Promise<{ ok: true }> {
    const z = await this.prisma.kreatorZasob.findFirst({ where: { id, userId } });
    if (!z) throw new NotFoundException(NIE_MA);
    const opublikowane = await this.prisma.kreatorStrona.findMany({
      where: { userId, OR: [{ opublikowanaAt: { not: null } }, { podgladDo: { gt: new Date() } }] },
      select: { nazwa: true, model: true },
    });
    const uzyte = opublikowane.filter((s) => idZasobow(s.model).includes(id.toLowerCase()));
    if (uzyte.length) {
      throw new ConflictException(
        `To zdjęcie jest na opublikowanej stronie „${uzyte[0]!.nazwa}”. Zmień zdjęcie na stronie i opublikuj ją ponownie, potem usuń je z biblioteki.`,
      );
    }
    await this.prisma.kreatorZasob.delete({ where: { id: z.id } });
    await this.usunPliki([kluczOryginalu(userId, z.id), ...szerokosciWariantow(z.szerokosc).flatMap((s) => [kluczWariantu(userId, z.id, s, 'webp'), kluczWariantu(userId, z.id, s, 'jpg')])]);
    return { ok: true };
  }

  /** Adresy bazowe plików (…/kreator/z/<token>/) dla podglądu w panelu – tylko zasoby konta. */
  async adresy(userId: string, ids: string[]): Promise<{ adresy: Record<string, string> }> {
    const czyste = [...new Set(ids.map((i) => i.trim().toLowerCase()).filter((i) => /^[0-9a-f-]{36}$/.test(i)))].slice(0, MAKS_ADRESOW);
    if (!czyste.length) return { adresy: {} };
    const zasoby = await this.prisma.kreatorZasob.findMany({ where: { userId, id: { in: czyste } }, select: { id: true } });
    const klucz = this.klucz();
    return { adresy: Object.fromEntries(zasoby.map((z) => [z.id, adresBazowyZasobu(this.adresApi(), klucz, z.id)])) };
  }

  // ---------------------------------------------------------------------------
  // Publiczny plik wariantu: GET /kreator/z/:token/:plik
  // ---------------------------------------------------------------------------

  async plik(token: string, nazwaPliku: string): Promise<{ strumien: Readable; typ: string }> {
    const klucz = this.config.get<string>('appKmsKey');
    const id = klucz ? sprawdzTokenZasobu(klucz, token) : null;
    const m = PLIK_WARIANTU.exec(String(nazwaPliku ?? ''));
    if (!id || !m) throw new NotFoundException(NIE_MA);
    const szer = Number(m[1]);
    const format = m[2] as 'webp' | 'jpg';
    const z = await this.prisma.kreatorZasob.findUnique({ where: { id }, select: { id: true, userId: true, szerokosc: true } });
    if (!z || !szerokosciWariantow(z.szerokosc).includes(szer)) throw new NotFoundException(NIE_MA);
    const strumien = await this.storage.getObjectStream(ObjectBuckets.KREATOR_ZASOBY, kluczWariantu(z.userId, z.id, szer, format));
    return { strumien, typ: format === 'webp' ? 'image/webp' : 'image/jpeg' };
  }

  // ---------------------------------------------------------------------------
  // Biblioteki zewnętrzne
  // ---------------------------------------------------------------------------

  async szukaj(userId: string, q: { q?: string; dostawca?: string; strona?: number }) {
    await this.wersja(userId);
    const konf = await this.kreator.konfiguracja();
    const wlaczeni = this.biblioteka.wlaczeni(konf.bibliotekiZdjec);
    const dostawcy = wlaczeni.map((d) => ({ id: d.nazwa, nazwa: d.etykieta }));
    const fraza = (q.q ?? '').trim();
    const nazwa = q.dostawca ?? wlaczeni[0]?.nazwa;
    if (!wlaczeni.length) return { dostawcy, dostawca: null, wyniki: [], razem: 0, strona: 1, naStrone: NA_STRONE };
    const d = wlaczeni.find((x) => x.nazwa === nazwa);
    if (!d) throw new BadRequestException('Ta biblioteka zdjęć nie jest teraz dostępna.');
    const strona = Math.max(1, Math.min(MAKS_STRONA, Math.floor(q.strona ?? 1) || 1));
    if (!fraza) return { dostawcy, dostawca: d.nazwa, zrodlo: d.etykieta, wyniki: [], razem: 0, strona, naStrone: NA_STRONE };
    const w = await this.zDostawca(() => this.biblioteka.szukaj(d, fraza, strona));
    const klucz = this.klucz();
    const wazneDo = new Date(Date.now() + CZAS_CACHE_MS);
    return {
      dostawcy,
      dostawca: d.nazwa,
      zrodlo: d.etykieta,
      wyniki: w.wyniki.map((x) => ({ ...x, miniatura: `${this.adresApi()}/kreator/biblioteka/m/${utworzTokenMiniatury(klucz, d.nazwa, x.miniatura, wazneDo)}` })),
      razem: w.razem,
      strona,
      naStrone: NA_STRONE,
    };
  }

  /** Miniatura wyniku przez proxy (publiczna, token z terminem 24 h). */
  async miniatura(token: string): Promise<{ dane: Buffer; typ: string }> {
    const klucz = this.config.get<string>('appKmsKey');
    const t = klucz ? sprawdzTokenMiniatury(klucz, token) : null;
    if (!t || !(DOSTAWCY_ZDJEC as readonly string[]).includes(t.dostawca)) throw new NotFoundException(NIE_MA);
    const konf = await this.kreator.konfiguracja();
    return this.zDostawca(async () => {
      const d = this.biblioteka.dostawca(t.dostawca, konf.bibliotekiZdjec);
      return this.biblioteka.miniatura(d, t.url);
    }, true);
  }

  private async zDostawca<T>(fn: () => Promise<T>, nieMa = false): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof BladDostawcy) throw nieMa ? new NotFoundException(NIE_MA) : new ServiceUnavailableException(e.message);
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // Publikacja i podgląd
  // ---------------------------------------------------------------------------

  /**
   * Zdjęcia strony do publikacji: model z wymiarami z bazy (cudzy/usunięty zasób → 400), adres plików i –
   * w trybie 'pliki' – warianty skopiowane z magazynu do assets/img/<id>-<szer>.<webp|jpg> + credits.txt
   * (autorzy i licencje zdjęć z bibliotek – podpis przy zdjęciu tylko, gdy licencja wymaga).
   * Tryb 'adresy' (link próbny) – podpisane adresy API, bez plików.
   */
  async doPublikacji(
    userId: string,
    strona: Strona,
    tryb: 'pliki' | 'adresy',
  ): Promise<{ strona: Strona; adresZasobu?: (id: string, s: number, f: 'webp' | 'jpg') => string; pliki: PlikPublikacji[] }> {
    const ids = idZasobow(strona);
    if (!ids.length) return { strona, pliki: [] };
    const zasoby = await this.prisma.kreatorZasob.findMany({ where: { userId, id: { in: ids } } });
    const model = this.uzupelnij(strona, zasoby);
    if (tryb === 'adresy') {
      const klucz = this.klucz();
      const api = this.adresApi();
      return { strona: model, adresZasobu: (id, s, f) => `${adresBazowyZasobu(api, klucz, id)}${s}.${f}`, pliki: [] };
    }
    const pliki: PlikPublikacji[] = [];
    for (const z of zasoby) {
      for (const s of szerokosciWariantow(z.szerokosc)) {
        for (const f of ['webp', 'jpg'] as const) {
          const dane = await this.storage.getObjectBuffer(ObjectBuckets.KREATOR_ZASOBY, kluczWariantu(userId, z.id, s, f));
          pliki.push({ sciezka: `${KATALOG_ZDJEC}/${z.id}-${s}.${f}`, dane, tekst: false });
        }
      }
    }
    const zewnetrzne = zasoby.filter((z) => z.zrodlo !== KreatorZrodloZasobu.WLASNE && z.zrodlo !== KreatorZrodloZasobu.AI);
    if (zewnetrzne.length) pliki.push({ sciezka: `${KATALOG_ZDJEC}/credits.txt`, dane: Buffer.from(creditsTxt(zewnetrzne), 'utf8'), tekst: true });
    return { strona: model, adresZasobu: (id, s, f) => `${KATALOG_ZDJEC}/${id}-${s}.${f}`, pliki };
  }

  private uzupelnij(strona: Strona, zasoby: KreatorZasob[]): Strona {
    try {
      return uzupelnijWymiary(strona, zasoby);
    } catch (e) {
      if (e instanceof BadRequestException) {
        throw new UnprocessableEntityException('Na stronie jest zdjęcie, którego nie ma już w Twojej bibliotece – wybierz inne zdjęcie i opublikuj ponownie.');
      }
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // Pomocnicze
  // ---------------------------------------------------------------------------

  widok(z: KreatorZasob) {
    const baza = adresBazowyZasobu(this.adresApi(), this.klucz(), z.id);
    return {
      id: z.id,
      zrodlo: ZRODLO_MODELU[z.zrodlo],
      autor: z.autor,
      licencja: z.licencja,
      licencjaUrl: z.licencjaUrl,
      zrodloUrl: z.zrodloUrl,
      szerokosc: z.szerokosc,
      wysokosc: z.wysokosc,
      bajty: z.bajty,
      alt: z.alt,
      createdAt: z.createdAt,
      adres: baza,
      miniatura: `${baza}480.webp`,
    };
  }

  private async wersja(userId: string): Promise<WersjaKreatora> {
    const d = await this.kreator.dostep(userId);
    if (!d.dostep) throw new ForbiddenException(d.powod);
    return d.wersja;
  }

  private async sprawdzStrone(userId: string, stronaId: string | undefined): Promise<void> {
    if (!stronaId) return;
    const s = await this.prisma.kreatorStrona.findFirst({ where: { id: stronaId, userId }, select: { id: true } });
    if (!s) throw new NotFoundException('Nie znaleziono strony.');
  }

  private async usunPliki(klucze: string[]): Promise<void> {
    for (const k of klucze) {
      await this.storage.removeObject(ObjectBuckets.KREATOR_ZASOBY, k).catch((e: unknown) => this.logger.warn(`Usunięcie ${k}: ${String(e)}`));
    }
  }

  private klucz(): string {
    const k = this.config.get<string>('appKmsKey');
    if (!k) throw new ServiceUnavailableException('Zdjęcia są chwilowo niedostępne.');
    return k;
  }

  private adresApi(): string {
    return (this.config.get<string>('PUBLIC_API_URL') ?? this.config.get<string>('API_BASE_URL') ?? 'https://api.verris.pl').replace(/\/+$/, '');
  }
}

const mb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.round(b / 1048576)} MB`);

/** credits.txt: autor, licencja i źródło zdjęć z bibliotek zewnętrznych (bez danych konta). */
export function creditsTxt(zasoby: Pick<KreatorZasob, 'id' | 'zrodlo' | 'autor' | 'licencja' | 'licencjaUrl' | 'zrodloUrl'>[]): string {
  const linie = ['Zdjęcia z bibliotek – autorzy i licencje', ''];
  for (const z of [...zasoby].sort((a, b) => a.id.localeCompare(b.id))) {
    linie.push(`${z.id}: ${z.autor ?? 'autor nieznany'} – ${ZRODLO_MODELU[z.zrodlo]}, licencja ${z.licencja ?? '?'}${z.licencjaUrl ? ` (${z.licencjaUrl})` : ''}${z.zrodloUrl ? `, ${z.zrodloUrl}` : ''}`);
  }
  return `${linie.join('\n')}\n`;
}
