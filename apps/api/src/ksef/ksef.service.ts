import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Invoice, KsefStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import { FaXmlValidationError } from './fa-xml.types.js';
import { buildFa3Xml } from './fa3-xml.builder.js';
import { KsefV2Client } from './ksef-v2.client.js';
import {
  stanTerminu,
  terminPrzeslania,
  type TrybWystawienia,
} from './ksef-tryby.js';
import { RODZAJ_FAKTURA_VAT, rodzajKwalifikujeDoKsef, toNumerPanelu } from '../billing/tryb-fakturowania.js';
import { SERIA_FAKTURY, SERIA_KOREKTY } from '../billing/faktura-za-portfel.js';
import { formaZaplatyFaktury } from '../billing/forma-zaplaty.js';
import { InvoicingProvider } from './invoicing-provider.interface.js';
import {
  linkWeryfikacjiKsef,
  normalizujSrodowiskoKsef,
  skrotFakturyBase64Url,
  type SrodowiskoKsef,
} from './kod-qr-ksef.js';
import { wizualizacjaFa3 } from './wizualizacja-fa3.js';
import { renderujFaktureKsef } from './faktura-ksef-pdf.js';

const BATCH_LIMIT = 25;
/** Dzierżawa wysyłki faktury — dłuższa niż najdłuższy cykl (25 × 30 s). */
const DZIERZAWA_WYSYLKI_MS = 15 * 60 * 1000;

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

/** Serie faktur VAT nadawane przez panel — tylko one idą do KSeF (VDR/VDK to dokumenty rozliczeniowe). */
const SERIE_VAT_PANELU: readonly string[] = [SERIA_FAKTURY, SERIA_KOREKTY];

/**
 * Statusy, w których faktura ma (albo za chwilę będzie miała) swój plik w KSeF — wtedy PDF dla
 * klienta jest wizualizacją tego pliku z kodem QR. Numer KSeF pod kodem, gdy jest; „OFFLINE”,
 * gdy faktura jest w drodze. REJECTED i NOT_APPLICABLE: PDF z magazynu, bez kodu.
 */
export const STATUSY_Z_PLIKIEM_KSEF: readonly KsefStatus[] = [
  KsefStatus.PENDING,
  KsefStatus.SUBMITTED,
  KsefStatus.OFFLINE,
  KsefStatus.ACCEPTED,
];

/**
 * Korekta faktury, która jest już w drodze do KSeF, ale nie ma jeszcze numeru. FA(3) każe wskazać
 * numer KSeF faktury korygowanej (`NrKSeFFaKorygowanej`); wpisanie `NrKSeFN` („poza KSeF”) byłoby
 * nieprawdą. Korekta czeka na kolejny cykl.
 */
export class KorygowanaBezNumeruKsef extends Error {}

export interface PlikFakturyKsef {
  xml: string;
  /** SHA-256 bajtów `xml` w Base64URL. */
  sha256: string;
  srodowisko: SrodowiskoKsef;
}

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
 *  - KOD I (link weryfikacyjny, `kod-qr-ksef.ts`) jest na PDF-ie faktury od 2026-10-12:
 *    numer KSeF pod kodem albo „OFFLINE”, gdy numeru jeszcze nie ma. NADAL BRAK KODU II
 *    (wymaga certyfikatu KSeF typu Offline z portalu MF) — więc tryby offline nie są dla
 *    nas w pełni dostępne i to musi być widoczne, a nie ciche. Patrz `docs/zadania/M-16-M-17-*`.
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

  /**
   * Do 2026-10-12 warunkiem było `provider == null` — a każda faktura panelu ma dostawcę
   * (WALLET, WALLET_TOPUP, MANUAL, STRIPE, korekta dziedziczy po pierwotnej). Do KSeF nie
   * kwalifikowała się więc ŻADNA faktura. O tym, kto wystawił fakturę, mówi numer: seria VAT
   * panelu (VFV/VFK) = wystawił panel, więc faktura idzie do KSeF — także opłacona kartą
   * (Stripe pobiera pieniądze, nie wystawia faktury VAT) i także dla nabywcy bez NIP (B2C,
   * decyzja właściciela 2026-10-12; w XML `BrakID=1`). `storageKey` = faktura sfinalizowana
   * (ma komplet snapshotów) — wcześniej catch-up łapał też niesfinalizowane i odrzucał je
   * lokalnie za brak NIP sprzedawcy.
   */
  private qualifies(
    inv: Pick<Invoice, 'number' | 'issuedAt' | 'netAmount' | 'rodzajPrawny' | 'storageKey'>,
  ): boolean {
    // FAK-01: dokument rozliczeniowy nigdy nie idzie do KSeF-u — wysłany,
    // stałby się fakturą obok faktury z programu księgowego.
    return (
      inv.issuedAt != null &&
      inv.netAmount != null &&
      inv.storageKey != null &&
      rodzajKwalifikujeDoKsef(inv.rodzajPrawny) &&
      toNumerPanelu(inv.number, SERIE_VAT_PANELU)
    );
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
        // Te same warunki co `qualifies()`.
        ksefStatus: KsefStatus.NOT_APPLICABLE,
        issuedAt: { not: null, gte: odKiedyAuto },
        netAmount: { not: null },
        storageKey: { not: null },
        rodzajPrawny: RODZAJ_FAKTURA_VAT,
        OR: SERIE_VAT_PANELU.map((seria) => ({ number: { startsWith: `${seria}/` } })),
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
        rodzajPrawny: RODZAJ_FAKTURA_VAT,
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
          // Zajęcie wysyłki (dzierżawa 15 min w ksefSubmittedAt = ostatnia próba). Cykl co 10 min może
          // trwać dłużej (25 faktur × do 30 s przy wolnym KSeF) i nakładać się na kolejny — bez tego obie
          // tury wysyłały tę samą fakturę: duplikat w KSeF, a odrzucenie duplikatu nadpisywało przyjętą
          // fakturę statusem REJECTED. Sprawdzanie statusu (SUBMITTED) jest idempotentne — bez zajęcia.
          if (inv.ksefStatus === KsefStatus.PENDING || inv.ksefStatus === KsefStatus.OFFLINE) {
            const zajeta = await this.prisma.invoice.updateMany({
              where: {
                id: inv.id,
                ksefStatus: { in: [KsefStatus.PENDING, KsefStatus.OFFLINE] },
                OR: [{ ksefSubmittedAt: null }, { ksefSubmittedAt: { lt: new Date(Date.now() - DZIERZAWA_WYSYLKI_MS) } }],
              },
              data: { ksefSubmittedAt: new Date() },
            });
            if (zajeta.count === 0) continue;
          }
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

  /**
   * Plik faktury dla KSeF — budowany RAZ i zapisywany (`ksefXml`). KOD I zawiera skrót
   * dokładnych bajtów pliku, a XML nie jest odtwarzalny (DataWytworzeniaFa), więc wysyłka,
   * ponowienia po niedostępności i PDF dla klienta muszą używać tego samego zapisu —
   * inaczej kod QR na PDF-ie pobranym przed wysyłką wskazywałby inny plik niż ten w KSeF.
   */
  async zapewnijPlik(inv: Invoice): Promise<PlikFakturyKsef> {
    if (inv.ksefXml && inv.ksefXmlSha256) {
      return { xml: inv.ksefXml, sha256: inv.ksefXmlSha256, srodowisko: normalizujSrodowiskoKsef(inv.ksefSrodowisko) };
    }

    // M-06 — korekta musi nieść numer i datę faktury korygowanej (a w FA(3) także jej numer
    // KSeF albo znacznik „poza KSeF”). Te dane siedzą na dokumencie pierwotnym.
    let korygowana: { number: string; issuedAt: Date | null; ksefNumber: string | null; ksefStatus: KsefStatus } | null = null;
    if (inv.kind === 'KOREKTA' && inv.correctedId) {
      korygowana = await this.prisma.invoice.findUnique({
        where: { id: inv.correctedId },
        select: { number: true, issuedAt: true, ksefNumber: true, ksefStatus: true },
      });
      if (korygowana && !korygowana.ksefNumber && STATUSY_Z_PLIKIEM_KSEF.includes(korygowana.ksefStatus)) {
        throw new KorygowanaBezNumeruKsef(
          `Faktura korygowana ${korygowana.number} czeka na numer KSeF — korekta pójdzie po nim.`,
        );
      }
    }

    const { xml } = buildFa3Xml({
      invoice: {
        ...inv,
        correctedNumber: korygowana?.number ?? null,
        correctedIssuedAt: korygowana?.issuedAt ?? null,
        correctedKsefNumber: korygowana?.ksefNumber ?? null,
      },
      systemInfo: 'Verris Panel',
      platnosc: (await formaZaplatyFaktury(this.prisma, inv)).fa,
    });
    const sha256 = skrotFakturyBase64Url(xml);
    const { env } = await this.settings.getKsefRuntimeConfig();
    const zapis = await this.prisma.invoice.updateMany({
      where: { id: inv.id, ksefXml: null },
      data: { ksefXml: xml, ksefXmlSha256: sha256, ksefSrodowisko: env },
    });
    if (zapis.count === 0) {
      // Równoległe pobranie PDF-u albo cykl wysyłki zapisał plik pierwszy — obowiązuje tamten.
      const teraz = await this.prisma.invoice.findUniqueOrThrow({
        where: { id: inv.id },
        select: { ksefXml: true, ksefXmlSha256: true, ksefSrodowisko: true },
      });
      return { xml: teraz.ksefXml!, sha256: teraz.ksefXmlSha256!, srodowisko: normalizujSrodowiskoKsef(teraz.ksefSrodowisko) };
    }
    return { xml, sha256, srodowisko: env };
  }

  private async submitOne(client: InvoicingProvider, inv: Invoice): Promise<void> {
    let plik: PlikFakturyKsef;
    try {
      plik = await this.zapewnijPlik(inv);
    } catch (err) {
      if (err instanceof FaXmlValidationError) {
        // Dane faktury niekompletne — REJECTED lokalnie, wymaga poprawy danych.
        await this.markRejected(inv, `Walidacja lokalna: ${err.message}`);
        return;
      }
      if (err instanceof KorygowanaBezNumeruKsef) {
        this.logger.log(`KSeF: ${inv.number} — ${err.message}`);
        return;
      }
      throw err;
    }

    try {
      // Wysyłamy DOKŁADNIE zapisany plik — ten, którego skrót jest w kodzie QR.
      const { elementReferenceNumber } = await client.sendInvoice(plik.xml);
      const { env } = await this.settings.getKsefRuntimeConfig();
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: {
          ksefStatus: KsefStatus.SUBMITTED,
          ksefElementRef: elementReferenceNumber,
          ksefSubmittedAt: new Date(),
          ksefError: null,
          // Środowisko, do którego plik faktycznie poszedł — od niego zależy adres QR.
          ksefSrodowisko: env,
        },
      });
      await this.audit.record({
        action: 'KSEF_INVOICE_SUBMITTED',
        userId: inv.userId,
        details: { invoiceId: inv.id, number: inv.number, elementReferenceNumber, sha256: plik.sha256 },
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

  /**
   * Plik KSeF faktury do wizualizacji (PDF z kodem QR) i do pobrania przez klienta — albo `null`,
   * gdy faktura nie idzie do KSeF, została odrzucona albo jej pliku nie da się jeszcze zbudować
   * (wtedy obowiązuje PDF z magazynu).
   */
  async plikDoWizualizacji(invoiceId: string): Promise<(PlikFakturyKsef & { numerKsef: string | null; przyjeto: Date | null; numer: string }) | null> {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv || !STATUSY_Z_PLIKIEM_KSEF.includes(inv.ksefStatus)) return null;
    try {
      const plik = await this.zapewnijPlik(inv);
      return { ...plik, numerKsef: inv.ksefNumber, przyjeto: inv.ksefAcceptedAt, numer: inv.number };
    } catch (err) {
      if (err instanceof FaXmlValidationError || err instanceof KorygowanaBezNumeruKsef) {
        this.logger.warn(`KSeF: brak pliku do wizualizacji ${inv.number} — ${err.message}`);
        return null;
      }
      throw err;
    }
  }

  /** PDF faktury = wizualizacja zapisanego XML FA(3) + KOD I. `null` — patrz `plikDoWizualizacji`. */
  async pdfFaktury(invoiceId: string): Promise<Uint8Array | null> {
    const plik = await this.plikDoWizualizacji(invoiceId);
    if (!plik) return null;
    const wiz = wizualizacjaFa3(plik.xml);
    return renderujFaktureKsef(wiz, {
      numerKsef: plik.numerKsef,
      przyjetoWKsef: plik.przyjeto,
      linkWeryfikacji: linkWeryfikacjiKsef(plik.srodowisko, wiz.sprzedawca.nip ?? '', wiz.dataWystawienia, plik.sha256),
      srodowisko: plik.srodowisko,
    });
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

    const poTerminie: Array<{ id: string; number: string; tryb: TrybWystawienia }> = [];
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
    // Tylko odrzucona faktura wraca do wysyłki. Wcześniej „ponów” działało na każdej — także przyjętej
    // albo czekającej na numer KSeF — i wysyłało ją drugi raz (duplikat w KSeF).
    const r = await this.prisma.invoice.updateMany({
      where: { id: invoiceId, ksefStatus: KsefStatus.REJECTED },
      // Plik budujemy od nowa — ponowienie następuje po poprawie danych, a stary plik KSeF odrzucił.
      data: {
        ksefStatus: KsefStatus.PENDING,
        ksefError: null,
        ksefElementRef: null,
        ksefSubmittedAt: null,
        ksefXml: null,
        ksefXmlSha256: null,
        ksefSrodowisko: null,
      },
    });
    if (r.count === 0) {
      throw new ConflictException('Ponowić można tylko fakturę odrzuconą przez KSeF.');
    }
    await this.audit.record({
      action: 'KSEF_INVOICE_RETRY',
      actorUserId,
      details: { invoiceId },
    });
    return { ok: true as const };
  }
}
