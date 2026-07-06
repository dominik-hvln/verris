import { createHash, publicEncrypt, constants as cryptoConstants } from 'crypto';
import { Logger } from '@nestjs/common';

/**
 * @deprecated Legacy KSeF 1.0 / FA(2). Od 1.02.2026 obowiązuje KSeF 2.0 / FA(3)
 * — używaj `KsefV2Client`. Ten klient jest utrzymywany wyłącznie jako awaryjny
 * fallback (`KSEF_API_VERSION=v1`) i do wygaszenia. Nie rozwijać.
 *
 * B-1 — klient KSeF (sesja interaktywna, uwierzytelnienie tokenem).
 *
 * Implementuje udokumentowany przepływ API KSeF (batch/online v1, stabilny od
 * 2022, utrzymywany w okresie przejściowym KSeF 2.0):
 *   1. POST /online/Session/AuthorisationChallenge  → challenge + timestamp
 *   2. POST /online/Session/InitToken (XML)         → sessionToken
 *      (token API zaszyfrowany RSA kluczem publicznym MF: "token|timestampMs")
 *   3. PUT  /online/Invoice/Send                    → elementReferenceNumber
 *   4. GET  /online/Invoice/Status/{ref}            → numer KSeF po przetworzeniu
 *   5. GET  /online/Session/Terminate
 *
 * ⚠️ PRZED LIVE: zweryfikować kontrakt na środowisku testowym
 * (https://ksef-test.mf.gov.pl) — `ops/scripts/ksef-smoke.ts`. MF publikuje
 * klucz publiczny per środowisko (env `KSEF_PUBLIC_KEY_PEM_B64`).
 */

export interface KsefClientConfig {
  /** np. https://ksef-test.mf.gov.pl/api lub https://ksef.mf.gov.pl/api */
  baseUrl: string;
  /** NIP podmiotu (kontekst sesji). */
  nip: string;
  /** Token autoryzacyjny wygenerowany w Aplikacji Podatnika KSeF. */
  token: string;
  /** Klucz publiczny MF (PEM) właściwy dla środowiska. */
  publicKeyPem: string;
  timeoutMs?: number;
}

export interface KsefSendResult {
  elementReferenceNumber: string;
}

export interface KsefInvoiceStatus {
  processed: boolean;
  ksefReferenceNumber: string | null;
  acquisitionTimestamp: string | null;
  /** Kod statusu przetwarzania (200/3xx wg API) + opis przy błędzie. */
  statusCode: number | null;
  statusDescription: string | null;
  rejected: boolean;
}

export class KsefApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

export class KsefClient {
  private readonly logger = new Logger(KsefClient.name);
  private sessionToken: string | null = null;

  constructor(private readonly config: KsefClientConfig) {}

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------

  async openSession(): Promise<void> {
    const challenge = await this.authorisationChallenge();
    const initXml = this.buildInitTokenXml(challenge);

    const res = await this.http('/online/Session/InitToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: initXml,
    });
    const body = (await res.json().catch(() => null)) as
      | { sessionToken?: { token?: string }; exception?: unknown }
      | null;
    const token = body?.sessionToken?.token;
    if (!res.ok || !token) {
      throw new KsefApiError(
        `KSeF InitToken nie powiódł się (HTTP ${res.status})`,
        res.status,
        body,
      );
    }
    this.sessionToken = token;
    this.logger.log('KSeF: sesja interaktywna otwarta');
  }

  async terminateSession(): Promise<void> {
    if (!this.sessionToken) return;
    try {
      await this.http('/online/Session/Terminate', {
        method: 'GET',
        headers: { SessionToken: this.sessionToken },
      });
    } catch {
      /* terminate jest best-effort */
    } finally {
      this.sessionToken = null;
    }
  }

  private async authorisationChallenge(): Promise<{ challenge: string; timestampMs: number }> {
    const res = await this.http('/online/Session/AuthorisationChallenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contextIdentifier: { type: 'onip', identifier: this.config.nip },
      }),
    });
    const body = (await res.json().catch(() => null)) as
      | { challenge?: string; timestamp?: string }
      | null;
    if (!res.ok || !body?.challenge || !body.timestamp) {
      throw new KsefApiError(
        `KSeF AuthorisationChallenge nie powiódł się (HTTP ${res.status})`,
        res.status,
        body,
      );
    }
    return { challenge: body.challenge, timestampMs: new Date(body.timestamp).getTime() };
  }

  /** RSA(MF public key, "token|challengeTimestampMs") → base64. */
  private encryptToken(timestampMs: number): string {
    const payload = Buffer.from(`${this.config.token}|${timestampMs}`, 'utf8');
    const encrypted = publicEncrypt(
      { key: this.config.publicKeyPem, padding: cryptoConstants.RSA_PKCS1_PADDING },
      payload,
    );
    return encrypted.toString('base64');
  }

  private buildInitTokenXml(ch: { challenge: string; timestampMs: number }): string {
    const encryptedToken = this.encryptToken(ch.timestampMs);
    // Struktura InitSessionTokenRequest wg schematu KSeF (ns3 auth v2).
    return [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<ns3:InitSessionTokenRequest',
      '  xmlns="http://ksef.mf.gov.pl/schema/gtw/svc/online/types/2021/10/01/0001"',
      '  xmlns:ns2="http://ksef.mf.gov.pl/schema/gtw/svc/types/2021/10/01/0001"',
      '  xmlns:ns3="http://ksef.mf.gov.pl/schema/gtw/svc/online/auth/request/2021/10/01/0001">',
      '  <ns3:Context>',
      `    <Challenge>${ch.challenge}</Challenge>`,
      '    <Identifier xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="ns2:SubjectIdentifierByCompanyType">',
      `      <ns2:Identifier>${this.config.nip}</ns2:Identifier>`,
      '    </Identifier>',
      '    <DocumentType>',
      '      <ns2:Service>KSeF</ns2:Service>',
      '      <ns2:FormCode>',
      '        <ns2:SystemCode>FA (2)</ns2:SystemCode>',
      '        <ns2:SchemaVersion>1-0E</ns2:SchemaVersion>',
      '        <ns2:TargetNamespace>http://crd.gov.pl/wzor/2023/06/29/12648/</ns2:TargetNamespace>',
      '        <ns2:Value>FA</ns2:Value>',
      '      </ns2:FormCode>',
      '    </DocumentType>',
      `    <Token>${encryptedToken}</Token>`,
      '  </ns3:Context>',
      '</ns3:InitSessionTokenRequest>',
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Invoices
  // ---------------------------------------------------------------------------

  async sendInvoice(invoiceXml: string): Promise<KsefSendResult> {
    this.assertSession();
    const bytes = Buffer.from(invoiceXml, 'utf8');
    const hash = createHash('sha256').update(bytes).digest('base64');

    const res = await this.http('/online/Invoice/Send', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        SessionToken: this.sessionToken!,
      },
      body: JSON.stringify({
        invoiceHash: {
          hashSHA: { algorithm: 'SHA-256', encoding: 'Base64', value: hash },
          fileSize: bytes.length,
        },
        invoicePayload: {
          type: 'plain',
          invoiceBody: bytes.toString('base64'),
        },
      }),
    });
    const body = (await res.json().catch(() => null)) as
      | { elementReferenceNumber?: string }
      | null;
    if (!res.ok || !body?.elementReferenceNumber) {
      throw new KsefApiError(
        `KSeF Invoice/Send nie powiódł się (HTTP ${res.status})`,
        res.status,
        body,
      );
    }
    return { elementReferenceNumber: body.elementReferenceNumber };
  }

  async invoiceStatus(elementReferenceNumber: string): Promise<KsefInvoiceStatus> {
    this.assertSession();
    const res = await this.http(
      `/online/Invoice/Status/${encodeURIComponent(elementReferenceNumber)}`,
      { method: 'GET', headers: { SessionToken: this.sessionToken! } },
    );
    const body = (await res.json().catch(() => null)) as {
      processingCode?: number;
      processingDescription?: string;
      invoiceStatus?: {
        invoiceNumber?: string;
        ksefReferenceNumber?: string;
        acquisitionTimestamp?: string;
      };
      exception?: unknown;
    } | null;

    if (!res.ok) {
      throw new KsefApiError(
        `KSeF Invoice/Status nie powiódł się (HTTP ${res.status})`,
        res.status,
        body,
      );
    }

    const code = body?.processingCode ?? null;
    const ksefRef = body?.invoiceStatus?.ksefReferenceNumber ?? null;
    return {
      processed: code === 200 && Boolean(ksefRef),
      ksefReferenceNumber: ksefRef,
      acquisitionTimestamp: body?.invoiceStatus?.acquisitionTimestamp ?? null,
      statusCode: code,
      statusDescription: body?.processingDescription ?? null,
      // 4xx w processingCode = odrzucenie (np. błąd walidacji XSD).
      rejected: code !== null && code >= 400,
    };
  }

  // ---------------------------------------------------------------------------

  private assertSession(): void {
    if (!this.sessionToken) {
      throw new KsefApiError('Brak otwartej sesji KSeF — wywołaj openSession().');
    }
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
      throw new KsefApiError(
        `KSeF niedostępny (${path}): ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
