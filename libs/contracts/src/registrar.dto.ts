/** Katalog TLD oferowanych w wyszukiwarce (kolejność = popularne najpierw). */
export const REGISTRAR_TLD_CATALOG = [
  { extension: 'pl', label: '.pl', popular: true },
  { extension: 'com', label: '.com', popular: true },
  { extension: 'eu', label: '.eu', popular: true },
  { extension: 'com.pl', label: '.com.pl', popular: true },
  { extension: 'org.pl', label: '.org.pl', popular: false },
  { extension: 'net.pl', label: '.net.pl', popular: false },
  { extension: 'org', label: '.org', popular: false },
  { extension: 'net', label: '.net', popular: false },
  { extension: 'info', label: '.info', popular: false },
  { extension: 'biz', label: '.biz', popular: false },
  { extension: 'online', label: '.online', popular: false },
  { extension: 'store', label: '.store', popular: false },
] as const;

export type RegistrarTldCatalogEntry = (typeof REGISTRAR_TLD_CATALOG)[number];

/** Cena dla klienta (brutto z rozbiciem VAT). */
export interface DomainCustomerPriceDto {
  grossAmount: string | null;
  netAmount: string | null;
  vatAmount: string | null;
  currency: string;
  vatRate: number;
}

export interface DomainSearchResultDto {
  domain: string;
  extension: string;
  label: string;
  popular: boolean;
  available: boolean;
  premium: boolean;
  /** Rejestracja (1. rok) — brutto. */
  register: DomainCustomerPriceDto;
  /** Odnowienie (kolejne lata) — brutto za 1 rok; null gdy niedostępne. */
  renewal: DomainCustomerPriceDto | null;
  /** @deprecated Użyj register.grossAmount */
  priceAmount: string | null;
  currency: string;
}

export interface DomainPeriodQuoteDto {
  years: number;
  /** Kwota brutto za cały okres rejestracji. */
  priceAmount: string | null;
  netAmount: string | null;
  vatAmount: string | null;
  currency: string;
  vatRate: number;
}

export interface DomainPeriodQuotesDto {
  domain: string;
  quotes: DomainPeriodQuoteDto[];
  /** Cena odnowienia za 1 rok po okresie promocyjnym / pierwszym — brutto. */
  renewalPerYear: DomainCustomerPriceDto | null;
}
