import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Dane sprzedawcy (Verris) na fakturach — edytowane w panelu admina. */
export class UpdateSellerCompanyDto {
  @IsString() @MinLength(2) @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(20)
  nip?: string;

  @IsOptional() @IsString() @MaxLength(20)
  regon?: string;

  @IsOptional() @IsString() @MaxLength(20)
  krs?: string;

  @IsOptional() @IsString() @MaxLength(200)
  address?: string;

  @IsOptional() @IsString() @MaxLength(100)
  city?: string;

  @IsOptional() @IsString() @MaxLength(10)
  postalCode?: string;

  @IsOptional() @IsString() @MaxLength(2)
  country?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString() @MaxLength(40)
  bankAccount?: string;
}

/** Konfiguracja KSeF 2.0 — token przekazywany tylko przy zmianie. */
export class UpdateKsefSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(['test', 'demo', 'prod'])
  env!: 'test' | 'demo' | 'prod';

  @IsOptional() @IsString() @MaxLength(20)
  nip?: string;

  @IsOptional() @IsString() @MaxLength(200)
  token?: string;

  /** KSeF 07.11 — metoda uwierzytelnienia (brak = bez zmiany). */
  @IsOptional() @IsIn(['token', 'certyfikat'])
  metoda?: 'token' | 'certyfikat';
}

/**
 * KSeF 07.11 — certyfikat KSeF i klucz prywatny (PEM albo DER w Base64, np. pliki .crt/.key z Aplikacji
 * Podatnika). Hasło tylko do zaszyfrowanego klucza; nie jest zapisywane.
 */
export class WgrajCertyfikatKsefDto {
  @IsIn(['uwierzytelnianie', 'offline'])
  rodzaj!: 'uwierzytelnianie' | 'offline';

  @IsString() @MaxLength(20000)
  certyfikat!: string;

  @IsString() @MaxLength(20000)
  klucz!: string;

  @IsOptional() @IsString() @MaxLength(500)
  haslo?: string;

  @IsOptional() @IsIn(['certificateSubject', 'certificateFingerprint'])
  typIdentyfikatora?: 'certificateSubject' | 'certificateFingerprint';
}

/**
 * FAK-01 / KSeF 12.10 — kto wystawia faktury VAT: `panel` (seria VFV/VFK, KSeF z panelu)
 * albo `zewnetrzny` (dokument rozliczeniowy VDR/VDK, fakturę wystawia program księgowy).
 */
export class UpdateTrybFakturowaniaDto {
  @IsIn(['panel', 'zewnetrzny'])
  tryb!: 'panel' | 'zewnetrzny';
}
