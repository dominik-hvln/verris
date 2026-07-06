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
} from './invoicing-provider.interface';
import { FA3_SCHEMA_VERSION, FA3_SYSTEM_CODE } from './fa3-xml.builder';

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
 * ⚠️ PRZED LIVE: przejść smoke na api-test/api-demo z realnym tokenem KSeF
 * (ops/scripts/ksef-smoke.ts) oraz zwalidować XML FA(3) walidatorem XSD MF.
 */

export interface KsefV2Config {
  /** np. https://api-test.ksef.mf.gov.pl/api/v2 */
  baseUrl: string;
  /** NIP kontekstu (operatora). */
  nip: string;
  /** Token KSeF (z Aplikacji Podatnika). */
  token: string;
  timeoutMs?: number;
}

export class KsefV2ApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly body?: unknown,
  ) {
    super(message);
  }
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

  constructor(private readonly config: KsefV2Config) {}

  // --- InvoicingProvider -----------------------------------------------------

  async openSession(): Promise<void> {
    const { tokenKey, symKey } = await this.fetchPublicKeys();
    this.symKeyId = symKey.publicKeyId;
    // pamiętamy klucz symetryczny (do lazy-open online session przy 1. fakturze)
    this.symCertKey = symKey.key;

    const challenge = await this.authChallenge();
    const encryptedToken = this.rsaEncrypt(
      tokenKey.key,
      Buffer.from(`${this.config.token}|${challenge.timestampMs}`, 'utf8'),
    ).toString('base64');

    const authToken = await this.submitKsefToken(
      challenge.challenge,
      encryptedToken,
      tokenKey.publicKeyId,
    );
    await this.pollAuthStatus(authToken.referenceNumber, authToken.authenticationToken);
    this.accessToken = await this.redeemAccessToken(authToken.authenticationToken);
    this.logger.log('KSeF 2.0: uwierzytelniono (accessToken uzyskany).');
  }

  async sendInvoice(invoiceXml: string): Promise<InvoiceSendResult> {
    await this.ensureOnlineSession();
    const plaintext = Buffer.from(invoiceXml, 'utf8');
    const ciphertext = this.aesEncrypt(plaintext);

    const body = {
      invoiceHash: this.sha256b64(plaintext),
      invoiceSize: plaintext.length,
      encryptedInvoiceHash: this.sha256b64(ciphertext),
      encryptedInvoiceSize: ciphertext.length,
      encryptedInvoiceContent: ciphertext.toString('base64'),
    };
    const res = await this.http(`/sessions/online/${this.sessionRef}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeader() },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { referenceNumber?: string } | null;
    if (!res.ok || !json?.referenceNumber) {
      throw new KsefV2ApiError(
        `KSeF 2.0 wysyłka faktury nie powiodła się (HTTP ${res.status})`,
        res.status,
        json,
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
      throw new KsefV2ApiError('Brak accessToken — wywołaj openSession() przed invoiceStatus().');
    }
    const res = await this.http(`/sessions/${sessionRef}/invoices/${invoiceRef}`, {
      method: 'GET',
      headers: this.authHeader(),
    });
    const json = (await res.json().catch(() => null)) as {
      status?: { code?: number; description?: string };
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
    return {
      processed: Boolean(ksefNumber),
      ksefReferenceNumber: ksefNumber,
      acquisitionTimestamp: json?.acquisitionTimestamp ?? json?.acquisitionDate ?? null,
      statusCode: code,
      statusDescription: json?.status?.description ?? null,
      rejected: code != null && code >= 400,
    };
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

  private async fetchPublicKeys(): Promise<{ tokenKey: SelectedKey; symKey: SelectedKey }> {
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
    return { tokenKey: pick('KsefTokenEncryption'), symKey: pick('SymmetricKeyEncryption') };
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
    const json = (await res.json().catch(() => null)) as {
      authenticationToken?: { token?: string } | string;
      referenceNumber?: string;
    } | null;
    const authToken =
      typeof json?.authenticationToken === 'string'
        ? json.authenticationToken
        : json?.authenticationToken?.token;
    if (!res.ok || !authToken || !json?.referenceNumber) {
      throw new KsefV2ApiError(
        `KSeF 2.0 /auth/ksef-token nie powiódł się (HTTP ${res.status})`,
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
        throw new KsefV2ApiError(
          `KSeF 2.0 uwierzytelnianie odrzucone: ${json?.status?.description ?? code}`,
          res.status,
          json,
        );
      }
      await this.delay(AUTH_POLL_DELAY_MS);
    }
    throw new KsefV2ApiError('KSeF 2.0: przekroczono czas oczekiwania na uwierzytelnienie.');
  }

  private async redeemAccessToken(authToken: string): Promise<string> {
    const res = await this.http('/auth/token/redeem', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const json = (await res.json().catch(() => null)) as {
      accessToken?: { token?: string } | string;
    } | null;
    const accessToken =
      typeof json?.accessToken === 'string' ? json.accessToken : json?.accessToken?.token;
    if (!res.ok || !accessToken) {
      throw new KsefV2ApiError(
        `KSeF 2.0 /auth/token/redeem nie powiódł się (HTTP ${res.status})`,
        res.status,
        json,
      );
    }
    return accessToken;
  }

  // --- Online session --------------------------------------------------------

  private async ensureOnlineSession(): Promise<void> {
    if (this.sessionRef) return;
    if (!this.accessToken || !this.symCertKey || !this.symKeyId) {
      throw new KsefV2ApiError('Brak uwierzytelnienia — wywołaj openSession() najpierw.');
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
          value: 'FA',
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
      throw new KsefV2ApiError(
        `KSeF 2.0 otwarcie sesji online nie powiodło się (HTTP ${res.status})`,
        res.status,
        json,
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
    try {
      return await fetch(`${this.config.baseUrl.replace(/\/$/, '')}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } catch (err) {
      throw new KsefV2ApiError(
        `KSeF 2.0 niedostępny (${path}): ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
