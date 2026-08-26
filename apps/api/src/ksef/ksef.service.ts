import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Invoice, KsefStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { FaXmlValidationError } from './fa-xml.types';
import { buildFa3Xml } from './fa3-xml.builder';
import { KsefV2Client } from './ksef-v2.client';
import {
  stanTerminu,
  terminPrzeslania,
  type TrybWystawienia,
} from './ksef-tryby';
import { InvoicingProvider } from './invoicing-provider.interface';

const BATCH_LIMIT = 25;

/**
 * KSEF-05 — okno automatycznego dokwalifikowania zaległych faktur.
 *
 * Wcześniej `tick()` przestawiał na `PENDING` KAŻDĄ fakturę `NOT_APPLICABLE`,
 * bez ograniczenia daty i bez potwierdzenia. Pierwszy przebieg po włączeniu
 * KSeF kolejkował całą historię i zaczynał ją wysyłać partiami po 25 —
 * a przy `KSEF_ENV` domyślnie `'test'` szła ona na środowisko testowe MF,
 * z panelem pokazującym „wysłane".
 *
 * Automat łapie teraz wyłącznie świeże pominięcia (np. `enqueueInvoice` nie
 * wykonał się z powodu błędu przy finalizacji). Wszystko starsze wymaga
 * świadomej decyzji operatora — `zakwalifikujZalegle`, z podglądem liczby
 * dokumentów PRZED wysyłką.
 */
const OKNO_AUTO_KATCHUPU_DNI = 7;

/**
 * B-1 — orkiestracja KSeF.
 *
 * Kwalifikacja: faktury własne Verris (provider=null, numeracja VFV/…),
 * wystawione (issuedAt) — Stripe-hosted pozostają NOT_APPLICABLE (Stripe jest
 * wystawcą tych dokumentów; jeśli prawnik zdecyduje inaczej, zmiana = jedna
 * linia w `qualifies()`).
 *
 * Tryb offline — SKREŚLONA OBIETNICA (KSEF-04). Do 2026-08-26 stało tu, że
 * „wysyłka zostaje w PENDING i jest ponawiana, a przepisy przewidują dosłanie".
 * Część o dosłaniu jest prawdziwa. Reszta pomijała wszystko, co przepisy
 * wymagają WOBEC NABYWCY, i zapewniała o zgodności, której nie było — czyli
 * zniechęcała do sprawdzenia.
 *
 * Stan faktyczny po M-16:
 *  - niedostępność KSeF jest ZAPISYWANA (`KsefStatus.OFFLINE` + `ksefTryb`),
 *    a nie tylko logowana; terminy per tryb liczy `ksef-tryby.ts`,
 *  - klasyfikacja zdarzenia (offline24 / niedostępność / awaria) należy do
 *    człowieka, bo wynika z ogłoszenia w BIP MF, którego nie czytamy,
 *  - NADAL BRAK kodów QR na fakturze przekazywanej nabywcy poza KSeF
 *    (KOD I jest w zasięgu, KOD II wymaga certyfikatu KSeF typu 2 z portalu MF).
 *    Dopóki ich nie ma, tryb offline nie jest dla nas w pełni dostępny —
 *    i to musi być widoczne, a nie ciche. Patrz `docs/zadania/M-16-M-17-*`.
 *
 * REJECTED wymaga interwencji (alert w logu + audyt + widoczne w adminie).
 */
@Injectable()
export class KsefService {
  private readonly logger = new Logger(KsefService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly settings: PlatformSettingsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Config — z ustawień admina (DB) z fallbackiem env
  // ---------------------------------------------------------------------------

  async isEnabled(): Promise<boolean> {
    const rt = await this.settings.getKsefRuntimeConfig();
    return rt.enabled;
  }

  /** Bazowy adres KSeF 2.0 (/api/v2) dla środowiska; KSEF_BASE_URL nadpisuje. */
  private baseUrlForEnv(env: 'test' | 'demo' | 'prod'): string {
    const override = this.config.get<string>('KSEF_BASE_URL');
    if (override) return override;
    const host =
      env === 'prod'
        ? 'https://api.ksef.mf.gov.pl'
        : env === 'demo'
          ? 'https://api-demo.ksef.mf.gov.pl'
          : 'https://api-test.ksef.mf.gov.pl';
    return `${host}/api/v2`;
  }

  async configStatus() {
    const rt = await this.settings.getKsefRuntimeConfig();
    return {
      enabled: rt.enabled,
      env: rt.env,
      baseUrl: this.baseUrlForEnv(rt.env),
      nipSet: Boolean(rt.nip),
      tokenSet: Boolean(rt.token),
    };
  }

  private async buildClient(): Promise<InvoicingProvider | null> {
    const rt = await this.settings.getKsefRuntimeConfig();
    if (!rt.nip || !rt.token) return null;
    return new KsefV2Client({
      baseUrl: this.baseUrlForEnv(rt.env),
      nip: rt.nip.replace(/\D/g, ''),
      token: rt.token,
    });
  }

  // ---------------------------------------------------------------------------
  // Kwalifikacja nowych faktur (wołane przy finalizacji + przez cron catch-up)
  // ---------------------------------------------------------------------------

  private qualifies(inv: Pick<Invoice, 'provider' | 'issuedAt' | 'netAmount'>): boolean {
    return inv.provider == null && inv.issuedAt != null && inv.netAmount != null;
  }

  /** Oznacza fakturę jako PENDING do wysyłki (idempotentne). */
  async enqueueInvoice(invoiceId: string): Promise<void> {
    if (!(await this.isEnabled())) return;
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv || !this.qualifies(inv)) return;
    if (inv.ksefStatus !== KsefStatus.NOT_APPLICABLE) return;
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { ksefStatus: KsefStatus.PENDING },
    });
  }

  // ---------------------------------------------------------------------------
  // Scheduler
  // ---------------------------------------------------------------------------

  /** Co 10 min: dokwalifikuj zaległe, wyślij PENDING, sprawdź SUBMITTED. */
  @Cron('0 */10 * * * *', { name: 'ksef:submit-cycle' })
  async tick(): Promise<void> {
    if (!(await this.isEnabled())) return;

    // Catch-up OGRANICZONY OKNEM (KSEF-05) — łapie pominięte `enqueueInvoice`
    // z ostatnich dni, nie całą historię. Zaległości starsze niż okno
    // kolejkuje wyłącznie `zakwalifikujZalegle` wywołane przez operatora.
    const odKiedyAuto = new Date(Date.now() - OKNO_AUTO_KATCHUPU_DNI * 24 * 60 * 60 * 1000);
    await this.prisma.invoice.updateMany({
      where: {
        ksefStatus: KsefStatus.NOT_APPLICABLE,
        provider: null,
        issuedAt: { not: null, gte: odKiedyAuto },
        netAmount: { not: null },
      },
      data: { ksefStatus: KsefStatus.PENDING },
    });

    const client = await this.buildClient();
    if (!client) {
      this.logger.warn('KSeF włączony, ale konfiguracja niepełna (NIP/token/klucz publiczny).');
      return;
    }

    const pending = await this.prisma.invoice.findMany({
      where: {
        ksefStatus: { in: [KsefStatus.PENDING, KsefStatus.SUBMITTED, KsefStatus.OFFLINE] },
      },
      orderBy: { issuedAt: 'asc' },
      take: BATCH_LIMIT,
    });
    if (pending.length === 0) return;

    try {
      await client.openSession();
    } catch (err) {
      // M-16 — KSeF nie odpowiada. Do dziś w tym miejscu było tylko ostrzeżenie
      // w logu, a faktury zostawały w `PENDING` nieodróżnialne od tych, których
      // cykl po prostu nie zdążył wysłać. Teraz zapisujemy FAKT, który
      // zaobserwowaliśmy, i termin liczony najostrożniej z możliwych.
      await this.oznaczNiedostepnosc(pending, err);
      return;
    }

    let sent = 0;
    let accepted = 0;
    let rejected = 0;
    try {
      for (const inv of pending) {
        try {
          if (
            inv.ksefStatus === KsefStatus.PENDING ||
            inv.ksefStatus === KsefStatus.OFFLINE
          ) {
            await this.submitOne(client, inv);
            sent += 1;
          } else if (inv.ksefStatus === KsefStatus.SUBMITTED && inv.ksefElementRef) {
            const result = await this.checkOne(client, inv);
            if (result === 'accepted') accepted += 1;
            if (result === 'rejected') rejected += 1;
          }
        } catch (err) {
          // Błąd pojedynczej faktury nie zatrzymuje partii.
          this.logger.error(
            `KSeF: faktura ${inv.number} — ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } finally {
      await client.terminateSession();
    }

    if (sent || accepted || rejected) {
      this.logger.log(`KSeF cycle: sent=${sent} accepted=${accepted} rejected=${rejected}`);
    }
  }

  private async submitOne(client: InvoicingProvider, inv: Invoice): Promise<void> {
    // M-06 — korekta musi nieść numer i datę faktury korygowanej. Te dane
    // siedzą na dokumencie pierwotnym, nie na korekcie, więc trzeba je
    // doczytać. Bez nich builder odmówi — i słusznie: korekta bez wskazania,
    // co koryguje, zostałaby przez KSeF przyjęta jako nowa sprzedaż.
    let korygowana: { number: string; issuedAt: Date | null } | null = null;
    if (inv.kind === 'KOREKTA' && inv.correctedId) {
      korygowana = await this.prisma.invoice.findUnique({
        where: { id: inv.correctedId },
        select: { number: true, issuedAt: true },
      });
    }

    let xml: string;
    try {
      ({ xml } = buildFa3Xml({
        invoice: {
          ...inv,
          correctedNumber: korygowana?.number ?? null,
          correctedIssuedAt: korygowana?.issuedAt ?? null,
        },
        systemInfo: 'Verris Panel',
      }));
    } catch (err) {
      if (err instanceof FaXmlValidationError) {
        // Dane faktury niekompletne — REJECTED lokalnie, wymaga poprawy danych.
        await this.markRejected(inv, `Walidacja lokalna: ${err.message}`);
        return;
      }
      throw err;
    }

    try {
      const { elementReferenceNumber } = await client.sendInvoice(xml);
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: {
          ksefStatus: KsefStatus.SUBMITTED,
          ksefElementRef: elementReferenceNumber,
          ksefSubmittedAt: new Date(),
          ksefError: null,
        },
      });
      await this.audit.record({
        action: 'KSEF_INVOICE_SUBMITTED',
        userId: inv.userId,
        details: { invoiceId: inv.id, number: inv.number, elementReferenceNumber },
      });
    } catch (err) {
      const httpStatus = (err as { httpStatus?: number }).httpStatus;
      if (httpStatus && httpStatus < 500) {
        // 4xx przy wysyłce = problem z dokumentem, nie z dostępnością.
        await this.markRejected(inv, (err as Error).message);
        return;
      }
      throw err; // 5xx / sieć → zostaje PENDING, retry w kolejnym cyklu.
    }
  }

  private async checkOne(
    client: InvoicingProvider,
    inv: Invoice,
  ): Promise<'accepted' | 'rejected' | 'pending'> {
    const status = await client.invoiceStatus(inv.ksefElementRef!);
    if (status.processed && status.ksefReferenceNumber) {
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: {
          ksefStatus: KsefStatus.ACCEPTED,
          ksefNumber: status.ksefReferenceNumber,
          ksefAcceptedAt: status.acquisitionTimestamp
            ? new Date(status.acquisitionTimestamp)
            : new Date(),
          ksefError: null,
        },
      });
      await this.audit.record({
        action: 'KSEF_INVOICE_ACCEPTED',
        userId: inv.userId,
        details: { invoiceId: inv.id, number: inv.number, ksefNumber: status.ksefReferenceNumber },
      });
      return 'accepted';
    }
    if (status.rejected) {
      await this.markRejected(
        inv,
        `KSeF ${status.statusCode}: ${status.statusDescription ?? 'odrzucono'}`,
      );
      return 'rejected';
    }
    return 'pending';
  }

  /**
   * M-16 — zapisuje, że faktury nie poszły z powodu niedostępności KSeF.
   *
   * Świadomie WĄSKIE wykrywanie: reagujemy wyłącznie na nieudane otwarcie sesji,
   * bo to jedyny sygnał jednoznacznie mówiący „KSeF nie odpowiada". Błąd 5xx na
   * pojedynczej fakturze zostawia ją w `PENDING` — może znaczyć niedostępność,
   * ale równie dobrze problem z tym jednym dokumentem, a zgadywanie zapisałoby
   * w rejestrze tryb prawny, którego nikt nie potwierdził.
   *
   * Tryb `NIESKLASYFIKOWANY` nie jest kategorią z przepisów. Rozróżnienie
   * offline24 / niedostępność / awaria wynika z ogłoszenia w BIP MF, którego nie
   * czytamy — więc do czasu klasyfikacji liczymy termin NAJKRÓTSZY z możliwych.
   */
  private async oznaczNiedostepnosc(faktury: Invoice[], err: unknown): Promise<void> {
    const teraz = new Date();
    const tryb: TrybWystawienia = 'NIESKLASYFIKOWANY';
    const powod = err instanceof Error ? err.message : String(err);

    let oznaczone = 0;
    for (const inv of faktury) {
      if (inv.ksefStatus === KsefStatus.SUBMITTED) continue; // już w KSeF, czeka na numer
      const wystawiono = inv.issuedAt ?? inv.createdAt;
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: {
          ksefStatus: KsefStatus.OFFLINE,
          ksefTryb: tryb,
          // Pierwsza obserwacja zostaje — kolejne cykle jej nie nadpisują,
          // inaczej przerwa trwająca dobę wyglądałaby na dziesięciominutową.
          ksefNiedostepnoscOd: inv.ksefNiedostepnoscOd ?? teraz,
          ksefTerminDo: terminPrzeslania({ tryb, wystawiono }),
          ksefError: `Niedostępność KSeF: ${powod}`.slice(0, 2000),
        },
      });
      oznaczone += 1;
    }

    this.logger.warn(
      `KSeF niedostępny — ${oznaczone} faktur(y) oznaczone jako OFFLINE ` +
        `(tryb do zaklasyfikowania): ${powod}`,
    );
    if (oznaczone > 0) {
      await this.audit.record({
        action: 'KSEF_NIEDOSTEPNOSC',
        details: { liczbaFaktur: oznaczone, powod: powod.slice(0, 500) },
      });
    }
  }

  /**
   * M-16 — faktury, którym minął ustawowy termin przesłania do KSeF.
   *
   * Liczone przez `stanTerminu`, nie przez `ksefTerminDo === null`, bo `null`
   * znaczy dwie różne rzeczy: brak obowiązku (online, awaria całkowita) albo
   * termin nieznany (awaria bez znanej daty zakończenia przerwy). Pomylenie
   * tych dwóch stanów to ta sama wada co w X-35, X-39 i PANEL-01.
   */
  async fakturyPoTerminie(teraz: Date = new Date()) {
    const kandydaci = await this.prisma.invoice.findMany({
      where: { ksefStatus: { in: [KsefStatus.OFFLINE, KsefStatus.PENDING] } },
      select: {
        id: true,
        number: true,
        issuedAt: true,
        createdAt: true,
        ksefTryb: true,
        ksefPrzerwaDo: true,
      },
    });

    const poTerminie = [];
    let nieznane = 0;
    for (const f of kandydaci) {
      const tryb = (f.ksefTryb ?? 'ONLINE') as TrybWystawienia;
      const stan = stanTerminu(
        {
          tryb,
          wystawiono: f.issuedAt ?? f.createdAt,
          przerwaZakonczona: f.ksefPrzerwaDo,
        },
        teraz,
      );
      if (stan === 'nieznany') nieznane += 1;
      if (stan === 'po-terminie') {
        poTerminie.push({ id: f.id, number: f.number, tryb });
      }
    }
    return { poTerminie, nieznane };
  }

  private async markRejected(inv: Invoice, reason: string): Promise<void> {
    await this.prisma.invoice.update({
      where: { id: inv.id },
      data: { ksefStatus: KsefStatus.REJECTED, ksefError: reason.slice(0, 2000) },
    });
    await this.audit.record({
      action: 'KSEF_INVOICE_REJECTED',
      userId: inv.userId,
      details: { invoiceId: inv.id, number: inv.number, reason: reason.slice(0, 500) },
    });
    this.logger.error(`KSeF REJECTED ${inv.number}: ${reason}`);
  }

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  async adminOverview() {
    const [counts, recentRejected] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['ksefStatus'],
        _count: { _all: true },
      }),
      this.prisma.invoice.findMany({
        where: { ksefStatus: KsefStatus.REJECTED },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, number: true, ksefError: true, updatedAt: true },
      }),
    ]);
    return {
      config: await this.configStatus(),
      counts: Object.fromEntries(counts.map((c) => [c.ksefStatus, c._count._all])),
      recentRejected: recentRejected.map((r) => ({
        id: r.id,
        number: r.number,
        error: r.ksefError,
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }

  /**
   * Admin: pobierz UPO przyjętej faktury (XML podpisany przez MF).
   * Statusy sesji/faktur w KSeF 2.0 nie podlegają retencji, więc UPO jest
   * dostępne na żądanie — nie przechowujemy go lokalnie.
   */
  async downloadUpo(invoiceId: string): Promise<{ number: string; upoXml: string }> {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv || inv.ksefStatus !== KsefStatus.ACCEPTED || !inv.ksefElementRef) {
      throw new Error('UPO dostępne tylko dla faktur przyjętych przez KSeF.');
    }
    const client = await this.buildClient();
    if (!client) throw new Error('KSeF nieskonfigurowany (NIP/token).');
    await client.openSession();
    try {
      const upoXml = await client.downloadUpo(inv.ksefElementRef);
      return { number: inv.number, upoXml };
    } finally {
      await client.terminateSession();
    }
  }

  /** Admin: ponów odrzuconą fakturę po poprawie danych. */
  async retryInvoice(invoiceId: string, actorUserId: string) {
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { ksefStatus: KsefStatus.PENDING, ksefError: null, ksefElementRef: null },
    });
    await this.audit.record({
      action: 'KSEF_INVOICE_RETRY',
      actorUserId,
      details: { invoiceId },
    });
    return { ok: true as const };
  }
}
