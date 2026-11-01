import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';
import { AiInteractionStatus, Prisma } from '@verris/database';
import { LIMIT_WYSYLKI_PROBY } from '@verris/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CaptchaService } from '../../auth/captcha.service.js';
import { AiProviderService } from '../ai-provider.service.js';
import { KnowledgeBaseService } from '../knowledge-base.service.js';
import {
  FUNKCJA_ODPOWIEDZ,
  FUNKCJA_STRAZNIK,
  FUNKCJE_ASYSTENTA,
  KLUCZ_ASYSTENTA_WWW,
  LIMITY_ASYSTENTA,
  odczytajKonfiguracjeAsystenta,
  type KonfiguracjaAsystenta,
} from './konfiguracja.js';
import { BEZPIECZNA_ODPOWIEDZ, DOPISEK_PONOWNEJ_PROBY, sprawdzWhiteLabel } from './filtr-white-label.js';
import { ODPOWIEDZ_NIE_WIEM, ODPOWIEDZI_STRAZNIKA, PROMPT_STRAZNIKA, PROMPT_SYSTEMOWY } from './prompt.js';
import {
  blokZrodel,
  przyjmijZrodla,
  zrodloCennika,
  zrodlaFaktow,
  zrodlaSpecyfikacji,
  zrodlaWiedzy,
  type DaneCennika,
  type Zrodlo,
  type ZrodloPubliczne,
} from './zrodla.js';

export interface PytanieAsystenta {
  rozmowaId?: string;
  pytanie: string;
  captchaToken?: string;
}

export interface OdpowiedzAsystenta {
  rozmowaId: string;
  odpowiedz: string;
  zrodla: ZrodloPubliczne[];
  nieWiem: boolean;
}

/** Kody błędów dla widgetu (pole `kod` w treści odpowiedzi HTTP). */
export type KodBleduAsystenta = 'NIEDOSTEPNY' | 'BRAK_KONFIGURACJI' | 'CAPTCHA_WYMAGANA' | 'LIMIT_ROZMOWY' | 'LIMIT_DOBOWY';

const KOMUNIKAT_NIEDOSTEPNY =
  'Asystent jest chwilowo niedostępny. Zostaw numer w „Poproś o telefon” — oddzwonimy w dni robocze 9–17.';

function blad(status: HttpStatus, kod: KodBleduAsystenta, message: string): HttpException {
  return new HttpException({ statusCode: status, kod, message }, status);
}

type Kategoria = 'oferta' | 'instrukcje' | 'naduzycie' | 'spoza';

/** Model czasem owija JSON w ```json … ```. */
function parsujJson(t: string): unknown {
  const m = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(t);
  const tekst = (m ? m[1] : t).trim();
  try {
    return JSON.parse(tekst);
  } catch {
    const a = tekst.indexOf('{');
    const b = tekst.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(tekst.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Asystent AI na verris.pl (1.11.2026) — rozmowy przedsprzedażowe bez konta.
 *
 * Kolejność: wyłącznik → klucz → rozmowa (≤12 wymian) → captcha od 4. wiadomości → limit dobowy IP →
 * limity kosztu (dzień, miesiąc) → strażnik (Haiku: oferta / instrukcje / nadużycie / spoza) → źródła →
 * odpowiedź (Sonnet, JSON z id źródeł) → walidacja źródeł → filtr white label (jedna ponowna próba) → zapis.
 * Projekt: claude/asystent-ai-www.md; plansza „Asystent AI” w makiecie 1.11.
 */
@Injectable()
export class AsystentWwwService {
  private readonly logger = new Logger(AsystentWwwService.name);
  private konf: KonfiguracjaAsystenta | null = null;
  private konfAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly wiedza: KnowledgeBaseService,
    private readonly config: ConfigService,
    @Optional() private readonly captcha?: CaptchaService,
  ) {}

  async konfiguracja(): Promise<KonfiguracjaAsystenta> {
    if (this.konf && Date.now() - this.konfAt < 30_000) return this.konf;
    const row = await this.prisma.platformSetting.findUnique({ where: { key: KLUCZ_ASYSTENTA_WWW } }).catch(() => null);
    this.konf = odczytajKonfiguracjeAsystenta(row?.value);
    this.konfAt = Date.now();
    return this.konf;
  }

  wyczyscCache() {
    this.konf = null;
  }

  /** HMAC adresu IP — tylko do dobowego limitu, bez przechowywania IP. */
  ipHash(ip: string | undefined): string {
    const sol = this.config.get<string>('ASYSTENT_IP_SALT') || this.config.get<string>('jwtSecret') || 'verris-asystent';
    return createHmac('sha256', sol).update(ip || 'brak-ip').digest('hex');
  }

  /** Koszt asystenta od wskazanej chwili (USD) — z dziennika AI (te same wpisy co raport kosztów w adminie). */
  async kosztOd(od: Date): Promise<number> {
    const agg = await this.prisma.aiInteractionLog.aggregate({
      where: { feature: { in: FUNKCJE_ASYSTENTA }, createdAt: { gte: od } },
      _sum: { costUsd: true },
    });
    return Number(agg._sum.costUsd ?? 0);
  }

  /** null = mieści się; tekst = powód. Dzień i miesiąc liczone w UTC. */
  async limitKosztuPrzekroczony(konf: KonfiguracjaAsystenta, teraz = new Date()): Promise<string | null> {
    const dzien = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), teraz.getUTCDate()));
    const miesiac = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), 1));
    if (konf.limitDziennyUsd > 0 && (await this.kosztOd(dzien)) >= konf.limitDziennyUsd) return 'dzienny';
    if (konf.limitMiesiecznyUsd > 0 && (await this.kosztOd(miesiac)) >= konf.limitMiesiecznyUsd) return 'miesięczny';
    return null;
  }

  async zapytaj(
    dto: PytanieAsystenta,
    meta: { ip?: string },
    opcje: { ewaluacja?: boolean } = {},
  ): Promise<OdpowiedzAsystenta & { kosztUsd: number }> {
    const konf = await this.konfiguracja();
    if (!konf.wlaczony && !opcje.ewaluacja) throw blad(HttpStatus.SERVICE_UNAVAILABLE, 'NIEDOSTEPNY', KOMUNIKAT_NIEDOSTEPNY);
    if (!this.provider.klucz('anthropic')) {
      throw blad(HttpStatus.SERVICE_UNAVAILABLE, 'BRAK_KONFIGURACJI', 'Asystent AI nie jest jeszcze skonfigurowany. Napisz do nas albo poproś o telefon.');
    }

    const pytanie = (dto.pytanie ?? '').trim();
    if (!pytanie) throw new BadRequestException('Napisz pytanie.');
    if (pytanie.length > LIMITY_ASYSTENTA.maksZnakowPytania) {
      throw new BadRequestException(`Pytanie może mieć najwyżej ${LIMITY_ASYSTENTA.maksZnakowPytania} znaków.`);
    }

    const ipHash = this.ipHash(meta.ip);
    let rozmowa = dto.rozmowaId
      ? await this.prisma.asystentRozmowa.findUnique({
          where: { id: dto.rozmowaId },
          include: { wiadomosci: { orderBy: { createdAt: 'asc' } } },
        })
      : null;
    // Rozmowa z innego adresu albo po retencji — zaczynamy nową (nie ujawniamy cudzej historii).
    if (rozmowa && rozmowa.ipHash !== ipHash) rozmowa = null;

    if (rozmowa && rozmowa.liczbaWymian >= LIMITY_ASYSTENTA.maksWymianWRozmowie) {
      throw blad(
        HttpStatus.TOO_MANY_REQUESTS,
        'LIMIT_ROZMOWY',
        'Ta rozmowa jest już długa. Zacznij nową albo zostaw numer w „Poproś o telefon” — przekażemy ją człowiekowi.',
      );
    }

    const numerWiadomosci = (rozmowa?.liczbaWymian ?? 0) + 1;
    if (!opcje.ewaluacja && numerWiadomosci >= LIMITY_ASYSTENTA.captchaOdWiadomosci && this.captcha?.isEnabled()) {
      if (!dto.captchaToken) {
        throw blad(HttpStatus.BAD_REQUEST, 'CAPTCHA_WYMAGANA', 'Potwierdź, że nie jesteś botem, i wyślij pytanie jeszcze raz.');
      }
      await this.captcha.verify(dto.captchaToken, meta.ip, 'asystent');
    }

    if (!opcje.ewaluacja) {
      const dobaTemu = new Date(Date.now() - 24 * 3600_000);
      const zIp = await this.prisma.asystentWiadomosc.count({
        where: { rola: 'USER', createdAt: { gte: dobaTemu }, rozmowa: { ipHash } },
      });
      if (zIp >= LIMITY_ASYSTENTA.maksWiadomosciIpNaDobe) {
        throw blad(
          HttpStatus.TOO_MANY_REQUESTS,
          'LIMIT_DOBOWY',
          'Na dziś to już wszystkie pytania z tego adresu. Wróć jutro albo zostaw numer w „Poproś o telefon”.',
        );
      }
      if (await this.limitKosztuPrzekroczony(konf)) throw blad(HttpStatus.SERVICE_UNAVAILABLE, 'NIEDOSTEPNY', KOMUNIKAT_NIEDOSTEPNY);
    }

    if (!rozmowa) {
      const nowa = await this.prisma.asystentRozmowa.create({ data: { ipHash } });
      rozmowa = { ...nowa, wiadomosci: [] };
    }

    let koszt = 0;
    let wynik: { odpowiedz: string; zrodla: ZrodloPubliczne[]; nieWiem: boolean; model: string | null };
    try {
      const straznik = await this.klasyfikuj(konf, pytanie);
      koszt += straznik.koszt;
      if (straznik.kategoria !== 'oferta') {
        wynik = { odpowiedz: ODPOWIEDZI_STRAZNIKA[straznik.kategoria], zrodla: [], nieWiem: false, model: null };
      } else {
        const zrodla = await this.zrodla(pytanie);
        const historia = rozmowa.wiadomosci.slice(-12).map((w) => ({
          role: (w.rola === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: w.tresc,
        }));
        const r = await this.odpowiedz(konf, zrodla, historia, pytanie);
        koszt += r.koszt;
        wynik = { ...r, model: konf.model };
      }
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() !== HttpStatus.SERVICE_UNAVAILABLE) throw e;
      this.logger.warn(`asystent www: ${(e as Error).message}`);
      throw blad(HttpStatus.SERVICE_UNAVAILABLE, 'NIEDOSTEPNY', KOMUNIKAT_NIEDOSTEPNY);
    }

    await this.prisma.$transaction([
      this.prisma.asystentWiadomosc.create({ data: { rozmowaId: rozmowa.id, rola: 'USER', tresc: pytanie } }),
      this.prisma.asystentWiadomosc.create({
        data: {
          rozmowaId: rozmowa.id,
          rola: 'ASSISTANT',
          tresc: wynik.odpowiedz,
          zrodla: wynik.zrodla as unknown as Prisma.InputJsonValue,
          nieWiem: wynik.nieWiem,
          kosztUsd: koszt,
        },
      }),
      this.prisma.asystentRozmowa.update({
        where: { id: rozmowa.id },
        data: { liczbaWymian: { increment: 1 }, kosztUsd: { increment: koszt } },
      }),
    ]);

    return { rozmowaId: rozmowa.id, odpowiedz: wynik.odpowiedz, zrodla: wynik.zrodla, nieWiem: wynik.nieWiem, kosztUsd: koszt };
  }

  /** Źródła na to pytanie: cennik + specyfikacja + fakty (zawsze) i do 5 fragmentów bazy wiedzy CLIENT/ALL. */
  async zrodla(pytanie: string): Promise<Zrodlo[]> {
    const [plany, reguly, fragmenty] = await Promise.all([
      this.prisma.plan.findMany({
        where: { isActive: true, isPublic: true },
        select: { slug: true, productKind: true, priceMonthly: true, priceYearly: true, trialDays: true },
      }),
      this.prisma.autoscalingPriceRule.findMany({
        where: { isActive: true, thresholdAbove: 0 },
        select: { resource: true, pricePerUnit: true },
      }),
      this.wiedza.retrieve(pytanie, 'CLIENT', 5).catch(() => []),
    ]);
    const hosting = plany.find((p) => p.slug === 'verris-hosting') ?? plany.find((p) => p.productKind === 'HOSTING');
    const poczta = plany.find((p) => p.slug === 'poczta-standard') ?? plany.find((p) => p.productKind === 'EMAIL');
    const stawka = (r: string) => {
      const x = reguly.find((g) => g.resource === r);
      return x ? Number(x.pricePerUnit) : undefined;
    };
    const cennik: DaneCennika = {
      hosting: hosting
        ? { miesiecznie: Number(hosting.priceMonthly), rocznie: Number(hosting.priceYearly), trialDays: hosting.trialDays }
        : null,
      poczta: poczta ? { miesiecznie: Number(poczta.priceMonthly), rocznie: Number(poczta.priceYearly) } : null,
      stawki: { cpu: stawka('CPU'), ram: stawka('RAM'), dysk: stawka('DISK') },
    };
    return [
      zrodloCennika(cennik),
      ...zrodlaSpecyfikacji(),
      ...zrodlaFaktow(hosting?.trialDays ?? 0, LIMIT_WYSYLKI_PROBY),
      ...zrodlaWiedzy(fragmenty.map((f) => ({ docId: f.docId, title: f.title, content: f.content, sourceRef: f.sourceRef ?? null }))),
    ];
  }

  private async klasyfikuj(konf: KonfiguracjaAsystenta, pytanie: string): Promise<{ kategoria: Kategoria; koszt: number }> {
    const r = await this.provider.wywolajModelem({
      dostawca: 'anthropic',
      model: konf.modelStraznika,
      system: PROMPT_STRAZNIKA,
      messages: [{ role: 'user', content: `<wiadomosc>\n${pytanie}\n</wiadomosc>` }],
      json: true,
      maxTokens: 200,
    });
    await this.loguj(FUNKCJA_STRAZNIK, r, { chars: pytanie.length });
    const v = parsujJson(r.wynik) as { kategoria?: unknown } | null;
    const k = v?.kategoria;
    // Nieczytelna klasyfikacja → traktujemy jak ofertę: główny model ma te same zakazy i musi cytować źródła.
    const kategoria: Kategoria = k === 'instrukcje' || k === 'naduzycie' || k === 'spoza' ? k : 'oferta';
    return { kategoria, koszt: r.kosztUsd };
  }

  private async odpowiedz(
    konf: KonfiguracjaAsystenta,
    zrodla: Zrodlo[],
    historia: Array<{ role: 'user' | 'assistant'; content: string }>,
    pytanie: string,
  ): Promise<{ odpowiedz: string; zrodla: ZrodloPubliczne[]; nieWiem: boolean; koszt: number }> {
    const system = `${PROMPT_SYSTEMOWY}\n\n<zrodla>\n${blokZrodel(zrodla)}\n</zrodla>`;
    let koszt = 0;
    let dopisek = '';
    for (let proba = 0; proba < 2; proba++) {
      const r = await this.provider.wywolajModelem({
        dostawca: 'anthropic',
        model: konf.model,
        system: dopisek ? `${system}\n\n${dopisek}` : system,
        messages: [...historia, { role: 'user', content: pytanie }],
        json: true,
        maxTokens: 1500,
      });
      koszt += r.kosztUsd;
      await this.loguj(FUNKCJA_ODPOWIEDZ, r, { chars: pytanie.length, zrodla: zrodla.length, proba });
      const v = parsujJson(r.wynik) as { odpowiedz?: unknown; zrodla?: unknown; nieWiem?: unknown } | null;
      const tekst = typeof v?.odpowiedz === 'string' ? v.odpowiedz.trim() : '';
      const przyjete = przyjmijZrodla(v?.zrodla, zrodla);
      const nieWiem = v?.nieWiem === true || !tekst || przyjete.length === 0;
      // Bez cytowanego źródła odpowiedź nie trafia do klienta — zamiast niej standardowe „nie wiem”.
      const odpowiedz = nieWiem ? ODPOWIEDZ_NIE_WIEM : tekst;
      if (sprawdzWhiteLabel(odpowiedz).ok) return { odpowiedz, zrodla: nieWiem ? [] : przyjete, nieWiem, koszt };
      this.logger.warn(`asystent www: filtr white label (${sprawdzWhiteLabel(odpowiedz).powody.join(', ')}), próba ${proba + 1}`);
      dopisek = DOPISEK_PONOWNEJ_PROBY;
    }
    return { odpowiedz: BEZPIECZNA_ODPOWIEDZ, zrodla: [], nieWiem: true, koszt };
  }

  private async loguj(
    feature: string,
    r: { dostawca: string; model: string; wej: number; wyj: number; kosztUsd: number; wynik: string },
    podsumowanie: Record<string, number>,
  ) {
    await this.prisma.aiInteractionLog
      .create({
        data: {
          feature,
          provider: r.dostawca,
          model: r.model,
          inputTokens: r.wej,
          outputTokens: r.wyj,
          costUsd: r.kosztUsd,
          status: AiInteractionStatus.COMPLETED,
          // Bez treści pytań w dzienniku kosztów — treść żyje tylko w rozmowie (retencja 30 dni).
          promptHash: createHash('sha256').update(`${feature}:${r.wynik.length}:${Date.now()}`).digest('hex'),
          inputSummary: podsumowanie as Prisma.InputJsonValue,
        },
      })
      .catch((e) => this.logger.warn(`asystent www: dziennik AI: ${(e as Error).message}`));
  }

  /** Transkrypt rozmowy do maila „Poproś o telefon” (przekazanie do człowieka). */
  async transkrypt(rozmowaId: string): Promise<string | null> {
    const r = await this.prisma.asystentRozmowa.findUnique({
      where: { id: rozmowaId },
      include: { wiadomosci: { orderBy: { createdAt: 'asc' } } },
    });
    if (!r) return null;
    return r.wiadomosci.map((w) => `${w.rola === 'USER' ? 'Klient' : 'Asystent'}: ${w.tresc}`).join('\n\n');
  }

  /** Retencja: rozmowy starsze niż 30 dni (od ostatniej wiadomości) — usuwane z wiadomościami (cascade). */
  async usunStare(teraz = new Date()): Promise<number> {
    const granica = new Date(teraz.getTime() - LIMITY_ASYSTENTA.retencjaDni * 86_400_000);
    const r = await this.prisma.asystentRozmowa.deleteMany({ where: { updatedAt: { lt: granica } } });
    return r.count;
  }

  /** Admin: ostatnie rozmowy (podgląd jakości). */
  async ostatnieRozmowy(ile = 30) {
    const lista = await this.prisma.asystentRozmowa.findMany({
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(ile, 1), 100),
      include: { wiadomosci: { orderBy: { createdAt: 'asc' }, select: { rola: true, tresc: true, zrodla: true, nieWiem: true, createdAt: true } } },
    });
    return lista.map((r) => ({
      id: r.id,
      utworzona: r.createdAt,
      ostatnia: r.updatedAt,
      wymiany: r.liczbaWymian,
      kosztUsd: Number(r.kosztUsd),
      wiadomosci: r.wiadomosci,
    }));
  }
}
