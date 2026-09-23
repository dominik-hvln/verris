export interface DomainDto {
  id: string;
  name: string;
  status: 'ACTIVE' | 'EXPIRED' | 'PENDING';
  createdAt?: string;
  updatedAt?: string;
  /** REGISTERED = w tabeli domen; HOSTING = domena główna konta hostingowego. */
  kind?: 'REGISTERED' | 'HOSTING';
  /** Dla domen hostingu — id usługi, do której prowadzi „Zarządzaj". */
  serviceId?: string | null;
  /** Koniec rejestracji (tylko domeny zarejestrowane przez rejestratora). */
  expiresAt?: string | null;
  /** Czy domena odnawia się sama. */
  autoRenew?: boolean;
  /** Id domeny u rejestratora — obecne tylko dla domen kupionych przez Verris (A-09/A-13/A-15). */
  registrarExternalId?: string | null;
  /** A-15 — blokada transferu u rejestratora. */
  transferLock?: boolean;
  /** A-16 — rekord TXT potwierdzający własność (tylko domeny jeszcze niezweryfikowane). */
  verification?: { recordName: string; recordValue: string } | null;
}

