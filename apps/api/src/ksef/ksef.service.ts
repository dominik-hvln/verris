import { createHash } from 'crypto';
import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Invoice, KsefStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import { FaXmlValidationError, formatDateOnly } from './fa-xml.types.js';
import { buildFa3Xml } from './fa3-xml.builder.js';
import { walidujFa3Xsd } from './fa3-xsd.js';
import { KsefV2Client, type PamiecTokenowKsef, type UwierzytelnienieKsef } from './ksef-v2.client.js';
import {
  stanTerminu,
  terminPrzeslania,
  wymagaKodowQr,
  type TrybWystawienia,
} from './ksef-tryby.js';
import { statusFakturyKsef } from './ksef-statusy.js';
import { podpiszKodII, wczytajCertyfikat, wczytajKluczPrywatny } from './ksef-certyfikat.js';
import { RODZAJ_FAKTURA_VAT, rodzajKwalifikujeDoKsef, toNumerPanelu } from '../billing/tryb-fakturowania.js';
import { SERIA_FAKTURY, SERIA_KOREKTY } from '../billing/faktura-za-portfel.js';
import { formaZaplatyFaktury } from '../billing/forma-zaplaty.js';
import { InvoicingProvider } from './invoicing-provider.interface.js';
import {
  daneLinkuZPliku,
  linkKoduII,
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
 * Odpowiedzi 4xx wysyłki (POST /sessions/online/{ref}/invoices: 400, 401, 403, 429 wg open-api.json
 * https://github.com/CIRFMF/ksef-docs/blob/main/open-api.json), które NIE są odrzuceniem dokumentu:
 * 401/403 — uwierzytelnienie i uprawnienia kontekstu, 429 — limity API (limity/limity.md).
 */
const STATUSY_PRZEJSCIOWE_WYSYLKI: readonly number[] = [401, 403, 429];

/**
 * KSeF 07.11 — faktura „do wyjaśnienia” (wysyłka bez odpowiedzi) wraca do wysyłki sama po tym czasie.
 * Bezpieczne, bo KSeF pilnuje unikalności (NIP sprzedawcy + rodzaj + P_2, faktury/weryfikacja-faktury.md):
 * jeśli pierwsza wysyłka doszła, druga dostaje kod 440 z numerem KSeF pierwotnej, a serwis przyjmuje go
 * po sprawdzeniu, że skrót pliku się zgadza (`rozstrzygnijDuplikat`).
 */
const PONOWIENIE_NIEPEWNEJ_MS = 30 * 60 * 1000;

/** Ponowienia z narastającą przerwą: 10, 20, 40, 80 min, potem co 2 h; blisko terminu dosłania — co cykl. */
const BACKOFF_BAZA_MS = 10 * 60 * 1000;
const BACKOFF_MAKS_MS = 2 * 60 * 60 * 1000;
const BLISKO_TERMINU_MS = 6 * 60 * 60 * 1000;
export function nastepnaProba(proby: number, teraz: Date, terminDo: Date | null): Date {
  let przerwa = Math.min(BACKOFF_BAZA_MS * 2 ** Math.max(0, proby - 1), BACKOFF_MAKS_MS);
  if (terminDo && terminDo.getTime() - teraz.getTime() < BLISKO_TERMINU_MS) przerwa = BACKOFF_BAZA_MS;
  return new Date(teraz.getTime() + przerwa);
}

/** Faktura, której automat nie rusza, dopóki operator jej nie rozstrzygnie (np. duplikat z innym plikiem). */
export const CZEKA_NA_OPERATORA = new Date('9999-12-31T00:00:00.000Z');

/** Alarm o terminie dosłania: gdy do terminu zostało mniej niż tyle; powtórka najwcześniej po `ALARM_POWTORKA_MS`. */
const ALARM_PRZED_TERMINEM_MS = 12 * 60 * 60 * 1000;
const ALARM_POWTORKA_MS = 6 * 60 * 60 * 1000;

/** Progi (dni do końca ważności), przy których zespół dostaje przypomnienie o certyfikacie KSeF. */
const PROGI_WAZNOSCI_DNI = [30, 14, 7, 3, 1, 0];

/** Tryb wystawienia poza KSeF (offline) — wtedy `offlineMode: true` i dwa kody QR (tryby-offline.md). */
export function trybOffline(tryb: string | null | undefined): boolean {
  return Boolean(tryb) && tryb !== 'ONLINE' && wymagaKodowQr(tryb as TrybWystawienia);
}

const b64urlNaB64 = (s: string) => Buffer.from(s, 'base64url').toString('base64');

/**
 * Czy błąd otwarcia sesji znaczy „KSeF niedostępny” (M-16: tryb offline, termin dosłania), a nie odrzucone
 * uwierzytelnienie. Niedostępność: brak odpowiedzi (sieć, limit czasu — bez kodu HTTP), 5xx i 429 (limity).
 * Odpowiedź 4xx albo status uwierzytelnienia ≥ 400 (HTTP 200) to błąd tokenu / uprawnień po naszej stronie.
 */
export function bladDostepnosciKsef(err: unknown): boolean {
  const httpStatus = (err as { httpStatus?: number } | null)?.httpStatus;
  return httpStatus === undefined || httpStatus >= 500 || httpStatus === 429;
}

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
const poczatekOknaAuto = () => new Date(Date.now() - OKNO_AUTO_KATCHUPU_DNI * 24 * 60 * 60 * 1000);

/** Serie faktur VAT nadawane przez panel — tylko one idą do KSeF (VDR/VDK to dokumenty rozliczeniowe). */
const SERIE_VAT_PANELU: readonly string[] = [SERIA_FAKTURY, SERIA_KOREKTY];

/** Faktury VAT panelu, które powinny iść do KSeF, a nie są w kolejce — te same warunki co `qualifies()`. */
function warunekNiezakolejkowanych(wystawiono: { gte?: Date; lt?: Date }) {
  return {
    ksefStatus: KsefStatus.NOT_APPLICABLE,
    issuedAt: { not: null, ...wystawiono },
    netAmount: { not: null },
    storageKey: { not: null },
    rodzajPrawny: RODZAJ_FAKTURA_VAT,
    OR: SERIE_VAT_PANELU.map((seria) => ({ number: { startsWith: `${seria}/` } })),
  };
}

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
  // Mogła już dojść do KSeF z tym plikiem (jego skrót jest w kodzie QR) — plik zostaje.
  KsefStatus.UNCERTAIN,
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
 *  - automat przyjmuje sam wyłącznie offline24 (tryby-offline.md: bez ogłoszenia MF, najkrótszy
 *    termin); niedostępność / awaria wynikają z ogłoszenia w BIP MF, którego nie czytamy,
 *  - KOD I (link weryfikacyjny, `kod-qr-ksef.ts`) jest na PDF-ie faktury od 2026-10-12:
 *    numer KSeF pod kodem albo „OFFLINE”, gdy numeru jeszcze nie ma. KOD II („CERTYFIKAT”) od
 *    2026-11-07 na fakturach offline — wymaga certyfikatu KSeF typu Offline w ustawieniach; jego
 *    brak widać w go/no-go i w Admin → KSeF. Patrz `docs/zadania/M-16-M-17-*`.
 *
 * KSeF 07.11 — pełna automatyka: uwierzytelnienie certyfikatem (XAdES) albo tokenem z pamięcią tokenów
 * i odświeżaniem, walidacja XSD przed wysyłką, backoff ponowień, 429 → wstrzymanie, duplikat 440 →
 * numer pierwotnej po zgodności skrótu, „do wyjaśnienia” wraca sama po 30 min, UPO pobierane
 * automatycznie, alarmy o terminach dosłania i ważności certyfikatów.
 *
 * REJECTED wymaga interwencji (alert w logu + audyt + widoczne w adminie).
 */
@Injectable()
export class KsefService {
  private readonly logger = new Logger(KsefService.name);
  /** Tokeny KSeF (access/refresh) per środowisko+NIP+poświadczenie — tylko w pamięci procesu. */
  private readonly pamieciTokenow = new Map<string, PamiecTokenowKsef>();
  /** HTTP 429 z `Retry-After` — do tej chwili cykle nie wołają KSeF (limity/limity-api.md). */
  private wstrzymanoDo = 0;
  /** Ostatni cykl — do podglądu w Admin → KSeF. */
  private ostatniCykl: { koniec: string; wyslane: number; przyjete: number; odrzucone: number; upo: number; blad: string | null } | null = null;

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
      metoda: rt.metoda ?? 'token',
      certyfikatSet: Boolean(rt.certyfikat),
      certyfikatOfflineSet: Boolean(rt.certyfikatOffline),
    };
  }

  /**
   * Klient KSeF i środowisko, do którego faktycznie wysyła. Przegląd 15.10: środowisko czytane ponownie przy
   * każdej fakturze rozjeżdżało się z adresem klienta, gdy admin przełączył TEST → PROD w trakcie cyklu (plik
   * szedł do TEST, a w bazie lądowało `prod`). Cykl używa jednego, zapamiętanego tutaj.
   */
  private async buildClient(): Promise<{ client: InvoicingProvider; env: SrodowiskoKsef } | null> {
    const rt = await this.settings.getKsefRuntimeConfig();
    if (!rt.nip) return null;
    // KSeF 07.11 — certyfikat KSeF (XAdES) albo token; bez wybranego poświadczenia klient nie powstaje.
    let uwierzytelnienie: UwierzytelnienieKsef;
    let identyfikator: string;
    if (rt.metoda === 'certyfikat') {
      if (!rt.certyfikat) return null;
      uwierzytelnienie = {
        metoda: 'certyfikat',
        certyfikatPem: rt.certyfikat.pem,
        kluczPem: rt.certyfikat.kluczPem,
        typIdentyfikatora: rt.certyfikat.typIdentyfikatora,
      };
      identyfikator = rt.certyfikat.pem;
    } else {
      if (!rt.token) return null;
      uwierzytelnienie = { metoda: 'token', token: rt.token };
      identyfikator = rt.token;
    }
    const nip = rt.nip.replace(/\D/g, '');
    // Klucz pamięci tokenów: zmiana środowiska, NIP-u albo poświadczenia = nowe uwierzytelnienie.
    const kluczPamieci = createHash('sha256').update(`${rt.env}|${nip}|${uwierzytelnienie.metoda}|${identyfikator}`).digest('hex');
    let pamiec = this.pamieciTokenow.get(kluczPamieci);
    if (!pamiec) {
      this.pamieciTokenow.clear();
      pamiec = { tokeny: null };
      this.pamieciTokenow.set(kluczPamieci, pamiec);
    }
    return {
      client: new KsefV2Client({ baseUrl: this.baseUrlForEnv(rt.env), nip, uwierzytelnienie, pamiec }),
      env: normalizujSrodowiskoKsef(rt.env),
    };
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

  /**
   * Co 10 min: dokwalifikuj zaległe, oznacz spóźnione jako offline, zaalarmuj o terminach, wyślij
   * PENDING/OFFLINE (i „do wyjaśnienia” po 30 min), sprawdź SUBMITTED, pobierz UPO przyjętych.
   * Normalny tryb nie wymaga żadnego kroku człowieka.
   */
  @Cron('0 */10 * * * *', { name: 'ksef:submit-cycle' })
  async tick(): Promise<void> {
    if (!(await this.isEnabled())) return;
    const teraz = new Date();

    // Catch-up OGRANICZONY OKNEM (KSEF-05) — łapie pominięte `enqueueInvoice`
    // z ostatnich dni, nie całą historię. Zaległości starsze niż okno
    // kolejkuje wyłącznie `zakwalifikujZalegle` wywołane przez operatora.
    await this.prisma.invoice.updateMany({
      where: warunekNiezakolejkowanych({ gte: poczatekOknaAuto() }),
      data: { ksefStatus: KsefStatus.PENDING },
    });
    await this.oznaczSpoznione(teraz);
    // Alarm PRZED wysyłką — ma zadziałać także wtedy, gdy KSeF albo uwierzytelnienie leży.
    await this.alarmujTerminy(teraz);

    if (Date.now() < this.wstrzymanoDo) {
      this.logger.warn(`KSeF: cykl pominięty – limit żądań (429), wstrzymane do ${new Date(this.wstrzymanoDo).toISOString()}.`);
      return;
    }

    const zbudowany = await this.buildClient();
    if (!zbudowany) {
      this.logger.warn('KSeF włączony, ale konfiguracja niepełna (NIP/token albo certyfikat).');
      return;
    }
    const { client, env: envCyklu } = zbudowany;

    const pending = await this.prisma.invoice.findMany({
      where: {
        rodzajPrawny: RODZAJ_FAKTURA_VAT,
        // Przegląd poprawek 15.10: korekta odrzuconej faktury czeka na jej „Ponów” — nie zajmuje miejsca w partii
        // (25 najstarszych), bo kilka takich zatrzymałoby wysyłkę wszystkich nowszych.
        NOT: { corrected: { ksefStatus: KsefStatus.REJECTED } },
        AND: [
          {
            OR: [
              { ksefStatus: { in: [KsefStatus.PENDING, KsefStatus.SUBMITTED, KsefStatus.OFFLINE] } },
              // KSeF 07.11 — „do wyjaśnienia” wraca sama po 30 min (duplikat rozpozna kod 440).
              { ksefStatus: KsefStatus.UNCERTAIN, ksefSubmittedAt: { lt: new Date(teraz.getTime() - PONOWIENIE_NIEPEWNEJ_MS) } },
            ],
          },
          // Backoff: faktura po nieudanej próbie czeka na swój termin ponowienia.
          { OR: [{ ksefNastepnaProba: null }, { ksefNastepnaProba: { lt: teraz } }] },
        ],
      },
      orderBy: { issuedAt: 'asc' },
      take: BATCH_LIMIT,
    });
    // UPO przyjętych faktur — pobierane raz i trzymane w bazie (klient i admin nie wołają KSeF na żądanie).
    const czekajaceNaUpo = () =>
      this.prisma.invoice.findMany({
        where: {
          ksefStatus: KsefStatus.ACCEPTED,
          ksefUpo: null,
          ksefElementRef: { not: null },
          OR: [{ ksefNastepnaProba: null }, { ksefNastepnaProba: { lt: new Date() } }],
        },
        orderBy: { ksefAcceptedAt: 'asc' },
        take: BATCH_LIMIT,
      });
    if (pending.length === 0 && (await czekajaceNaUpo()).length === 0) return;

    try {
      await client.openSession();
    } catch (err) {
      if (this.wstrzymajPrzyLimicie(err)) return;
      // Przegląd 15.10: odrzucony token / uprawnienia (4xx z KSeF, status uwierzytelnienia ≥ 400) to błąd
      // konfiguracji po naszej stronie, nie niedostępność KSeF — bez wpisu o przerwie i bez trybu offline.
      if (!bladDostepnosciKsef(err)) {
        const powod = err instanceof Error ? err.message : String(err);
        this.logger.error(`KSeF: uwierzytelnienie odrzucone – sprawdź token/certyfikat i uprawnienia (faktury czekają): ${powod}`);
        await this.audit.record({ action: 'KSEF_UWIERZYTELNIENIE_ODRZUCONE', details: { powod: powod.slice(0, 500) } });
        // Przegląd poprawek 15.10: bez śladu na fakturach kolejka stała po cichu (np. token PROD bez uprawnień
        // w dniu przełączenia) — powód widać na fakturze i w Ustawienia → Firma → KSeF („czekają z błędem”).
        await this.zapiszBladWKolejce(pending, `Uwierzytelnienie KSeF odrzucone – sprawdź token/certyfikat i uprawnienia: ${powod}`);
        this.ostatniCykl = { koniec: new Date().toISOString(), wyslane: 0, przyjete: 0, odrzucone: 0, upo: 0, blad: powod.slice(0, 300) };
        return;
      }
      // M-16 — KSeF nie odpowiada. Do dziś w tym miejscu było tylko ostrzeżenie
      // w logu, a faktury zostawały w `PENDING` nieodróżnialne od tych, których
      // cykl po prostu nie zdążył wysłać. Teraz zapisujemy FAKT, który
      // zaobserwowaliśmy, i termin liczony najostrożniej z możliwych.
      await this.oznaczNiedostepnosc(pending, err);
      this.ostatniCykl = { koniec: new Date().toISOString(), wyslane: 0, przyjete: 0, odrzucone: 0, upo: 0, blad: `KSeF niedostępny: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300) };
      return;
    }

    let sent = 0;
    let accepted = 0;
    let rejected = 0;
    let upo = 0;
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
          } else if (inv.ksefStatus === KsefStatus.UNCERTAIN) {
            const zajeta = await this.prisma.invoice.updateMany({
              where: { id: inv.id, ksefStatus: KsefStatus.UNCERTAIN, ksefSubmittedAt: { lt: new Date(Date.now() - PONOWIENIE_NIEPEWNEJ_MS) } },
              data: { ksefSubmittedAt: new Date() },
            });
            if (zajeta.count === 0) continue;
          }
          if (
            inv.ksefStatus === KsefStatus.PENDING ||
            inv.ksefStatus === KsefStatus.OFFLINE ||
            inv.ksefStatus === KsefStatus.UNCERTAIN
          ) {
            await this.submitOne(client, inv, envCyklu);
            sent += 1;
          } else if (inv.ksefStatus === KsefStatus.SUBMITTED && inv.ksefElementRef) {
            const result = await this.checkOne(client, inv);
            if (result === 'accepted') accepted += 1;
            if (result === 'rejected') rejected += 1;
          }
        } catch (err) {
          if (this.wstrzymajPrzyLimicie(err)) break;
          // Błąd pojedynczej faktury nie zatrzymuje partii.
          this.logger.error(
            `KSeF: faktura ${inv.number} – ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      // Po sprawdzeniu statusów — także faktury przyjęte w tym cyklu (ich sesja jest już zamknięta).
      for (const inv of Date.now() < this.wstrzymanoDo ? [] : await czekajaceNaUpo()) {
        try {
          if (await this.pobierzUpo(client, inv)) upo += 1;
        } catch (err) {
          if (this.wstrzymajPrzyLimicie(err)) break;
        }
      }
    } finally {
      await client.terminateSession();
    }

    this.ostatniCykl = { koniec: new Date().toISOString(), wyslane: sent, przyjete: accepted, odrzucone: rejected, upo, blad: null };
    if (sent || accepted || rejected || upo) {
      this.logger.log(`KSeF cycle: sent=${sent} accepted=${accepted} rejected=${rejected} upo=${upo}`);
    }
  }

  /** HTTP 429: wstrzymanie cykli na czas z `Retry-After` (domyślnie 60 s). `true` = to był limit. */
  private wstrzymajPrzyLimicie(err: unknown): boolean {
    if ((err as { httpStatus?: number } | null)?.httpStatus !== 429) return false;
    const s = (err as { retryAfterS?: number }).retryAfterS ?? 60;
    this.wstrzymanoDo = Math.max(this.wstrzymanoDo, Date.now() + s * 1000);
    this.logger.warn(`KSeF: limit żądań (429) – wstrzymuję wywołania na ${s} s.`);
    return true;
  }

  /**
   * KSeF 07.11 — faktura, która nie trafiła do KSeF w dniu wystawienia (P_1), jest fakturą offline:
   * KSeF i tak oznaczy ją jako offline (offline/automatyczne-okreslanie-trybu-offline.md — dzień P_1
   * wcześniejszy niż dzień przyjęcia), a termin przesłania to następny dzień roboczy po dacie wystawienia
   * (tryb offline24, tryby-offline.md). Zapisujemy to jawnie: termin, alarm, `offlineMode` i KOD II.
   */
  private async oznaczSpoznione(teraz: Date): Promise<void> {
    const dzis = formatDateOnly(teraz);
    const kandydaci = await this.prisma.invoice.findMany({
      where: { ksefStatus: KsefStatus.PENDING, rodzajPrawny: RODZAJ_FAKTURA_VAT, issuedAt: { lt: teraz } },
      select: { id: true, number: true, issuedAt: true, createdAt: true, ksefTryb: true, ksefPrzerwaDo: true },
    });
    for (const f of kandydaci) {
      const wystawiono = f.issuedAt ?? f.createdAt;
      if (formatDateOnly(wystawiono) >= dzis) continue;
      const tryb = (f.ksefTryb && f.ksefTryb !== 'ONLINE' ? f.ksefTryb : 'OFFLINE24') as TrybWystawienia;
      await this.prisma.invoice.updateMany({
        where: { id: f.id, ksefStatus: KsefStatus.PENDING },
        data: {
          ksefStatus: KsefStatus.OFFLINE,
          ksefTryb: tryb,
          ksefTerminDo: terminPrzeslania({ tryb, wystawiono, przerwaZakonczona: f.ksefPrzerwaDo }),
        },
      });
      this.logger.warn(`KSeF: ${f.number} nie trafiła do KSeF w dniu wystawienia – tryb ${tryb}, termin dosłania liczony.`);
    }
  }

  /**
   * KSeF 07.11 — alarm do zespołu, gdy termin dosłania faktury offline się zbliża (mniej niż 12 h) albo
   * minął. Jedno powiadomienie na partię, powtórka najwcześniej po 6 h (`ksefAlertTerminuAt`).
   */
  async alarmujTerminy(teraz: Date = new Date()): Promise<number> {
    const faktury = await this.prisma.invoice.findMany({
      where: {
        ksefStatus: { in: [KsefStatus.PENDING, KsefStatus.OFFLINE, KsefStatus.UNCERTAIN] },
        ksefTerminDo: { lt: new Date(teraz.getTime() + ALARM_PRZED_TERMINEM_MS) },
        OR: [{ ksefAlertTerminuAt: null }, { ksefAlertTerminuAt: { lt: new Date(teraz.getTime() - ALARM_POWTORKA_MS) } }],
      },
      orderBy: { ksefTerminDo: 'asc' },
      select: { id: true, number: true, ksefTerminDo: true },
    });
    if (faktury.length === 0) return 0;
    const poTerminie = faktury.filter((f) => f.ksefTerminDo! < teraz);
    const lista = faktury.slice(0, 5).map((f) => `${f.number} (do ${f.ksefTerminDo!.toISOString().slice(0, 16).replace('T', ' ')} UTC)`).join(', ');
    await this.powiadomAdminow(
      poTerminie.length > 0
        ? `KSeF: ${poTerminie.length} ${poTerminie.length === 1 ? 'faktura' : 'faktur'} po terminie dosłania`
        : `KSeF: termin dosłania ${faktury.length === 1 ? 'faktury' : 'faktur'} offline mija w ciągu 12 h`,
      `Faktury jeszcze nie są w KSeF: ${lista}${faktury.length > 5 ? ', …' : ''}. Automat ponawia wysyłkę co 10 minut – sprawdź powód w Ustawienia → Firma → KSeF (uwierzytelnienie, dostępność KSeF).`,
      '/settings/company#ksef',
      'warning',
    );
    await this.prisma.invoice.updateMany({ where: { id: { in: faktury.map((f) => f.id) } }, data: { ksefAlertTerminuAt: teraz } });
    await this.audit.record({ action: 'KSEF_ALARM_TERMINU', details: { liczba: faktury.length, poTerminie: poTerminie.length } });
    return faktury.length;
  }

  private async powiadomAdminow(title: string, body: string, link: string, severity: 'warning' | 'critical' = 'warning'): Promise<void> {
    const admini = await this.prisma.user.findMany({ where: { role: 'ADMIN', loginBlocked: false }, select: { id: true } });
    if (admini.length === 0) return;
    await this.prisma.notification.createMany({
      data: admini.map((a) => ({ userId: a.id, category: 'SYSTEM', severity, title, body, link })),
    });
  }

  /**
   * KSeF 07.11 — codziennie: przypomnienie o wygasającym certyfikacie KSeF (uwierzytelnienie i Offline).
   * Po wygaśnięciu certyfikatu Authentication automat nie zaloguje się do KSeF, a bez certyfikatu Offline
   * faktury offline nie dostaną KODU II.
   */
  @Cron('0 17 8 * * *', { name: 'ksef:waznosc-poswiadczen' })
  async sprawdzWaznoscPoswiadczen(): Promise<string[]> {
    const k = await this.settings.getKsefSettings();
    if (!k.enabled) return [];
    const wyslane: string[] = [];
    const certy: Array<[string, typeof k.certyfikatOffline]> = [
      ['do uwierzytelnienia', k.metoda === 'certyfikat' ? k.certyfikatUwierzytelniania : null],
      ['Offline (KOD II)', k.certyfikatOffline],
    ];
    for (const [nazwa, c] of certy) {
      if (!c) continue;
      const d = c.dniDoWygasniecia;
      if (d >= 0 && !PROGI_WAZNOSCI_DNI.includes(d)) continue;
      const tytul = d < 0 ? `KSeF: certyfikat ${nazwa} wygasł` : `KSeF: certyfikat ${nazwa} wygasa za ${d} ${d === 1 ? 'dzień' : 'dni'}`;
      await this.powiadomAdminow(
        tytul,
        `Certyfikat KSeF ${c.numerSeryjny} ważny do ${c.waznyDo.slice(0, 10)}. Wystaw nowy w Aplikacji Podatnika KSeF i wgraj go w Ustawienia → Firma → KSeF.`,
        '/settings/company#ksef',
        d <= 3 ? 'critical' : 'warning',
      );
      wyslane.push(tytul);
    }
    return wyslane;
  }

  /**
   * Plik faktury dla KSeF — budowany RAZ i zapisywany (`ksefXml`). KOD I zawiera skrót
   * dokładnych bajtów pliku, a XML nie jest odtwarzalny (DataWytworzeniaFa), więc wysyłka,
   * ponowienia po niedostępności i PDF dla klienta muszą używać tego samego zapisu —
   * inaczej kod QR na PDF-ie pobranym przed wysyłką wskazywałby inny plik niż ten w KSeF.
   */
  async zapewnijPlik(inv: Invoice, envWysylki?: SrodowiskoKsef): Promise<PlikFakturyKsef> {
    const env = envWysylki ?? normalizujSrodowiskoKsef((await this.settings.getKsefRuntimeConfig()).env);
    if (inv.ksefXml && inv.ksefXmlSha256) {
      const zamrozony = normalizujSrodowiskoKsef(inv.ksefSrodowisko);
      // Przegląd 15.10: plik zamrożony w innym środowisku (np. TEST przed przełączeniem na PROD), którego KSeF
      // jeszcze nie ma (PENDING/OFFLINE), budujemy od nowa — inaczej poszedłby do PROD z danymi z TEST (np. korekta
      // z numerem KSeF faktury, której w PROD nie ma). Plik wysłany albo przyjęty zostaje taki, jaki jest w KSeF.
      const wKsef =
        inv.ksefStatus === KsefStatus.SUBMITTED || inv.ksefStatus === KsefStatus.ACCEPTED || inv.ksefStatus === KsefStatus.UNCERTAIN;
      if (zamrozony === env || wKsef) {
        return { xml: inv.ksefXml, sha256: inv.ksefXmlSha256, srodowisko: zamrozony };
      }
    }

    // M-06 — korekta musi nieść numer i datę faktury korygowanej (a w FA(3) także jej numer
    // KSeF albo znacznik „poza KSeF”). Te dane siedzą na dokumencie pierwotnym.
    let korygowana: (Pick<Invoice, 'number' | 'issuedAt' | 'netAmount' | 'rodzajPrawny' | 'storageKey'> & { ksefNumber: string | null; ksefStatus: KsefStatus; ksefSrodowisko: string | null }) | null = null;
    if (inv.kind === 'KOREKTA' && inv.correctedId) {
      korygowana = await this.prisma.invoice.findUnique({
        where: { id: inv.correctedId },
        select: { number: true, issuedAt: true, netAmount: true, rodzajPrawny: true, storageKey: true, ksefNumber: true, ksefStatus: true, ksefSrodowisko: true },
      });
      // Przegląd 13.10: numer KSeF faktury przyjętej w innym środowisku (np. TEST) nie istnieje w bieżącym (PROD) —
      // wpisany do NrKSeFFaKorygowanej dałby korektę faktury, której w tym KSeF nie ma.
      if (korygowana?.ksefNumber && korygowana.ksefSrodowisko) {
        if (normalizujSrodowiskoKsef(korygowana.ksefSrodowisko) !== env) {
          throw new FaXmlValidationError(
            `Faktura korygowana ${korygowana.number} jest w KSeF ${korygowana.ksefSrodowisko}, a wysyłka idzie do ${env} – korekty nie da się wysłać do innego środowiska.`,
          );
        }
      }
      if (korygowana && !korygowana.ksefNumber && STATUSY_Z_PLIKIEM_KSEF.includes(korygowana.ksefStatus)) {
        throw new KorygowanaBezNumeruKsef(
          `Faktura korygowana ${korygowana.number} czeka na numer KSeF – korekta pójdzie po nim.`,
        );
      }
      // Przegląd 15.10: odrzucona pierwotna wraca do KSeF po poprawie danych („Ponów”) — korekta wysłana teraz
      // z NrKSeFN („poza KSeF”) zostałaby w KSeF z nieprawdą na zawsze. Czeka na numer jak wyżej.
      if (korygowana && !korygowana.ksefNumber && korygowana.ksefStatus === KsefStatus.REJECTED) {
        throw new KorygowanaBezNumeruKsef(
          `Faktura korygowana ${korygowana.number} została odrzucona przez KSeF – popraw ją i ponów; korekta pójdzie po nadaniu numeru.`,
        );
      }
      // Przegląd poprawek 15.10: pierwotna to faktura VAT panelu, która powinna być w KSeF, a nie trafiła do kolejki
      // (zaległa spoza okna automatu) — ta sama nieprawda co wyżej. Czeka, aż operator zakolejkuje zaległe.
      if (korygowana && korygowana.ksefStatus === KsefStatus.NOT_APPLICABLE && this.qualifies(korygowana)) {
        throw new KorygowanaBezNumeruKsef(
          `Faktura korygowana ${korygowana.number} nie została wysłana do KSeF (zaległa) – zakolejkuj zaległe faktury; korekta pójdzie po nadaniu numeru.`,
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
    // KSeF 07.11 — plik niezgodny z XSD FA(3) nie jest zapisywany ani wysyłany; powód widzi operator.
    const xsd = await walidujFa3Xsd(xml);
    if (!xsd.ok) {
      throw new FaXmlValidationError(`Niezgodność ze schematem FA(3): ${xsd.bledy.slice(0, 3).join('; ') || 'nieznany błąd walidatora'}`);
    }
    const sha256 = skrotFakturyBase64Url(xml);
    const zapis = await this.prisma.invoice.updateMany({
      // Zastępujemy dokładnie ten plik, który widzieliśmy (null albo zamrożony w innym środowisku).
      where: { id: inv.id, ksefXml: inv.ksefXml ?? null },
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

  private async submitOne(client: InvoicingProvider, inv: Invoice, env: SrodowiskoKsef): Promise<void> {
    let plik: PlikFakturyKsef;
    try {
      plik = await this.zapewnijPlik(inv, env);
    } catch (err) {
      if (err instanceof FaXmlValidationError) {
        // Dane faktury niekompletne albo niezgodne ze schematem — REJECTED lokalnie, nic nie idzie do KSeF.
        await this.markRejected(inv, `Walidacja lokalna: ${err.message}`);
        return;
      }
      if (err instanceof KorygowanaBezNumeruKsef) {
        this.logger.log(`KSeF: ${inv.number} – ${err.message}`);
        // Przegląd poprawek 15.10: czekająca korekta ma widoczny powód (wcześniej tylko log).
        await this.zapiszBladWKolejce([inv], err.message);
        return;
      }
      throw err;
    }

    // tryby-offline.md: faktura offline (offline24 / niedostępność / awaria) idzie z `offlineMode: true`;
    // także spóźniona (dzień P_1 przed dniem wysyłki) — KSeF i tak oznaczyłby ją jako offline.
    const offline = trybOffline(inv.ksefTryb) || formatDateOnly(inv.issuedAt ?? inv.createdAt) < formatDateOnly(new Date());
    try {
      // Wysyłamy DOKŁADNIE zapisany plik — ten, którego skrót jest w kodzie QR.
      const { elementReferenceNumber } = await client.sendInvoice(plik.xml, {
        offlineMode: offline,
        // Korekta techniczna faktury offline (offline/korekta-techniczna.md) — skrót odrzuconego pliku.
        hashOfCorrectedInvoice: offline && inv.ksefSkrotKorygowanej ? b64urlNaB64(inv.ksefSkrotKorygowanej) : null,
      });
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: {
          ksefStatus: KsefStatus.SUBMITTED,
          ksefElementRef: elementReferenceNumber,
          ksefSubmittedAt: new Date(),
          ksefError: null,
          ksefProby: 0,
          ksefNastepnaProba: null,
          // Środowisko, do którego plik faktycznie poszedł (adres klienta tego cyklu) — od niego zależy adres QR.
          ksefSrodowisko: env,
        },
      });
      await this.audit.record({
        action: 'KSEF_INVOICE_SUBMITTED',
        userId: inv.userId,
        details: { invoiceId: inv.id, number: inv.number, elementReferenceNumber, sha256: plik.sha256, offlineMode: offline },
      });
    } catch (err) {
      if ((err as { niepewny?: boolean }).niepewny === true) {
        await this.oznaczDoWyjasnienia(inv, env, err as Error);
        return;
      }
      const httpStatus = (err as { httpStatus?: number }).httpStatus;
      if (httpStatus === 429) {
        // Limit API — cykl zostaje wstrzymany (Retry-After), faktura bez zmiany statusu, z powodem.
        await this.zapiszBladWKolejce([inv], `Wysyłka nieudana, ponowimy: ${(err as Error).message}`);
        throw err;
      }
      // Część 4xx nie dotyczy dokumentu: 401/403 (token, uprawnienia), 429 (limity API)
      // i 21184 (sesja wstrzymana, API 2.8.0). Faktura poprawna — zostaje w kolejce.
      const przejsciowy =
        (err as { przejsciowy?: boolean }).przejsciowy === true ||
        (httpStatus !== undefined && STATUSY_PRZEJSCIOWE_WYSYLKI.includes(httpStatus));
      if (httpStatus && httpStatus < 500 && !przejsciowy) {
        // 4xx przy wysyłce = problem z dokumentem, nie z dostępnością.
        await this.markRejected(inv, (err as Error).message);
        return;
      }
      // KSeF 07.11 — 5xx / sieć / sesja wstrzymana: KSeF nie przyjął faktury z przyczyn po swojej stronie
      // (albo konfiguracji: 401/403) — ponowienie z narastającą przerwą; przy niedostępności tryb offline.
      await this.odlozPonowienie(inv, `Wysyłka nieudana, ponowimy: ${err instanceof Error ? err.message : String(err)}`, httpStatus === undefined || httpStatus >= 500);
      throw err;
    }
  }

  /**
   * Nieudana próba z przyczyn przejściowych: licznik prób, termin następnej (backoff) i powód na fakturze.
   * `offline` — KSeF nie przyjął faktury z przyczyn po swojej stronie: tryb offline24 (tryby-offline.md),
   * jeśli faktura nie ma jeszcze trybu, z terminem dosłania i KODEM II na PDF.
   */
  private async odlozPonowienie(inv: Invoice, powod: string, offline: boolean): Promise<void> {
    const teraz = new Date();
    const proby = (inv.ksefProby ?? 0) + 1;
    const tryb = (inv.ksefTryb && inv.ksefTryb !== 'ONLINE' ? inv.ksefTryb : 'OFFLINE24') as TrybWystawienia;
    const termin = offline
      ? terminPrzeslania({ tryb, wystawiono: inv.issuedAt ?? inv.createdAt, przerwaZakonczona: inv.ksefPrzerwaDo })
      : inv.ksefTerminDo;
    await this.prisma.invoice.updateMany({
      where: { id: inv.id, ksefStatus: { in: [KsefStatus.PENDING, KsefStatus.OFFLINE, KsefStatus.UNCERTAIN, KsefStatus.SUBMITTED] } },
      data: {
        ksefError: powod.slice(0, 2000),
        ksefProby: proby,
        ksefNastepnaProba: nastepnaProba(proby, teraz, termin ?? null),
        ...(offline
          ? { ksefStatus: KsefStatus.OFFLINE, ksefTryb: tryb, ksefTerminDo: termin, ksefNiedostepnoscOd: inv.ksefNiedostepnoscOd ?? teraz }
          : {}),
      },
    });
  }

  /**
   * Plik KSeF faktury do wizualizacji (PDF z kodem QR) i do pobrania przez klienta — albo `null`,
   * gdy faktura nie idzie do KSeF, została odrzucona albo jej pliku nie da się jeszcze zbudować
   * (wtedy obowiązuje PDF z magazynu).
   */
  async plikDoWizualizacji(invoiceId: string): Promise<(PlikFakturyKsef & { numerKsef: string | null; przyjeto: Date | null; numer: string; offline: boolean }) | null> {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv || !STATUSY_Z_PLIKIEM_KSEF.includes(inv.ksefStatus)) return null;
    try {
      const plik = await this.zapewnijPlik(inv);
      return { ...plik, numerKsef: inv.ksefNumber, przyjeto: inv.ksefAcceptedAt, numer: inv.number, offline: trybOffline(inv.ksefTryb) };
    } catch (err) {
      if (err instanceof FaXmlValidationError || err instanceof KorygowanaBezNumeruKsef) {
        this.logger.warn(`KSeF: brak pliku do wizualizacji ${inv.number} – ${err.message}`);
        return null;
      }
      throw err;
    }
  }

  /**
   * PDF faktury = wizualizacja zapisanego XML FA(3) + KOD I, a dla faktury offline także KOD II
   * (kody-qr.md: „w trybie offline — dwa kody QR”). `null` — patrz `plikDoWizualizacji`.
   */
  async pdfFaktury(invoiceId: string): Promise<Uint8Array | null> {
    const plik = await this.plikDoWizualizacji(invoiceId);
    if (!plik) return null;
    const wiz = wizualizacjaFa3(plik.xml);
    return renderujFaktureKsef(wiz, {
      numerKsef: plik.numerKsef,
      przyjetoWKsef: plik.przyjeto,
      linkWeryfikacji: linkWeryfikacjiKsef(plik.srodowisko, wiz.sprzedawca.nip ?? '', wiz.dataWystawienia, plik.sha256),
      linkCertyfikatu: plik.offline ? await this.linkKoduII(plik) : null,
      srodowisko: plik.srodowisko,
    });
  }

  /**
   * Link KOD II (kody-qr.md, „2. KOD II”): kontekst NIP z ustawień KSeF, numer seryjny certyfikatu
   * KSeF typu Offline i skrót pliku, podpisane jego kluczem. Bez certyfikatu Offline — `null` i ostrzeżenie
   * (readiness i Admin → KSeF pokazują brak certyfikatu; faktura offline bez KODU II jest niezgodna).
   */
  async linkKoduII(plik: Pick<PlikFakturyKsef, 'xml' | 'sha256' | 'srodowisko'>): Promise<string | null> {
    const rt = await this.settings.getKsefRuntimeConfig();
    if (!rt.certyfikatOffline || !rt.nip) {
      this.logger.warn('KSeF: faktura offline bez KODU II – brak certyfikatu KSeF typu Offline w ustawieniach.');
      return null;
    }
    const cert = wczytajCertyfikat(rt.certyfikatOffline.pem);
    const klucz = wczytajKluczPrywatny(rt.certyfikatOffline.kluczPem);
    return linkKoduII(
      plik.srodowisko,
      {
        typKontekstu: 'Nip',
        kontekst: rt.nip,
        nipSprzedawcy: daneLinkuZPliku(plik.xml).nipSprzedawcy,
        numerSeryjny: cert.x509.serialNumber.toUpperCase(),
        skrot: plik.sha256,
      },
      (dane) => podpiszKodII(klucz, dane),
    );
  }

  private async checkOne(
    client: InvoicingProvider,
    inv: Invoice,
  ): Promise<'accepted' | 'rejected' | 'pending'> {
    const status = await client.invoiceStatus(inv.ksefElementRef!);
    if (status.processed && status.ksefReferenceNumber) {
      await this.przyjmij(inv, status.ksefReferenceNumber, status.acquisitionTimestamp, inv.ksefElementRef!);
      return 'accepted';
    }
    // Kody statusów faktury z open-api.json → stan panelu (ksef-statusy.ts).
    const { stan, komunikat } = statusFakturyKsef(status.statusCode, status.statusDescription);
    const szczegoly = status.szczegoly?.length ? ` (${status.szczegoly.join('; ').slice(0, 500)})` : '';
    if (stan === 'duplikat') {
      return (await this.rozstrzygnijDuplikat(client, inv, status.duplikat ?? null)) ? 'accepted' : 'pending';
    }
    if (stan === 'odrzucona' || (stan !== 'ponow' && status.rejected)) {
      await this.markRejected(inv, `KSeF ${status.statusCode}: ${status.statusDescription ?? komunikat}${szczegoly}`);
      return 'rejected';
    }
    if (stan === 'ponow') {
      // Faktura NIE została przyjęta z przyczyn po stronie KSeF/sesji/uprawnień — ten sam plik idzie
      // ponownie (nowy numer referencyjny); do tego czasu to faktura poza KSeF, z terminem dosłania.
      await this.prisma.invoice.updateMany({
        where: { id: inv.id, ksefStatus: KsefStatus.SUBMITTED },
        data: { ksefStatus: KsefStatus.OFFLINE, ksefElementRef: null, ksefSubmittedAt: null },
      });
      await this.odlozPonowienie({ ...inv, ksefStatus: KsefStatus.OFFLINE }, `KSeF ${status.statusCode}: ${komunikat}${szczegoly}`, true);
      return 'pending';
    }
    return 'pending';
  }

  private async przyjmij(inv: Invoice, numerKsef: string, przyjeto: string | null, elementRef: string): Promise<void> {
    await this.prisma.invoice.update({
      where: { id: inv.id },
      data: {
        ksefStatus: KsefStatus.ACCEPTED,
        ksefNumber: numerKsef,
        ksefAcceptedAt: przyjeto ? new Date(przyjeto) : new Date(),
        ksefElementRef: elementRef,
        ksefError: null,
        ksefProby: 0,
        ksefNastepnaProba: null,
      },
    });
    await this.audit.record({
      action: 'KSEF_INVOICE_ACCEPTED',
      userId: inv.userId,
      details: { invoiceId: inv.id, number: inv.number, ksefNumber: numerKsef },
    });
  }

  /**
   * KSeF 07.11 — kod 440 „Duplikat faktury” (open-api.json; unikalność: NIP sprzedawcy + rodzaj + P_2,
   * faktury/weryfikacja-faktury.md). Typowy przypadek: KSeF przyjął fakturę, a panel padł przed zapisem
   * odpowiedzi (albo wysyłka była bez odpowiedzi) — ponowna wysyłka dostaje 440 z numerem pierwotnej.
   * Przyjmujemy ten numer TYLKO po sprawdzeniu, że w KSeF jest dokładnie nasz plik (skrót SHA-256 z listy
   * faktur pierwotnej sesji) — inaczej kod QR na PDF-ie wskazywałby plik, którego w KSeF nie ma.
   * Bez zgodności: „do wyjaśnienia” dla operatora, automat jej nie wysyła.
   */
  private async rozstrzygnijDuplikat(
    client: InvoicingProvider,
    inv: Invoice,
    duplikat: { numerKsef: string; sesja: string | null } | null,
  ): Promise<boolean> {
    let powod: string;
    if (!duplikat) {
      powod = 'KSeF nie podał numeru pierwotnej faktury';
    } else if (!duplikat.sesja || !client.fakturaWSesji || !inv.ksefXmlSha256) {
      powod = 'nie da się porównać pliku z fakturą w KSeF';
    } else {
      const wKsef = await client.fakturaWSesji(duplikat.sesja, duplikat.numerKsef);
      if (wKsef && wKsef.skrotB64 === b64urlNaB64(inv.ksefXmlSha256)) {
        await this.przyjmij(inv, duplikat.numerKsef, wKsef.przyjeto, `${duplikat.sesja}|ksef:${duplikat.numerKsef}`);
        await this.audit.record({
          action: 'KSEF_INVOICE_DUPLIKAT_PRZYJETY',
          userId: inv.userId,
          details: { invoiceId: inv.id, number: inv.number, ksefNumber: duplikat.numerKsef, sesja: duplikat.sesja },
        });
        this.logger.log(`KSeF: ${inv.number} była już w KSeF (${duplikat.numerKsef}) – przyjęta z numerem pierwotnej.`);
        return true;
      }
      powod = wKsef ? 'plik w KSeF różni się od zapisanego w panelu' : 'nie znaleziono pierwotnej faktury w jej sesji';
    }
    const opis = `KSeF: duplikat – faktura ${inv.number} jest już w KSeF${duplikat ? ` (numer KSeF ${duplikat.numerKsef})` : ''}, ale ${powod}. Sprawdź w KSeF i rozstrzygnij na stronie faktury.`;
    await this.prisma.invoice.update({
      where: { id: inv.id },
      data: { ksefStatus: KsefStatus.UNCERTAIN, ksefError: opis.slice(0, 2000), ksefNastepnaProba: CZEKA_NA_OPERATORA },
    });
    await this.audit.record({ action: 'KSEF_INVOICE_UNCERTAIN', userId: inv.userId, details: { invoiceId: inv.id, number: inv.number, duplikat: duplikat?.numerKsef ?? null } });
    await this.powiadomAdminow(`KSeF: ${inv.number} do wyjaśnienia (duplikat)`, opis, `/invoices/${inv.id}#ksef`);
    return false;
  }

  /** UPO przyjętej faktury → `ksefUpo`. Błąd: ponowienie z narastającą przerwą (UPO powstaje po zamknięciu sesji). */
  private async pobierzUpo(client: InvoicingProvider, inv: Invoice): Promise<boolean> {
    try {
      const upo = await client.downloadUpo(inv.ksefElementRef!);
      await this.prisma.invoice.update({ where: { id: inv.id }, data: { ksefUpo: upo, ksefProby: 0, ksefNastepnaProba: null } });
      return true;
    } catch (err) {
      if ((err as { httpStatus?: number }).httpStatus === 429) throw err;
      const proby = (inv.ksefProby ?? 0) + 1;
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: { ksefProby: proby, ksefNastepnaProba: nastepnaProba(proby, new Date(), null) },
      });
      this.logger.warn(`KSeF: UPO ${inv.number} jeszcze niedostępne (próba ${proby}): ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * M-16 — zapisuje, że faktury nie poszły z powodu niedostępności KSeF (nieudane otwarcie sesji).
   *
   * KSeF 07.11: tryb `OFFLINE24` zamiast `NIESKLASYFIKOWANY`. Wg tryby-offline.md offline24 jest trybem
   * „po stronie klienta”, bez warunku ogłoszenia w BIP — wolno go przyjąć zawsze, a jego termin (następny
   * dzień roboczy po wystawieniu) jest najkrótszy. Niedostępność i awaria (ogłaszane przez MF) tylko go
   * wydłużają; ich klasyfikacja wymaga komunikatu MF, więc automat jej nie zgaduje. Błąd 5xx przy wysyłce
   * pojedynczej faktury obsługuje `odlozPonowienie` (też offline24, z backoffem).
   */
  private async oznaczNiedostepnosc(faktury: Invoice[], err: unknown): Promise<void> {
    const teraz = new Date();
    const powod = err instanceof Error ? err.message : String(err);

    let oznaczone = 0;
    for (const inv of faktury) {
      if (inv.ksefStatus !== KsefStatus.PENDING && inv.ksefStatus !== KsefStatus.OFFLINE) continue; // SUBMITTED czeka na numer, UNCERTAIN na wyjaśnienie
      const wystawiono = inv.issuedAt ?? inv.createdAt;
      // KSeF 07.11 — tryb offline24 (tryby-offline.md: „brak ograniczeń, dowolność podatnika”, termin:
      // następny dzień roboczy po dacie wystawienia). To jedyny tryb, który nie wymaga komunikatu MF w BIP,
      // więc jedyny, który automat może przyjąć sam; ma też najkrótszy termin. Tryb nadany wcześniej
      // (np. zaklasyfikowana niedostępność/awaria) zostaje.
      const tryb = (inv.ksefTryb && inv.ksefTryb !== 'ONLINE' ? inv.ksefTryb : 'OFFLINE24') as TrybWystawienia;
      // Przegląd 15.10: lista `faktury` to migawka sprzed uwierzytelnienia. Równoległy cykl mógł w tym czasie
      // wysłać fakturę (SUBMITTED) albo ją właśnie wysyła (dzierżawa) — bezwarunkowy zapis cofał ją do OFFLINE,
      // a po dzierżawie szła do KSeF drugi raz. Zapis tylko dla faktur wciąż czekających i niewysyłanych.
      const r = await this.prisma.invoice.updateMany({
        where: {
          id: inv.id,
          ksefStatus: { in: [KsefStatus.PENDING, KsefStatus.OFFLINE] },
          OR: [{ ksefSubmittedAt: null }, { ksefSubmittedAt: { lt: new Date(teraz.getTime() - DZIERZAWA_WYSYLKI_MS) } }],
        },
        data: {
          ksefStatus: KsefStatus.OFFLINE,
          ksefTryb: tryb,
          // Pierwsza obserwacja zostaje — kolejne cykle jej nie nadpisują,
          // inaczej przerwa trwająca dobę wyglądałaby na dziesięciominutową.
          ksefNiedostepnoscOd: inv.ksefNiedostepnoscOd ?? teraz,
          ksefTerminDo: terminPrzeslania({ tryb, wystawiono, przerwaZakonczona: inv.ksefPrzerwaDo }),
          ksefError: `Niedostępność KSeF: ${powod}`.slice(0, 2000),
        },
      });
      oznaczone += r.count;
    }

    this.logger.warn(
      `KSeF niedostępny – ${oznaczone} faktur(y) oznaczone jako OFFLINE (tryb offline24): ${powod}`,
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

  /** Powód czekania na fakturach z kolejki — bez zmiany statusu (tylko PENDING/OFFLINE). */
  private async zapiszBladWKolejce(faktury: Pick<Invoice, 'id'>[], powod: string): Promise<void> {
    if (faktury.length === 0) return;
    await this.prisma.invoice.updateMany({
      where: { id: { in: faktury.map((f) => f.id) }, ksefStatus: { in: [KsefStatus.PENDING, KsefStatus.OFFLINE] } },
      data: { ksefError: powod.slice(0, 2000) },
    });
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

  /**
   * Przegląd 15.10 — faktury VAT panelu sprzed okna automatu (KSEF-05), które nigdy nie trafiły do kolejki
   * (np. KSeF był wyłączony przy trybie „panel” dłużej niż 7 dni). Do dziś komentarze odsyłały do
   * `zakwalifikujZalegle`, którego nie było — takie faktury zostawały poza KSeF po cichu.
   */
  async zalegleDoKsef(): Promise<{ liczba: number; przyklady: Array<{ id: string; number: string; issuedAt: string | null }> }> {
    const where = warunekNiezakolejkowanych({ lt: poczatekOknaAuto() });
    const [liczba, przyklady] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({ where, orderBy: { issuedAt: 'asc' }, take: 10, select: { id: true, number: true, issuedAt: true } }),
    ]);
    return { liczba, przyklady: przyklady.map((f) => ({ id: f.id, number: f.number, issuedAt: f.issuedAt?.toISOString() ?? null })) };
  }

  /**
   * Operator kolejkuje zaległe faktury do KSeF — świadomie, po zobaczeniu liczby (`oczekiwanaLiczba` musi się
   * zgadzać z bieżącą, inaczej 409: lista zmieniła się od podglądu). Tylko przy włączonym KSeF — inaczej faktury
   * czekałyby w kolejce na środowisko, którego operator nie widział.
   */
  async zakwalifikujZalegle(actorUserId: string, oczekiwanaLiczba: number): Promise<{ zakolejkowane: number; srodowisko: string }> {
    const rt = await this.settings.getKsefRuntimeConfig();
    if (!rt.enabled) throw new ConflictException('KSeF jest wyłączony – najpierw włącz wysyłkę i sprawdź środowisko.');
    const where = warunekNiezakolejkowanych({ lt: poczatekOknaAuto() });
    const teraz = await this.prisma.invoice.count({ where });
    if (teraz !== oczekiwanaLiczba) {
      throw new ConflictException(`Liczba zaległych faktur zmieniła się (${teraz}, a podgląd pokazywał ${oczekiwanaLiczba}) – odśwież i sprawdź ponownie.`);
    }
    const r = await this.prisma.invoice.updateMany({ where, data: { ksefStatus: KsefStatus.PENDING } });
    await this.audit.record({
      action: 'KSEF_ZALEGLE_ZAKOLEJKOWANE',
      actorUserId,
      details: { liczba: r.count, srodowisko: normalizujSrodowiskoKsef(rt.env) },
    });
    return { zakolejkowane: r.count, srodowisko: normalizujSrodowiskoKsef(rt.env) };
  }

  async adminOverview() {
    const [counts, recentRejected, czekajaZBledem, offline, ustawienia] = await Promise.all([
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
      // Przegląd poprawek 15.10: faktury w kolejce z powodem czekania (token odrzucony, korekta czeka na pierwotną…).
      this.prisma.invoice.findMany({
        where: { ksefStatus: { in: [KsefStatus.PENDING, KsefStatus.OFFLINE] }, ksefError: { not: null } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, number: true, ksefError: true, updatedAt: true },
      }),
      // KSeF 07.11 — faktury poza KSeF (offline) z trybem i terminem dosłania.
      this.prisma.invoice.findMany({
        where: { ksefStatus: { in: [KsefStatus.OFFLINE, KsefStatus.UNCERTAIN] } },
        orderBy: { ksefTerminDo: 'asc' },
        take: 20,
        select: { id: true, number: true, ksefStatus: true, ksefTryb: true, ksefTerminDo: true, ksefProby: true, ksefNastepnaProba: true, ksefError: true },
      }),
      this.settings.getKsefSettings(),
    ]);
    const teraz = new Date();
    return {
      config: await this.configStatus(),
      // Ważność poświadczeń (bez sekretów): certyfikaty z datami, token tylko „ustawiony / nie”.
      poswiadczenia: {
        metoda: ustawienia.metoda,
        tokenSet: ustawienia.tokenSet,
        certyfikatUwierzytelniania: ustawienia.certyfikatUwierzytelniania,
        certyfikatOffline: ustawienia.certyfikatOffline,
      },
      wstrzymanoDo: this.wstrzymanoDo > Date.now() ? new Date(this.wstrzymanoDo).toISOString() : null,
      ostatniCykl: this.ostatniCykl,
      offline: offline.map((f) => ({
        id: f.id,
        number: f.number,
        status: f.ksefStatus,
        tryb: f.ksefTryb,
        terminDo: f.ksefTerminDo?.toISOString() ?? null,
        poTerminie: Boolean(f.ksefTerminDo && f.ksefTerminDo < teraz),
        proby: f.ksefProby,
        nastepnaProba: f.ksefNastepnaProba && f.ksefNastepnaProba.getTime() < CZEKA_NA_OPERATORA.getTime() ? f.ksefNastepnaProba.toISOString() : null,
        czekaNaOperatora: f.ksefNastepnaProba?.getTime() === CZEKA_NA_OPERATORA.getTime(),
        error: f.ksefError,
      })),
      // Faktury offline wymagają KODU II — bez certyfikatu Offline nie da się go wygenerować.
      offlineBezKoduII: ustawienia.certyfikatOffline ? 0 : offline.filter((f) => trybOffline(f.ksefTryb)).length,
      counts: Object.fromEntries(counts.map((c) => [c.ksefStatus, c._count._all])),
      recentRejected: recentRejected.map((r) => ({
        id: r.id,
        number: r.number,
        error: r.ksefError,
        updatedAt: r.updatedAt.toISOString(),
      })),
      czekajaZBledem: czekajaZBledem.map((r) => ({
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
  async downloadUpo(invoiceId: string, actorUserId?: string): Promise<{ number: string; upoXml: string }> {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv || inv.ksefStatus !== KsefStatus.ACCEPTED || (!inv.ksefElementRef && !inv.ksefUpo)) {
      throw new Error('UPO dostępne tylko dla faktur przyjętych przez KSeF.');
    }
    // KSeF 07.11 — UPO pobrane już przez cykl leży w bazie; KSeF wołamy tylko, gdy go jeszcze nie ma.
    if (inv.ksefUpo) {
      if (actorUserId) {
        await this.audit.record({ action: 'KSEF_UPO_DOWNLOADED', actorUserId, details: { invoiceId, number: inv.number } });
      }
      return { number: inv.number, upoXml: inv.ksefUpo };
    }
    const zbudowany = await this.buildClient();
    if (!zbudowany) throw new Error('KSeF nieskonfigurowany (NIP/token).');
    const { client } = zbudowany;
    await client.openSession();
    try {
      const upoXml = await client.downloadUpo(inv.ksefElementRef!);
      await this.prisma.invoice.updateMany({ where: { id: inv.id, ksefUpo: null }, data: { ksefUpo: upoXml } });
      // M-15 — UPO to dokument podatkowy faktury klienta: każde pobranie przez operatora zostawia ślad w dzienniku.
      if (actorUserId) {
        await this.audit.record({ action: 'KSEF_UPO_DOWNLOADED', actorUserId, details: { invoiceId, number: inv.number } });
      }
      return { number: inv.number, upoXml };
    } finally {
      await client.terminateSession();
    }
  }

  /**
   * Decyzja 15.10 (#3) — wysyłka bez odpowiedzi: faktura mogła trafić do KSeF. Wcześniej zostawała w kolejce
   * i szła ponownie (duplikat w KSeF, a odrzucenie duplikatu potrafiło nadpisać przyjętą fakturę). Teraz UNCERTAIN:
   * automat jej nie wysyła, admin sprawdza w KSeF i rozstrzyga ({@link wyjasnijFakture}).
   */
  private async oznaczDoWyjasnienia(inv: Invoice, env: SrodowiskoKsef, err: Error): Promise<void> {
    await this.prisma.invoice.updateMany({
      where: { id: inv.id, ksefStatus: { in: [KsefStatus.PENDING, KsefStatus.OFFLINE, KsefStatus.UNCERTAIN] } },
      data: {
        ksefStatus: KsefStatus.UNCERTAIN,
        ksefSubmittedAt: new Date(),
        ksefSrodowisko: env,
        ksefError: `Wysyłka bez potwierdzenia KSeF (${err.message.slice(0, 300)}). Sprawdź w KSeF, czy faktura jest – automat wyśle ją ponownie za 30 minut, a jeśli już jest w KSeF, przyjmie jej numer (kod 440).`,
      },
    });
    // Ponowna „niepewna” wysyłki tej samej faktury — bez kolejnego powiadomienia co 30 minut.
    if (inv.ksefStatus === KsefStatus.UNCERTAIN) return;
    await this.audit.record({
      action: 'KSEF_INVOICE_UNCERTAIN',
      userId: inv.userId,
      details: { invoiceId: inv.id, number: inv.number, srodowisko: env, blad: err.message.slice(0, 500) },
    });
    const admini = await this.prisma.user.findMany({ where: { role: 'ADMIN', loginBlocked: false }, select: { id: true } });
    await this.prisma.notification.createMany({
      data: admini.map((a) => ({
        userId: a.id,
        category: 'SYSTEM',
        severity: 'warning',
        title: `KSeF: ${inv.number} do wyjaśnienia`,
        body: 'KSeF nie potwierdził wysyłki faktury – mogła dojść. Automat wyśle ją ponownie za 30 minut (duplikat rozpozna po kodzie KSeF 440); możesz też sprawdzić ją w KSeF (środowisko ' + env + ') i rozstrzygnąć na stronie faktury.',
        link: `/invoices/${inv.id}#ksef`,
      })),
    });
  }

  /**
   * Admin: rozstrzygnięcie faktury UNCERTAIN po sprawdzeniu w KSeF. „Nie ma” → z powrotem do kolejki z TYM SAMYM
   * plikiem (skrót w kodzie QR klienta się nie zmienia). „Jest” → przyjęta z numerem KSeF podanym przez admina.
   */
  async wyjasnijFakture(invoiceId: string, actorUserId: string, decyzja: { jestWKsef: boolean; numerKsef?: string | null }) {
    const numer = decyzja.numerKsef?.trim().toUpperCase() ?? '';
    // Format numeru KSeF: NIP-RRRRMMDD-12 znaków hex-2 znaki hex (np. 5265877635-20250826-0100001AF629-AF).
    if (decyzja.jestWKsef && !/^\d{10}-\d{8}-[0-9A-F]{12}-[0-9A-F]{2}$/.test(numer)) {
      throw new BadRequestException('Podaj numer KSeF faktury w formacie NIP-RRRRMMDD-XXXXXXXXXXXX-XX.');
    }
    const r = await this.prisma.invoice.updateMany({
      where: { id: invoiceId, ksefStatus: KsefStatus.UNCERTAIN },
      data: decyzja.jestWKsef
        ? // Numer referencyjny dotyczył wysyłki bez potwierdzenia — UPO po nim pobrać się nie da.
          { ksefStatus: KsefStatus.ACCEPTED, ksefNumber: numer, ksefAcceptedAt: new Date(), ksefError: null, ksefElementRef: null, ksefProby: 0, ksefNastepnaProba: null }
        : { ksefStatus: KsefStatus.PENDING, ksefSubmittedAt: null, ksefError: null, ksefProby: 0, ksefNastepnaProba: null },
    });
    if (r.count === 0) throw new ConflictException('Wyjaśnić można tylko fakturę oznaczoną „do wyjaśnienia”.');
    await this.audit.record({
      action: 'KSEF_INVOICE_WYJASNIONA',
      actorUserId,
      details: { invoiceId, jestWKsef: decyzja.jestWKsef, ...(decyzja.jestWKsef ? { ksefNumber: numer } : {}) },
    });
    return { ok: true as const };
  }

  /** Admin: ponów odrzuconą fakturę po poprawie danych. */
  async retryInvoice(invoiceId: string, actorUserId: string) {
    const przed = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { ksefTryb: true, ksefXmlSha256: true, ksefSkrotKorygowanej: true, ksefElementRef: true },
    });
    // KSeF 07.11 — korekta techniczna (offline/korekta-techniczna.md): faktura offline odrzucona przez KSeF
    // (był numer referencyjny wysyłki) idzie z nowym plikiem i `hashOfCorrectedInvoice` = skrót pierwotnego,
    // który nabywca ma w KODZIE I. Przy kolejnej poprawce wskazujemy wciąż pierwszy plik.
    const korektaTechniczna =
      przed && trybOffline(przed.ksefTryb) && przed.ksefElementRef && przed.ksefXmlSha256
        ? przed.ksefSkrotKorygowanej ?? przed.ksefXmlSha256
        : (przed?.ksefSkrotKorygowanej ?? null);
    // Tylko odrzucona faktura wraca do wysyłki. Wcześniej „ponów” działało na każdej — także przyjętej
    // albo czekającej na numer KSeF — i wysyłało ją drugi raz (duplikat w KSeF).
    const r = await this.prisma.invoice.updateMany({
      where: { id: invoiceId, ksefStatus: KsefStatus.REJECTED },
      // Plik budujemy od nowa — ponowienie następuje po poprawie danych, a stary plik KSeF odrzucił.
      data: {
        ksefSkrotKorygowanej: korektaTechniczna,
        ksefProby: 0,
        ksefNastepnaProba: null,
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
