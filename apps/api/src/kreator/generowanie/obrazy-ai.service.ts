import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AiInteractionStatus, Prisma } from '@verris/database';
import { PLANY_KREATORA, migrujModel, walidujStrone, type Obraz, type Strona, type WersjaKreatora } from '@verris/kreator';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiProviderService } from '../../ai/ai-provider.service.js';
import { FUNKCJA_AI_KREATORA, FUNKCJA_AI_OBRAZU, miesiacUtc, type KonfiguracjaKreatora } from '../konfiguracja.js';
import { KreatorService } from '../kreator.service.js';
import { KreatorZasobyService } from '../zasoby.service.js';
import { BladGeneratora, KOMUNIKATY_GENERATORA, type GeneratorObrazow, type Proporcje } from './generator.js';
import { budujZapytaniePromptu, kontekstStrony, odczytajPrompt } from './prompt-obrazu.js';
import type { DostawcaObrazowAi } from '../konfiguracja.js';

export const GENERATORY_OBRAZOW = Symbol('GENERATORY_OBRAZOW');

/**
 * Decyzja (paczka 124): generowanie SYNCHRONICZNE z limitem czasu – jak zmiana AI (≤ 90 s) i import z biblioteki,
 * bez zadania w tle: wynik (1–4 warianty) jest potrzebny w otwartym oknie wyboru zdjęcia, a zamknięcie okna nie
 * zostawia „sierot” do sprzątania. Prompt (Anthropic) ma osobny limit, generowanie u dostawcy obrazów – 90 s.
 */
export const TIMEOUT_PROMPTU_MS = 30_000;
export const TIMEOUT_GENEROWANIA_MS = 90_000;
/** Jednocześnie generujących kont na jednej replice API (koszt i limit aktywnych zadań u dostawcy). */
export const MAKS_ROWNOLEGLYCH = 6;

export const WKROTCE = KOMUNIKATY_GENERATORA.wylaczony;
const BLAD_AI = 'Kreator AI jest chwilowo niedostępny – spróbuj ponownie za chwilę.';
const ZAJETE = 'Poprzednie zdjęcia jeszcze się generują – poczekaj chwilę.';

export interface StanObrazowAi {
  dostepne: boolean;
  powod: string | null;
  limit: number;
  zuzyte: number;
  pozostalo: number;
  /** Ile wariantów da następne „Wygeneruj” (≤ pozostalo). */
  warianty: number;
}

/**
 * Verris Kreator – zdjęcia generowane przez AI (paczka 124). Kolejność: dostęp i włącznik → budżet platformy →
 * rezerwacja limitu miesiąca (atomowo, przed jakimkolwiek kosztem) → prompt przez Anthropic (odmowa = 422 i zwrot
 * limitu) → dostawca obrazów → import jak wgranie (KreatorZasobyService.zapiszWygenerowany). Limit konta zużywają
 * obrazy dostarczone i odrzucone przez moderację dostawcy (to skutek opisu klienta, a dostawca je liczy); błędy po
 * naszej stronie i u dostawcy limit zwracają. Koszt obrazów: AiInteractionLog (funkcja 'kreator-obraz', cena za
 * obraz z konfiguracji × obrazy rozliczone przez dostawcę), tokeny promptu – jak zmiany AI kreatora.
 */
@Injectable()
export class KreatorObrazyAiService {
  private readonly logger = new Logger(KreatorObrazyAiService.name);
  private readonly wToku = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly kreator: KreatorService,
    private readonly zasoby: KreatorZasobyService,
    @Inject(GENERATORY_OBRAZOW) private readonly generatory: GeneratorObrazow[],
  ) {}

  /** Generator z konfiguracji – albo null, gdy wyłączony (przełącznik admina albo brak klucza). */
  generator(konf: KonfiguracjaKreatora): GeneratorObrazow | null {
    if (!konf.obrazyAi.wlaczone) return null;
    const g = this.generatory.find((x) => x.nazwa === konf.obrazyAi.dostawca);
    return g?.wlaczony() ? g : null;
  }

  /** Czy dostawca ma klucz (admin – tylko tak/nie). */
  maKlucz(dostawca: DostawcaObrazowAi): boolean {
    return !!this.generatory.find((x) => x.nazwa === dostawca)?.wlaczony();
  }

  /** GET /kreator/zasoby/generuj – czy zakładka działa i ile zdjęć zostało w miesiącu. */
  async stan(userId: string): Promise<StanObrazowAi> {
    const { wersja, konf } = await this.wersja(userId);
    const plan = PLANY_KREATORA[wersja];
    const w = await this.prisma.kreatorZuzycie.findUnique({ where: { userId_miesiac: { userId, miesiac: miesiacUtc() } }, select: { obrazyAi: true } });
    const zuzyte = w?.obrazyAi ?? 0;
    const pozostalo = Math.max(0, plan.obrazowAiMies - zuzyte);
    const dostepne = !!this.generator(konf);
    return { dostepne, powod: dostepne ? null : WKROTCE, limit: plan.obrazowAiMies, zuzyte, pozostalo, warianty: Math.min(plan.wariantowObrazuAi, pozostalo) };
  }

  /** POST /kreator/zasoby/generuj */
  async generuj(userId: string, actorUserId: string, dto: { opis: string; stronaId: string; proporcje?: Proporcje; sciezkaObrazu?: string }) {
    const { wersja, konf } = await this.wersja(userId);
    const generator = this.generator(konf);
    if (!generator) throw new ServiceUnavailableException(WKROTCE);
    const strona = await this.strona(userId, dto.stronaId);
    const proporcje = dto.proporcje ?? obrazPodSciezka(strona, dto.sciezkaObrazu)?.proporcje ?? '4:3';
    if (await this.provider.budzetPlatformyWyczerpanyTeraz()) throw new ServiceUnavailableException(KOMUNIKATY_GENERATORA.blad);
    if (this.wToku.has(userId)) throw new ConflictException(ZAJETE);
    if (this.wToku.size >= MAKS_ROWNOLEGLYCH) throw new ServiceUnavailableException(KOMUNIKATY_GENERATORA.limit);
    this.wToku.add(userId);
    try {
      return await this.wykonaj({ userId, actorUserId, wersja, konf, generator, strona, proporcje, opis: dto.opis, stronaId: dto.stronaId });
    } finally {
      this.wToku.delete(userId);
    }
  }

  private async wykonaj(z: {
    userId: string;
    actorUserId: string;
    wersja: WersjaKreatora;
    konf: KonfiguracjaKreatora;
    generator: GeneratorObrazow;
    strona: Strona;
    proporcje: Proporcje;
    opis: string;
    stronaId: string;
  }) {
    const plan = PLANY_KREATORA[z.wersja];
    const r = await this.rezerwuj(z.userId, plan.wariantowObrazuAi, plan.obrazowAiMies);
    if (!r) {
      throw new ForbiddenException(
        `Wykorzystano miesięczny limit zdjęć AI (${plan.obrazowAiMies}). Odnowi się 1. dnia miesiąca – do tego czasu wgraj zdjęcie albo wybierz je z biblioteki.`,
      );
    }
    let zuzyte = 0;
    try {
      // 1. Prompt (Anthropic, model zmian kreatora) – tokeny i koszt jak zmiany AI.
      const zap = budujZapytaniePromptu(z.opis, kontekstStrony(z.strona, z.proporcje));
      const odp = await this.provider
        .anthropicZBlokami({
          model: z.konf.modelZmian,
          system: zap.system,
          wiadomosci: zap.wiadomosci,
          maxTokens: zap.maxTokens,
          funkcja: FUNKCJA_AI_KREATORA,
          userId: z.userId,
          actorUserId: z.actorUserId,
          rodzaj: zap.rodzaj,
          timeoutMs: TIMEOUT_PROMPTU_MS,
        })
        .catch((e: unknown) => {
          this.logger.warn(`Prompt obrazu: ${e instanceof Error ? e.message : String(e)}`);
          throw new ServiceUnavailableException(BLAD_AI);
        });
      await this.kreator
        .dolicz(z.userId, { wej: odp.wej, wyj: odp.wyj, cacheZapis: odp.zapis5m + odp.zapis1h, cacheOdczyt: odp.odczyt, kosztUsd: odp.kosztUsd })
        .catch((e: unknown) => this.logger.error(`Zużycie kreatora: ${String(e)}`));
      const p = odczytajPrompt(odp.wynik);
      if (!p) throw new ServiceUnavailableException(BLAD_AI);
      if (!p.ok) throw new UnprocessableEntityException(p.powod);

      // 2. Dostawca obrazów – jeden termin dla wszystkich wariantów.
      const model = z.konf.obrazyAi.model;
      let obrazy: Buffer[] = [];
      let rozliczone = 0;
      let moderowane = 0;
      let bladG: BladGeneratora | null = null;
      try {
        const w = await z.generator.generuj({ prompt: p.prompt, proporcje: z.proporcje, ile: r.ile, model, sygnal: AbortSignal.timeout(TIMEOUT_GENEROWANIA_MS) });
        obrazy = w.obrazy.slice(0, r.ile).map((o) => o.dane);
        rozliczone = w.rozliczone;
        moderowane = w.moderowane;
      } catch (e) {
        bladG = e instanceof BladGeneratora ? e : new BladGeneratora('blad', KOMUNIKATY_GENERATORA.blad, String(e));
        rozliczone = bladG.rozliczone;
        if (bladG.kod === 'moderacja') moderowane = r.ile;
      }
      await this.dziennik(z, z.generator.nazwa, model, p.prompt, { rozliczone, udane: obrazy.length, moderowane, blad: bladG?.szczegoly ?? null });
      // Moderacja dostawcy zużywa limit (skutek opisu klienta), inne błędy – nie; obrazy – dopiero po zapisie.
      zuzyte = Math.min(r.ile, moderowane);
      if (bladG) {
        this.logger.warn(`Zdjęcie AI (${z.generator.nazwa}): ${bladG.kod} ${bladG.szczegoly}`);
        throw bladG.kod === 'moderacja' ? new UnprocessableEntityException(bladG.message) : new ServiceUnavailableException(bladG.message);
      }

      // 3. Import jak wgranie: sharp, warianty, XMP „trainedAlgorithmicMedia”, KreatorZasob ze źródłem AI.
      const zapisane = [];
      for (const dane of obrazy) {
        zapisane.push(await this.zasoby.zapiszWygenerowany(z.userId, z.wersja, dane, { stronaId: z.stronaId, alt: p.alt }));
        zuzyte = Math.min(r.ile, zuzyte + 1);
      }
      const pozostalo = Math.max(0, plan.obrazowAiMies - (r.poRezerwacji - r.ile + zuzyte));
      return {
        zasoby: zapisane,
        alt: p.alt,
        moderowane,
        limit: plan.obrazowAiMies,
        pozostalo,
      };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.logger.error(`Zdjęcie AI: ${e instanceof Error ? e.message : String(e)}`);
      throw new ServiceUnavailableException(KOMUNIKATY_GENERATORA.blad);
    } finally {
      if (r.ile > zuzyte) await this.zwolnij(z.userId, r.miesiac, r.ile - zuzyte).catch((e: unknown) => this.logger.error(`Zwrot limitu zdjęć AI: ${String(e)}`));
    }
  }

  /**
   * Atomowa rezerwacja `ile` = min(warianty planu, zostało) zdjęć w miesiącu. Warunek w UPDATE (obrazyAi ≤ limit − ile)
   * – dwa równoległe żądania nie przekroczą limitu; gdy drugie przegra wyścig, liczy „ile” jeszcze raz (raz).
   */
  async rezerwuj(userId: string, warianty: number, limit: number): Promise<{ miesiac: string; ile: number; poRezerwacji: number } | null> {
    const miesiac = miesiacUtc();
    try {
      await this.prisma.kreatorZuzycie.upsert({ where: { userId_miesiac: { userId, miesiac } }, create: { userId, miesiac }, update: {} });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
    for (let proba = 0; proba < 2; proba++) {
      const w = await this.prisma.kreatorZuzycie.findUnique({ where: { userId_miesiac: { userId, miesiac } }, select: { obrazyAi: true } });
      const zuzyte = w?.obrazyAi ?? 0;
      const ile = Math.min(warianty, limit - zuzyte);
      if (ile <= 0) return null;
      const r = await this.prisma.kreatorZuzycie.updateMany({
        where: { userId, miesiac, obrazyAi: { lte: limit - ile } },
        data: { obrazyAi: { increment: ile } },
      });
      if (r.count) return { miesiac, ile, poRezerwacji: zuzyte + ile };
    }
    return null;
  }

  async zwolnij(userId: string, miesiac: string, ile: number): Promise<void> {
    await this.prisma.kreatorZuzycie.updateMany({ where: { userId, miesiac, obrazyAi: { gte: ile } }, data: { obrazyAi: { decrement: ile } } });
  }

  /** Koszt obrazów w dzienniku AI (bez treści opisu klienta – tylko skrót promptu i liczby). */
  private async dziennik(
    z: { userId: string; actorUserId: string; konf: KonfiguracjaKreatora; proporcje: Proporcje; stronaId: string },
    dostawca: DostawcaObrazowAi,
    model: string,
    prompt: string,
    w: { rozliczone: number; udane: number; moderowane: number; blad: string | null },
  ): Promise<void> {
    await this.prisma.aiInteractionLog
      .create({
        data: {
          feature: FUNKCJA_AI_OBRAZU,
          provider: dostawca,
          model,
          promptHash: createHash('sha256').update(prompt).digest('hex'),
          userId: z.userId,
          actorUserId: z.actorUserId,
          status: w.udane ? AiInteractionStatus.COMPLETED : AiInteractionStatus.FAILED,
          costUsd: new Prisma.Decimal((w.rozliczone * z.konf.obrazyAi.cenaZaObrazUsd).toFixed(6)),
          inputSummary: { obrazy: w.rozliczone, udane: w.udane, moderowane: w.moderowane, proporcje: z.proporcje, stronaId: z.stronaId },
          ...(w.blad ? { errorMessage: w.blad.slice(0, 2000) } : {}),
        },
      })
      .catch((e: unknown) => this.logger.error(`Dziennik zdjęć AI: ${String(e)}`));
  }

  private async wersja(userId: string): Promise<{ wersja: WersjaKreatora; konf: KonfiguracjaKreatora }> {
    const d = await this.kreator.dostep(userId);
    if (!d.dostep) throw new ForbiddenException(d.powod);
    return d;
  }

  private async strona(userId: string, id: string): Promise<Strona> {
    const s = await this.prisma.kreatorStrona.findFirst({ where: { id, userId }, select: { model: true } });
    if (!s) throw new NotFoundException('Nie znaleziono strony.');
    const w = walidujStrone(migrujModel(s.model));
    if (!w.ok) throw new ConflictException('Strona nie jest jeszcze gotowa – poczekaj na koniec generowania.');
    return w.strona;
  }
}

/** Obiekt Obraz pod ścieżką kropkową modelu (np. 'strony.0.sekcje.2.dane.obraz'); śmieci → undefined. */
export function obrazPodSciezka(strona: Strona, sciezka: string | undefined): Obraz | undefined {
  if (!sciezka || !/^[a-zA-Z0-9]+(\.[a-zA-Z0-9]+){0,12}$/.test(sciezka)) return undefined;
  let v: unknown = strona;
  for (const k of sciezka.split('.')) {
    if (!v || typeof v !== 'object' || !Object.prototype.hasOwnProperty.call(v, k)) return undefined;
    v = (v as Record<string, unknown>)[k];
  }
  return v && typeof v === 'object' && 'proporcje' in v ? (v as Obraz) : undefined;
}
