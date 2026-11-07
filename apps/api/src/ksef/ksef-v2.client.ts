import {
  X509Certificate,
  createHash,
  createCipheriv,
  publicEncrypt,
  randomBytes,
  constants as cryptoConstants,
} from 'crypto';
import { Logger } from '@nestjs/common';
import {
  InvoiceSendResult,
  InvoiceStatusResult,
  InvoicingProvider,
  type OpcjeWysylki,
} from './invoicing-provider.interface.js';
import { FA3_FORM_VALUE, FA3_SCHEMA_VERSION, FA3_SYSTEM_CODE } from './fa3-xml.builder.js';
import { wczytajCertyfikat, wczytajKluczPrywatny, type TypIdentyfikatoraKsef } from './ksef-certyfikat.js';
import { podpiszAuthTokenRequest } from './ksef-xades.js';
import {
  KOD_DUPLIKAT_FAKTURY,
  KODY_NOWA_SESJA,
  STATUSY_UWIERZYTELNIENIA_PRZEJSCIOWE,
  komunikatUwierzytelnienia,
  komunikatWyjatkuXades,
} from './ksef-statusy.js';

/**
 * KSEF-2.0-2 — własny klient KSeF 2.0 (API v2) implementujący pełny przepływ
 * z oficjalnej dokumentacji MF (github.com/CIRFMF/ksef-api):
 *
 *  Uwierzytelnianie (metoda: token KSeF):
 *   1. GET  /security/public-key-certificates      → certy MF (token + symetria)
 *   2. POST /auth/challenge                         → challenge + timestamp
 *   3. RSA-OAEP-SHA256("token|timestampMs", tokenPubKey) → encryptedToken
 *   4. POST /auth/ksef-token                        → authenticationToken + ref
 *   5. GET  /auth/{ref} (Bearer authToken)          → polling statusu
 *   6. POST /auth/token/redeem                      → accessToken (+ refreshToken)
 *
 *  Wysyłka (sesja interaktywna online):
 *   7. AES-256 key+IV; RSA-OAEP-SHA256(key, symPubKey) → encryptedSymmetricKey
 *   8. POST /sessions/online                        → sessionReferenceNumber
 *   9. AES-256-CBC(PKCS#7) XML; POST /sessions/online/{ref}/invoices → invoiceRef
 *  10. POST /sessions/online/{ref}/close            → wyzwala UPO
 *
 *  Status/UPO (kolejne cykle):
 *   - GET /sessions/{ref}/invoices/{invoiceRef}     → status + numer KSeF
 *
 * Kontrakt ZWERYFIKOWANY z oficjalnym open-api.json (KSeF API 2.6.0):
 *  - /security/public-key-certificates: certificate/certificateId/publicKeyId/
 *    validFrom/validTo/usage; usage ∈ {KsefTokenEncryption, SymmetricKeyEncryption}.
 *  - /auth/challenge: POST bez body → {challenge, timestamp}.
 *  - /auth/ksef-token: {challenge, contextIdentifier:{type:"Nip",value},
 *    encryptedToken, publicKeyId} → 202 {referenceNumber, authenticationToken:{token}}.
 *  - /auth/{ref}: {status:{code,…}, isTokenRedeemed}.
 *  - /auth/token/redeem: {accessToken:{token,validUntil}, refreshToken:{token,validUntil}}.
 *  - /sessions/online: {formCode, encryption:{encryptedSymmetricKey,
 *    initializationVector, publicKeyId}} → {referenceNumber, validUntil}.
 *    (publicKeyId jest WEWNĄTRZ `encryption`).
 *  - /sessions/online/{ref}/invoices: {invoiceHash(b64 SHA256), invoiceSize,
 *    encryptedInvoiceHash(b64), encryptedInvoiceSize, encryptedInvoiceContent}
 *    → 202 {referenceNumber}.
 *  - /sessions/{ref}/invoices/{invoiceRef}: {ksefNumber(string), status:{code},
 *    acquisitionDate}.
 *
 * Kontrakt zweryfikowany względem API 2.6.x (changelog do 2.6.1, PRD od
 * 16.06.2026), a 12.10.2026 względem changelogu do 2.8.1 (PRD od 23.09.2026) — jedyna zmiana
 * dotycząca tego klienta to kod 21184 przy wysyłce (obsłużony w sendInvoice). Istotne od 2.4.0/2.6.0: retencja statusu auth 7 dni (410 Gone),
 * opcjonalny nagłówek odpowiedzi `X-System-Warning` (logowany niżej jako
 * warning — zapowiada przyszłe odrzucenia), zaostrzona walidacja XML od
 * 16.07.2026 (sanityzacja w fa-xml.types).
 *
 * 2026-11-07 — uwierzytelnienie CERTYFIKATEM (XAdES, POST /auth/xades-signature) obok tokenu
 * (https://github.com/CIRFMF/ksef-docs/blob/main/uwierzytelnianie.md, 2.1), odświeżanie accessToken
 * przez refreshToken (tamże, pkt 5 — POST /auth/token/refresh) zamiast pełnego logowania co cykl,
 * `offlineMode` i `hashOfCorrectedInvoice` przy wysyłce (tryby-offline.md, offline/korekta-techniczna.md),
 * duplikat 440 z rozszerzeniami `originalKsefNumber`/`originalSessionReferenceNumber` (open-api.json)
 * i potwierdzenie skrótu pierwotnej faktury listą faktur sesji (GET /sessions/{ref}/invoices),
 * `Retry-After` przy 429 (limity/limity-api.md).
 *
 * ⚠️ PRZED LIVE: przejść smoke na api-test/api-demo z realnym tokenem/certyfikatem KSeF
 * (ops/scripts/ksef-smoke.ts).
 */

export type UwierzytelnienieKsef =
  | { metoda: 'token'; token: string }
  | {
      metoda: 'certyfikat';
      /** Certyfikat KSeF typu Authentication (PEM). */
      certyfikatPem: string;
      /** Klucz prywatny PKCS#8 PEM (bez hasła — w ustawieniach leży zaszyfrowany kluczem KMS). */
      kluczPem: string;
      typIdentyfikatora: TypIdentyfikatoraKsef;
    };

/** Para tokenów z /auth/token/redeem — trzymana w pamięci procesu między cyklami, nigdy w bazie ani logach. */
export interface TokenyKsef {
  accessToken: string;
  accessDo: number;
  refreshToken: string | null;
  refreshDo: number | null;
}
export interface PamiecTokenowKsef {
  tokeny: TokenyKsef | null;
}

export interface KsefV2Config {
  /** np. https://api-test.ksef.mf.gov.pl/api/v2 */
  baseUrl: string;
  /** NIP kontekstu (operatora). */
  nip: string;
  /** Token KSeF (z Aplikacji Podatnika) — zgodność wstecz; nowy kod podaje `uwierzytelnienie`. */
  token?: string;
  uwierzytelnienie?: UwierzytelnienieKsef;
  /** Wspólna dla cykli pamięć tokenów — bez niej każde openSession to pełne uwierzytelnienie. */
  pamiec?: PamiecTokenowKsef;
  timeoutMs?: number;
}

/** Zapas ważności accessToken, poniżej którego odświeżamy go przed użyciem. */
const ZAPAS_ACCESS_MS = 2 * 60_000;

export class KsefV2ApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly body?: unknown,
    /** Błąd po stronie dostępności KSeF, nie dokumentu — faktura zostaje do ponowienia. */
    public readonly przejsciowy = false,
    /**
     * Decyzja 15.10 (#3): wysyłka faktury bez odpowiedzi (limit czasu, sieć, 5xx, 2xx bez numeru referencyjnego) —
     * KSeF mógł ją przyjąć. Ponowna wysyłka dałaby duplikat; faktura idzie „do wyjaśnienia”.
     */
    public readonly niepewny = false,
    /** HTTP 429: ile sekund KSeF każe czekać (nagłówek `Retry-After`, limity/limity-api.md). */
    public readonly retryAfterS?: number,
  ) {
    super(message);
  }
}

/**
 * Kody błędów sieci, przy których żądanie NIE dotarło do KSeF (brak połączenia) — wysyłka faktury
 * na pewno się nie odbyła, więc to nie jest „wynik niepewny”.
 */
const BLEDY_PRZED_WYSLANIEM = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT']);
function niewyslano(err: unknown): boolean {
  const przyczyna = (err as { przyczyna?: unknown }).przyczyna as { code?: string } | undefined;
  return Boolean(przyczyna?.code && BLEDY_PRZED_WYSLANIEM.has(przyczyna.code));
}

/**
 * API 2.8.0 (api-changelog.md, PRD od 23.09.2026): POST /sessions/online/{ref}/invoices może
 * zwrócić HTTP 400 z kodem 21184 „Sesja tymczasowo niedostępna” (prace serwisowe). Zalecenie MF:
 * otworzyć nową sesję i kontynuować wysyłkę.
 * https://github.com/CIRFMF/ksef-docs/blob/main/api-changelog.md#wersja-280
 */
export const KOD_SESJA_TYMCZASOWO_NIEDOSTEPNA = 21184;

/** Kody `exception.exceptionDetailList[].exceptionCode` z ExceptionResponse (open-api.json). */
export function kodyBleduKsef(body: unknown): number[] {
  const lista = (body as { exception?: { exceptionDetailList?: { exceptionCode?: unknown }[] } } | null)
    ?.exception?.exceptionDetailList;
  return Array.isArray(lista)
    ? lista.map((d) => d?.exceptionCode).filter((k): k is number => typeof k === 'number')
    : [];
}

interface PublicKeyCert {
  certificate: string; // base64 DER
  certificateId: string;
  publicKeyId: string;
  validFrom: string;
  validTo: string;
  usage: string[];
}

interface SelectedKey {
  publicKeyId: string;
  key: X509Certificate;
}

const CTX_IDENTIFIER_TYPE = 'Nip'; // AuthenticationTokenContextIdentifierType.Nip
const AUTH_POLL_ATTEMPTS = 20;
const AUTH_POLL_DELAY_MS = 1500;

export class KsefV2Client implements InvoicingProvider {
  private readonly logger = new Logger(KsefV2Client.name);
  private accessToken: string | null = null;
  private sessionRef: string | null = null;
  private cipherKey: Buffer | null = null;
  private cipherIv: Buffer | null = null;
  private symKeyId: string | null = null;
  private sessionClosed = false;
  private readonly uwierzytelnienie: UwierzytelnienieKsef;

  constructor(private readonly config: KsefV2Config) {
    this.uwierzytelnienie = config.uwierzytelnienie ?? { metoda: 'token', token: config.token ?? '' };
  }

  // --- InvoicingProvider -----------------------------------------------------

  async openSession(): Promise<void> {
    const { tokenKey, symKey } = await this.fetchPublicKeys();
    this.symKeyId = symKey.publicKeyId;
    // pamiętamy klucz symetryczny (do lazy-open online session przy 1. fakturze)
    this.symCertKey = symKey.key;
    this.accessToken = await this.zapewnijAccessToken(tokenKey);
  }

  /**
   * accessToken z pamięci (ważny jeszcze ≥ 2 min), odświeżony refreshTokenem albo — gdy żadnego nie ma —
   * z pełnego uwierzytelnienia (uwierzytelnianie.md, pkt 4–5). Odmowa odświeżenia (4xx) = pełne
   * uwierzytelnienie; niedostępność KSeF przy odświeżaniu idzie wyżej jak każda inna.
   */
  private async zapewnijAccessToken(tokenKey: SelectedKey | null): Promise<string> {
    const pamiec = this.config.pamiec;
    const teraz = Date.now();
    const t = pamiec?.tokeny;
    if (t && t.accessDo - teraz > ZAPAS_ACCESS_MS) return t.accessToken;
    if (pamiec && t?.refreshToken && (t.refreshDo == null || t.refreshDo - teraz > ZAPAS_ACCESS_MS)) {
      try {
        const odswiezony = await this.odswiezAccessToken(t.refreshToken);
        pamiec.tokeny = { ...t, ...odswiezony };
        return odswiezony.accessToken;
      } catch (err) {
        const status = (err as KsefV2ApiError).httpStatus;
        if (status === undefined || status >= 500 || status === 429) throw err;
        this.logger.warn(`KSeF: odświeżenie tokenu odrzucone (HTTP ${status}) – uwierzytelniam od nowa.`);
        pamiec.tokeny = null;
      }
    }
    const tokeny = await this.uwierzytelnij(tokenKey);
    if (pamiec) pamiec.tokeny = tokeny;
    this.logger.log(`KSeF 2.0: uwierzytelniono (${this.uwierzytelnienie.metoda === 'certyfikat' ? 'certyfikat, XAdES' : 'token KSeF'}).`);
    return tokeny.accessToken;
  }

  private async uwierzytelnij(tokenKey: SelectedKey | null): Promise<TokenyKsef> {
    const challenge = await this.authChallenge();
    let authToken: { authenticationToken: string; referenceNumber: string };
    if (this.uwierzytelnienie.metoda === 'certyfikat') {
      const u = this.uwierzytelnienie;
      const podpisany = podpiszAuthTokenRequest({
        challenge: challenge.challenge,
        nip: this.config.nip,
        typIdentyfikatora: u.typIdentyfikatora,
        certyfikat: wczytajCertyfikat(u.certyfikatPem),
        klucz: wczytajKluczPrywatny(u.kluczPem),
      });
      authToken = await this.submitXades(podpisany);
    } else {
      const encryptedToken = this.rsaEncrypt(
        tokenKey!.key,
        Buffer.from(`${this.uwierzytelnienie.token}|${challenge.timestampMs}`, 'utf8'),
      ).toString('base64');
      authToken = await this.submitKsefToken(challenge.challenge, encryptedToken, tokenKey!.publicKeyId);
    }
    await this.pollAuthStatus(authToken.referenceNumber, authToken.authenticationToken);
    return await this.redeemAccessToken(authToken.authenticationToken);
  }

  async sendInvoice(invoiceXml: string, opcje: OpcjeWysylki = {}): Promise<InvoiceSendResult> {
    try {
      return await this.wyslijWSesji(invoiceXml, opcje);
    } catch (err) {
      if (!(err instanceof KsefV2ApiError) || !kodyBleduKsef(err.body).some((k) => KODY_NOWA_SESJA.includes(k))) {
        throw err;
      }
      // 21184 (API 2.8.0) i pokrewne (21155 limit faktur w sesji, 21173 brak sesji, 21180 status sesji):
      // bieżąca sesja nie przyjmie faktury — porzucamy ją i, zgodnie z changelogiem 2.8.0, otwieramy nową.
      // Jedna próba; potem faktura czeka na cykl.
      this.logger.warn(`KSeF: sesja ${this.sessionRef} nie przyjmuje faktur (${kodyBleduKsef(err.body).join(',')}) – otwieram nową.`);
      this.porzucSesjeOnline();
      try {
        return await this.wyslijWSesji(invoiceXml, opcje);
      } catch (err2) {
        if (err2 instanceof KsefV2ApiError && kodyBleduKsef(err2.body).some((k) => KODY_NOWA_SESJA.includes(k))) {
          this.porzucSesjeOnline();
          throw new KsefV2ApiError(err2.message, err2.httpStatus, err2.body, true);
        }
        throw err2;
      }
    }
  }

  private porzucSesjeOnline(): void {
    this.sessionRef = null;
    this.sessionClosed = false;
    this.cipherKey = null;
    this.cipherIv = null;
  }

  private async wyslijWSesji(invoiceXml: string, opcje: OpcjeWysylki): Promise<InvoiceSendResult> {
    await this.ensureOnlineSession();
    const plaintext = Buffer.from(invoiceXml, 'utf8');
    const ciphertext = this.aesEncrypt(plaintext);

    const body: Record<string, unknown> = {
      invoiceHash: this.sha256b64(plaintext),
      invoiceSize: plaintext.length,
      encryptedInvoiceHash: this.sha256b64(ciphertext),
      encryptedInvoiceSize: ciphertext.length,
      encryptedInvoiceContent: ciphertext.toString('base64'),
    };
    // open-api.json, SendInvoiceRequest: `offlineMode` (domyślnie false) i `hashOfCorrectedInvoice`.
    if (opcje.offlineMode) body.offlineMode = true;
    if (opcje.hashOfCorrectedInvoice) body.hashOfCorrectedInvoice = opcje.hashOfCorrectedInvoice;
    let res: Response;
    try {
      res = await this.http(`/sessions/online/${this.sessionRef}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeader() },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // 429 przyszło z odpowiedzią — faktura nie została przyjęta, to nie jest wynik niepewny.
      if (err instanceof KsefV2ApiError && err.httpStatus !== undefined) throw err;
      // Brak połączenia — żądanie nie wyszło. Inaczej: wyszło, odpowiedzi nie ma, nie wiemy, czy KSeF je przyjął.
      if (niewyslano(err)) throw new KsefV2ApiError((err as Error).message, undefined, undefined, true, false);
      throw new KsefV2ApiError((err as Error).message, undefined, undefined, false, true);
    }
    const json = (await res.json().catch(() => null)) as { referenceNumber?: string } | null;
    if (!res.ok || !json?.referenceNumber) {
      throw new KsefV2ApiError(
        `KSeF 2.0 wysyłka faktury nie powiodła się (HTTP ${res.status})`,
        res.status,
        json,
        false,
        res.status >= 500 || res.ok,
      );
    }
    // Kodujemy sessionRef|invoiceRef — status per faktura wymaga obu w kolejnym cyklu.
    return { elementReferenceNumber: `${this.sessionRef}|${json.referenceNumber}` };
  }

  async invoiceStatus(elementReferenceNumber: string): Promise<InvoiceStatusResult> {
    const [sessionRef, invoiceRef] = elementReferenceNumber.split('|');
    if (!sessionRef || !invoiceRef) {
      throw new KsefV2ApiError(`Nieprawidłowy identyfikator faktury: ${elementReferenceNumber}`);
    }
    if (!this.accessToken) {
      throw new KsefV2ApiError('Brak accessToken – wywołaj openSession() przed invoiceStatus().');
    }
    const res = await this.http(`/sessions/${sessionRef}/invoices/${invoiceRef}`, {
      method: 'GET',
      headers: this.authHeader(),
    });
    const json = (await res.json().catch(() => null)) as {
      status?: { code?: number; description?: string; details?: string[]; extensions?: Record<string, string | null> };
      ksefNumber?: string;
      acquisitionTimestamp?: string;
      acquisitionDate?: string;
    } | null;
    if (!res.ok) {
      throw new KsefV2ApiError(
        `KSeF 2.0 status faktury nie powiódł się (HTTP ${res.status})`,
        res.status,
        json,
      );
    }
    const code = json?.status?.code ?? null;
    const ksefNumber = json?.ksefNumber ?? null;
    const ext = json?.status?.extensions;
    const wynik: InvoiceStatusResult = {
      processed: Boolean(ksefNumber),
      ksefReferenceNumber: ksefNumber,
      acquisitionTimestamp: json?.acquisitionTimestamp ?? json?.acquisitionDate ?? null,
      statusCode: code,
      statusDescription: json?.status?.description ?? null,
      rejected: code != null && code >= 400,
    };
    if (code === KOD_DUPLIKAT_FAKTURY && ext?.originalKsefNumber) {
      wynik.duplikat = { numerKsef: ext.originalKsefNumber, sesja: ext.originalSessionReferenceNumber ?? null };
    }
    if (json?.status?.details?.length) wynik.szczegoly = json.status.details;
    return wynik;
  }

  /**
   * GET /sessions/{ref}/invoices (open-api.json; stronicowanie nagłówkiem `x-continuation-token`) —
   * odszukanie faktury po numerze KSeF, żeby porównać jej skrót z naszym plikiem.
   */
  async fakturaWSesji(sesja: string, numerKsef: string): Promise<{ skrotB64: string; przyjeto: string | null } | null> {
    if (!this.accessToken) throw new KsefV2ApiError('Brak accessToken – wywołaj openSession() przed fakturaWSesji().');
    let kontynuacja: string | null = null;
    for (let strona = 0; strona < 20; strona++) {
      const res = await this.http(`/sessions/${sesja}/invoices?pageSize=1000`, {
        method: 'GET',
        headers: { ...this.authHeader(), ...(kontynuacja ? { 'x-continuation-token': kontynuacja } : {}) },
      });
      const json = (await res.json().catch(() => null)) as {
        continuationToken?: string | null;
        invoices?: Array<{ ksefNumber?: string | null; invoiceHash?: string; acquisitionDate?: string | null }>;
      } | null;
      if (!res.ok) {
        throw new KsefV2ApiError(`KSeF 2.0 lista faktur sesji nie powiodła się (HTTP ${res.status})`, res.status, json);
      }
      const f = json?.invoices?.find((x) => x.ksefNumber === numerKsef);
      if (f?.invoiceHash) return { skrotB64: f.invoiceHash, przyjeto: f.acquisitionDate ?? null };
      kontynuacja = json?.continuationToken ?? null;
      if (!kontynuacja) return null;
    }
    return null;
  }

  /**
   * Pobiera UPO pojedynczej faktury (XML podpisany XAdES przez MF).
   * GET /sessions/{ref}/invoices/{invoiceRef}/upo — dostępne po zamknięciu sesji i przyjęciu faktury.
   * Dla faktury przyjętej jako duplikat (440) identyfikator ma postać `sesjaPierwotnej|ksef:{numer}` —
   * wtedy GET /sessions/{ref}/invoices/ksef/{ksefNumber}/upo (open-api.json).
   */
  async downloadUpo(elementReferenceNumber: string): Promise<string> {
    const [sessionRef, invoiceRef] = elementReferenceNumber.split('|');
    if (!sessionRef || !invoiceRef) {
      throw new KsefV2ApiError(`Nieprawidłowy identyfikator faktury: ${elementReferenceNumber}`);
    }
    if (!this.accessToken) {
      throw new KsefV2ApiError('Brak accessToken – wywołaj openSession() przed downloadUpo().');
    }
    const sciezka = invoiceRef.startsWith('ksef:')
      ? `/sessions/${sessionRef}/invoices/ksef/${invoiceRef.slice(5)}/upo`
      : `/sessions/${sessionRef}/invoices/${invoiceRef}/upo`;
    const res = await this.http(sciezka, {
      method: 'GET',
      headers: this.authHeader(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new KsefV2ApiError(
        `KSeF 2.0 pobranie UPO nie powiodło się (HTTP ${res.status})`,
        res.status,
        body,
      );
    }
    return await res.text();
  }

  async terminateSession(): Promise<void> {
    if (!this.sessionRef || this.sessionClosed || !this.accessToken) {
      this.reset();
      return;
    }
    try {
      // Zamknięcie sesji wyzwala generowanie UPO po stronie KSeF.
      await this.http(`/sessions/online/${this.sessionRef}/close`, {
        method: 'POST',
        headers: this.authHeader(),
      });
      this.sessionClosed = true;
    } catch {
      /* best-effort */
    } finally {
      this.reset();
    }
  }

  // --- Auth ------------------------------------------------------------------

  private symCertKey: X509Certificate | null = null;

  private async fetchPublicKeys(): Promise<{ tokenKey: SelectedKey | null; symKey: SelectedKey }> {
    const res = await this.http('/security/public-key-certificates', { method: 'GET' });
    const list = (await res.json().catch(() => null)) as PublicKeyCert[] | null;
    if (!res.ok || !Array.isArray(list) || list.length === 0) {
      throw new KsefV2ApiError(
        `KSeF 2.0: nie udało się pobrać kluczy publicznych (HTTP ${res.status})`,
        res.status,
        list,
      );
    }
    const pick = (usage: string): SelectedKey => {
      const now = Date.now();
      const candidates = list
        .filter(
          (c) =>
            c.usage?.includes(usage) &&
            new Date(c.validFrom).getTime() <= now &&
            new Date(c.validTo).getTime() > now,
        )
        .sort((a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime());
      const chosen = candidates[0];
      if (!chosen) {
        throw new KsefV2ApiError(`KSeF 2.0: brak ważnego klucza publicznego dla usage=${usage}`);
      }
      return {
        publicKeyId: chosen.publicKeyId,
        key: new X509Certificate(Buffer.from(chosen.certificate, 'base64')),
      };
    };
    const symKey = pick('SymmetricKeyEncryption');
    // Klucz do szyfrowania tokenu potrzebny tylko przy logowaniu tokenem (i tylko gdy nie ma tokenów w pamięci).
    return { tokenKey: this.uwierzytelnienie.metoda === 'token' ? pick('KsefTokenEncryption') : null, symKey };
  }

  private async authChallenge(): Promise<{ challenge: string; timestampMs: number }> {
    // open-api.json: POST /auth/challenge nie przyjmuje request body — nie wysyłamy go.
    const res = await this.http('/auth/challenge', { method: 'POST' });
    const json = (await res.json().catch(() => null)) as
      | { challenge?: string; timestamp?: string }
      | null;
    if (!res.ok || !json?.challenge || !json.timestamp) {
      throw new KsefV2ApiError(
        `KSeF 2.0 /auth/challenge nie powiódł się (HTTP ${res.status})`,
        res.status,
        json,
      );
    }
    return { challenge: json.challenge, timestampMs: new Date(json.timestamp).getTime() };
  }

  private async submitKsefToken(
    challenge: string,
    encryptedToken: string,
    publicKeyId: string,
  ): Promise<{ authenticationToken: string; referenceNumber: string }> {
    const res = await this.http('/auth/ksef-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge,
        contextIdentifier: { type: CTX_IDENTIFIER_TYPE, value: this.config.nip },
        encryptedToken,
        publicKeyId,
      }),
    });
    return this.odpowiedzUwierzytelnienia(res, '/auth/ksef-token');
  }

  /** POST /auth/xades-signature — podpisany dokument XML w treści (application/xml), uwierzytelnianie.md 2.1 pkt 3. */
  private async submitXades(podpisanyXml: string): Promise<{ authenticationToken: string; referenceNumber: string }> {
    const res = await this.http('/auth/xades-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: podpisanyXml,
    });
    return this.odpowiedzUwierzytelnienia(res, '/auth/xades-signature');
  }

  private async odpowiedzUwierzytelnienia(res: Response, sciezka: string): Promise<{ authenticationToken: string; referenceNumber: string }> {
    const json = (await res.json().catch(() => null)) as {
      authenticationToken?: { token?: string } | string;
      referenceNumber?: string;
    } | null;
    const authToken =
      typeof json?.authenticationToken === 'string'
        ? json.authenticationToken
        : json?.authenticationToken?.token;
    if (!res.ok || !authToken || !json?.referenceNumber) {
      const opis = komunikatWyjatkuXades(kodyBleduKsef(json));
      throw new KsefV2ApiError(
        `KSeF 2.0 ${sciezka} nie powiódł się (HTTP ${res.status})${opis ? `: ${opis}` : ''}`,
        res.status,
        json,
      );
    }
    return { authenticationToken: authToken, referenceNumber: json.referenceNumber };
  }

  private async pollAuthStatus(referenceNumber: string, authToken: string): Promise<void> {
    for (let i = 0; i < AUTH_POLL_ATTEMPTS; i++) {
      const res = await this.http(`/auth/${referenceNumber}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = (await res.json().catch(() => null)) as {
        status?: { code?: number; description?: string };
      } | null;
      const code = json?.status?.code;
      // 200 = uwierzytelnienie zakończone sukcesem; 4xx = błąd.
      if (code === 200) return;
      if (code != null && code >= 400) {
        const komunikat = `KSeF 2.0 uwierzytelnianie odrzucone: ${komunikatUwierzytelnienia(code, json?.status?.description)}`;
        // 500/550 — problem po stronie KSeF (open-api.json: „Spróbuj ponownie”), nie naszych poświadczeń:
        // bez httpStatus, żeby serwis potraktował to jak niedostępność, a nie odrzucony token/certyfikat.
        if (STATUSY_UWIERZYTELNIENIA_PRZEJSCIOWE.includes(code)) throw new KsefV2ApiError(komunikat, undefined, json, true);
        throw new KsefV2ApiError(komunikat, res.status, json);
      }
      await this.delay(AUTH_POLL_DELAY_MS);
    }
    throw new KsefV2ApiError('KSeF 2.0: przekroczono czas oczekiwania na uwierzytelnienie.');
  }

  private async redeemAccessToken(authToken: string): Promise<TokenyKsef> {
    const res = await this.http('/auth/token/redeem', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const json = (await res.json().catch(() => null)) as {
      accessToken?: { token?: string; validUntil?: string } | string;
      refreshToken?: { token?: string; validUntil?: string } | string;
    } | null;
    const access = this.tokenZOdpowiedzi(json?.accessToken);
    if (!res.ok || !access) {
      throw new KsefV2ApiError(
        `KSeF 2.0 /auth/token/redeem nie powiódł się (HTTP ${res.status})`,
        res.status,
        json,
      );
    }
    const refresh = this.tokenZOdpowiedzi(json?.refreshToken);
    return { accessToken: access.token, accessDo: access.do, refreshToken: refresh?.token ?? null, refreshDo: refresh ? refresh.do : null };
  }

  /** POST /auth/token/refresh z `Authorization: Bearer {refreshToken}` → nowy accessToken (uwierzytelnianie.md, pkt 5). */
  private async odswiezAccessToken(refreshToken: string): Promise<{ accessToken: string; accessDo: number }> {
    const res = await this.http('/auth/token/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${refreshToken}` },
    });
    const json = (await res.json().catch(() => null)) as { accessToken?: { token?: string; validUntil?: string } | string } | null;
    const access = this.tokenZOdpowiedzi(json?.accessToken);
    if (!res.ok || !access) {
      throw new KsefV2ApiError(`KSeF 2.0 /auth/token/refresh nie powiódł się (HTTP ${res.status})`, res.status, json);
    }
    return { accessToken: access.token, accessDo: access.do };
  }

  /** `TokenInfo` {token, validUntil}; bez daty ważności zakładamy krótki czas życia (kilkanaście minut wg dokumentacji). */
  private tokenZOdpowiedzi(t: { token?: string; validUntil?: string } | string | undefined): { token: string; do: number } | null {
    const token = typeof t === 'string' ? t : t?.token;
    if (!token) return null;
    const waznosc = typeof t === 'object' && t.validUntil ? new Date(t.validUntil).getTime() : NaN;
    return { token, do: Number.isFinite(waznosc) ? waznosc : Date.now() + 10 * 60_000 };
  }

  // --- Online session --------------------------------------------------------

  private async ensureOnlineSession(): Promise<void> {
    if (this.sessionRef) return;
    if (!this.accessToken || !this.symCertKey || !this.symKeyId) {
      throw new KsefV2ApiError('Brak uwierzytelnienia – wywołaj openSession() najpierw.');
    }
    this.cipherKey = randomBytes(32); // AES-256
    this.cipherIv = randomBytes(16); // 128-bit IV
    const encryptedSymmetricKey = this.rsaEncrypt(this.symCertKey, this.cipherKey).toString(
      'base64',
    );

    const res = await this.http('/sessions/online', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeader() },
      body: JSON.stringify({
        formCode: {
          systemCode: FA3_SYSTEM_CODE,
          schemaVersion: FA3_SCHEMA_VERSION,
          value: FA3_FORM_VALUE,
        },
        // Zweryfikowane z open-api.json (KSeF API 2.6.0): publicKeyId jest polem
        // obiektu `encryption`, NIE na najwyższym poziomie żądania.
        encryption: {
          encryptedSymmetricKey,
          initializationVector: this.cipherIv.toString('base64'),
          publicKeyId: this.symKeyId,
        },
      }),
    });
    const json = (await res.json().catch(() => null)) as { referenceNumber?: string } | null;
    if (!res.ok || !json?.referenceNumber) {
      // Przegląd 15.10: sesja otwiera się leniwie, wewnątrz sendInvoice — 4xx tutaj (np. klucz po rotacji
      // certyfikatu MF, kod formularza) nie mówi nic o dokumencie. Bez znacznika „przejściowy” serwis oznaczał
      // każdą fakturę partii jako odrzuconą przez KSeF. Faktury zostają w kolejce.
      throw new KsefV2ApiError(
        `KSeF 2.0 otwarcie sesji online nie powiodło się (HTTP ${res.status})`,
        res.status,
        json,
        true,
      );
    }
    this.sessionRef = json.referenceNumber;
    this.sessionClosed = false;
    this.logger.log(`KSeF 2.0: sesja online otwarta (${this.sessionRef}).`);
  }

  // --- Crypto helpers --------------------------------------------------------

  private rsaEncrypt(cert: X509Certificate, data: Buffer): Buffer {
    return publicEncrypt(
      {
        key: cert.publicKey,
        padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      data,
    );
  }

  private aesEncrypt(plaintext: Buffer): Buffer {
    const cipher = createCipheriv('aes-256-cbc', this.cipherKey!, this.cipherIv!);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
  }

  private sha256b64(data: Buffer): string {
    return createHash('sha256').update(data).digest('base64');
  }

  // --- HTTP ------------------------------------------------------------------

  private authHeader(): Record<string, string> {
    return this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {};
  }

  private reset(): void {
    this.sessionRef = null;
    this.cipherKey = null;
    this.cipherIv = null;
    this.accessToken = null;
    this.symCertKey = null;
    this.symKeyId = null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async http(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 30_000);
    let res: Response;
    try {
      res = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } catch (err) {
      const blad = new KsefV2ApiError(
        `KSeF 2.0 niedostępny (${path}): ${err instanceof Error ? err.message : String(err)}`,
      );
      Object.assign(blad, { przyczyna: (err as { cause?: unknown })?.cause });
      throw blad;
    } finally {
      clearTimeout(timer);
    }
    // API 2.6.0: ostrzeżenia techniczne bez wpływu na wynik operacji —
    // logujemy, bo zapowiadają zachowania, które w przyszłości będą odrzucane.
    const warning = res.headers.get('X-System-Warning');
    if (warning) this.logger.warn(`KSeF X-System-Warning (${path}): ${warning}`);
    // limity/limity-api.md: 429 + `Retry-After` (sekundy); kolejne żądania są blokowane, a „wielokrotne
    // przekroczenia mogą skutkować znacznym wydłużeniem blokady” — serwis wstrzymuje cykle na ten czas.
    if (res.status === 429) {
      const ra = Number(res.headers.get('Retry-After'));
      throw new KsefV2ApiError(
        `KSeF: przekroczony limit żądań (${path})${Number.isFinite(ra) && ra > 0 ? ` – ponowienie za ${ra} s` : ''}.`,
        429,
        await res.json().catch(() => null),
        true,
        false,
        Number.isFinite(ra) && ra > 0 ? ra : undefined,
      );
    }
    // 401 przy tokenie z pamięci (np. unieważniony) — następny cykl uwierzytelnia się od nowa.
    if (res.status === 401 && this.config.pamiec) this.config.pamiec.tokeny = null;
    return res;
  }
}
