/**
 * KSEF-2.0-1 — warstwa abstrakcji e-faktur (bez vendor lock-in).
 *
 * KsefService orkiestruje wysyłkę przez ten interfejs, nie znając szczegółów
 * protokołu. Implementacje:
 *   - `KsefV2Client`  — własny klient KSeF 2.0 / FA(3) (docelowy, obowiązkowy 2026).
 *   - `KsefClient`    — legacy KSeF 1.0 / FA(2) (@deprecated, do wygaszenia).
 * W przyszłości można dodać adapter integratora BSP bez zmian w KsefService.
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
}

export interface InvoicingProvider {
  /** Uwierzytelnia i przygotowuje sesję wysyłki. */
  openSession(): Promise<void>;
  /** Wysyła XML faktury; zwraca identyfikator do późniejszego sprawdzenia statusu. */
  sendInvoice(invoiceXml: string): Promise<InvoiceSendResult>;
  /** Sprawdza status wcześniej wysłanej faktury (numer KSeF / odrzucenie). */
  invoiceStatus(elementReferenceNumber: string): Promise<InvoiceStatusResult>;
  /** Zamyka sesję (dla KSeF 2.0 wyzwala generowanie UPO). Best-effort. */
  terminateSession(): Promise<void>;
}
