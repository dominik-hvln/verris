/** Katalog TLD oferowanych w wyszukiwarce (kolejność = popularne najpierw). */
export const REGISTRAR_TLD_CATALOG = [
  // Najpopularniejsze (PL + globalne)
  { extension: 'pl', label: '.pl', popular: true },
  { extension: 'com', label: '.com', popular: true },
  { extension: 'eu', label: '.eu', popular: true },
  { extension: 'com.pl', label: '.com.pl', popular: true },
  { extension: 'net', label: '.net', popular: true },
  { extension: 'org', label: '.org', popular: true },
  { extension: 'io', label: '.io', popular: true },
  { extension: 'dev', label: '.dev', popular: true },
  // Regionalne PL
  { extension: 'org.pl', label: '.org.pl', popular: false },
  { extension: 'net.pl', label: '.net.pl', popular: false },
  { extension: 'info.pl', label: '.info.pl', popular: false },
  { extension: 'biz.pl', label: '.biz.pl', popular: false },
  { extension: 'waw.pl', label: '.waw.pl', popular: false },
  { extension: 'wroclaw.pl', label: '.wroclaw.pl', popular: false },
  // Klasyczne generyczne
  { extension: 'info', label: '.info', popular: false },
  { extension: 'biz', label: '.biz', popular: false },
  { extension: 'me', label: '.me', popular: false },
  { extension: 'co', label: '.co', popular: false },
  { extension: 'pro', label: '.pro', popular: false },
  // Nowe / biznesowe
  { extension: 'app', label: '.app', popular: false },
  { extension: 'online', label: '.online', popular: false },
  { extension: 'store', label: '.store', popular: false },
  { extension: 'shop', label: '.shop', popular: false },
  { extension: 'site', label: '.site', popular: false },
  { extension: 'tech', label: '.tech', popular: false },
  { extension: 'cloud', label: '.cloud', popular: false },
  { extension: 'digital', label: '.digital', popular: false },
  { extension: 'agency', label: '.agency', popular: false },
  { extension: 'studio', label: '.studio', popular: false },
  { extension: 'design', label: '.design', popular: false },
  { extension: 'blog', label: '.blog', popular: false },
  { extension: 'xyz', label: '.xyz', popular: false },
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
