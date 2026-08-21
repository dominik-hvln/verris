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
}

