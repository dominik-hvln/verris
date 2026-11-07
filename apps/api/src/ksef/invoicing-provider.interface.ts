/**
 * Warstwa abstrakcji e-faktur (bez vendor lock-in).
 *
 * KsefService orkiestruje wysyłkę przez ten interfejs, nie znając szczegółów
 * protokołu. Implementacja produkcyjna: `KsefV2Client` (własny klient
 * KSeF 2.0 / FA(3)). W przyszłości można dodać adapter integratora BSP bez
 * zmian w KsefService.
 *
 * Model wysyłki (sesja interaktywna): otwórz sesję → wyślij faktury → zamknij
 * sesję → sprawdzaj status/UPO per faktura w kolejnych cyklach.
 */

export interface InvoiceSendResult {
  /**
   * Nieprzezroczysty identyfikator faktury po stronie dostawcy, zapisywany na
   * `Invoice.ksefElementRef`. Dla KSeF 2.0 koduje `sessionRef|invoiceRef`, bo
   * status per faktura wymaga obu (patrz KsefV2Client). Nie parsować poza
   * implementacją dostawcy.
   */
  elementReferenceNumber: string;
}

export interface InvoiceStatusResult {
  /** Faktura przyjęta i ma nadany numer KSeF. */
  processed: boolean;
  ksefReferenceNumber: string | null;
  acquisitionTimestamp: string | null;
  statusCode: number | null;
  statusDescription: string | null;
  /** Faktura odrzucona (błąd walidacji/przetwarzania). */
  rejected: boolean;
  /**
   * Kod 440 „Duplikat faktury” (open-api.json, SessionInvoiceStatusResponse): faktura o tym numerze jest już
   * w KSeF — numer KSeF i sesja pierwotnej z rozszerzeń statusu. `undefined` = to nie duplikat.
   */
  duplikat?: { numerKsef: string; sesja: string | null };
  /** Szczegóły statusu z KSeF (`status.details`) — do komunikatu dla operatora. */
  szczegoly?: string[];
}

export interface OpcjeWysylki {
  /** Tryb offline zadeklarowany przez podatnika (tryby-offline.md: `offlineMode: true`). */
  offlineMode?: boolean;
  /** Korekta techniczna faktury offline: SHA-256 (Base64) odrzuconego pliku (offline/korekta-techniczna.md). */
  hashOfCorrectedInvoice?: string | null;
}

export interface InvoicingProvider {
  /** Uwierzytelnia i przygotowuje sesję wysyłki. */
  openSession(): Promise<void>;
  /** Wysyła XML faktury; zwraca identyfikator do późniejszego sprawdzenia statusu. */
  sendInvoice(invoiceXml: string, opcje?: OpcjeWysylki): Promise<InvoiceSendResult>;
  /** Sprawdza status wcześniej wysłanej faktury (numer KSeF / odrzucenie). */
  invoiceStatus(elementReferenceNumber: string): Promise<InvoiceStatusResult>;
  /** Pobiera UPO (XML) przyjętej faktury. */
  downloadUpo(elementReferenceNumber: string): Promise<string>;
  /**
   * Faktura o numerze KSeF w sesji (GET /sessions/{ref}/invoices) — skrót SHA-256 (Base64) jej pliku
   * i data przyjęcia. Do potwierdzenia, że duplikat (440) to ta sama faktura. `null` = nie ma jej tam.
   */
  fakturaWSesji?(sesja: string, numerKsef: string): Promise<{ skrotB64: string; przyjeto: string | null } | null>;
  /** Zamyka sesję (dla KSeF 2.0 wyzwala generowanie UPO). Best-effort. */
  terminateSession(): Promise<void>;
}
