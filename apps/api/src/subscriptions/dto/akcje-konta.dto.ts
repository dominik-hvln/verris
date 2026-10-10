import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Linia } from './hosting-body.dto.js';
import { TYPY_REKORDOW_DNS, TYPY_REKORDOW_DNS_DO_USUNIECIA } from './hosting-dns.dto.js';

/**
 * F2.2 — ciała tras paska akcji konta (konto-klienta-akcje.admin.controller.ts). Każde niesie powód (D2, długość
 * sprawdza serwis — ten sam komunikat dla wszystkich akcji) i opcjonalny numer zgłoszenia klienta.
 */
export class PowodOperatoraDto {
  @IsString() @MaxLength(500) powod!: string;
  /** #ab12cd34 albo pełne id zgłoszenia klienta (ZawieszenieOperatoraService.zgloszenieKlienta). */
  @IsOptional() @IsString() @Length(1, 64) zgloszenie?: string;
}

export class ResetHaslaSkrzynkiDto extends PowodOperatoraDto {
  @IsEmail() @MaxLength(254) email!: string;
}

export class ResetHaslaFtpDto extends PowodOperatoraDto {
  @Linia(254) @MinLength(1) username!: string;
}

export class ResetHaslaBazyDto extends PowodOperatoraDto {
  @Linia(64) @MinLength(1) db!: string;
  @Linia(64) @MinLength(1) user!: string;
}

export class SslOperatoraDto extends PowodOperatoraDto {
  @IsString() @MinLength(3) @MaxLength(253) @Matches(/^[a-z0-9.-]+$/i, { message: 'Niepoprawna nazwa domeny.' }) domain!: string;
  @IsOptional() @IsBoolean() includeWww?: boolean;
}

export class PhpOperatoraDto extends PowodOperatoraDto {
  @IsString() @Matches(/^\d+\.\d+$/, { message: 'Nieprawidłowa wersja PHP.' }) version!: string;
}

const NAZWA = /^(@|[A-Za-z0-9_*]([A-Za-z0-9_*.-]{0,252})?\.?)$/;
const WARTOSC = /^[^\x00-\x1f\x7f]+$/;
const TYP = { message: 'Nieobsługiwany typ rekordu DNS.' };

class RekordDnsOperatora {
  @IsString() @Matches(NAZWA, { message: 'Niepoprawna nazwa rekordu.' }) name!: string;
  @IsIn(TYPY_REKORDOW_DNS, TYP) type!: (typeof TYPY_REKORDOW_DNS)[number];
  @IsString() @MinLength(1) @MaxLength(2048) @Matches(WARTOSC, { message: 'Wartość rekordu nie może zawierać znaków sterujących.' }) value!: string;
}

class NowyRekordDnsOperatora extends RekordDnsOperatora {
  @IsOptional() @IsInt() @Min(60) @Max(86400) ttl?: number;
}

/** Te same reguły co rekord klienta (hosting-dns.dto.ts) + powód. */
export class DodajRekordDnsOperatoraDto extends PowodOperatoraDto {
  @IsString() @MinLength(3) @MaxLength(253) domain!: string;
  @IsString() @Matches(NAZWA, { message: 'Niepoprawna nazwa rekordu.' }) name!: string;
  @IsIn(TYPY_REKORDOW_DNS, TYP) type!: (typeof TYPY_REKORDOW_DNS)[number];
  @IsString() @MinLength(1) @MaxLength(2048) @Matches(WARTOSC, { message: 'Wartość rekordu nie może zawierać znaków sterujących.' }) value!: string;
  @IsOptional() @IsInt() @Min(60) @Max(86400) ttl?: number;
}

export class ZmienRekordDnsOperatoraDto extends PowodOperatoraDto {
  @IsString() @MinLength(3) @MaxLength(253) domain!: string;
  @ValidateNested() @Type(() => RekordDnsOperatora) old!: RekordDnsOperatora;
  @ValidateNested() @Type(() => NowyRekordDnsOperatora) next!: NowyRekordDnsOperatora;
}

export class UsunRekordDnsOperatoraDto extends PowodOperatoraDto {
  @IsString() @MinLength(3) @MaxLength(253) domain!: string;
  @IsString() @Matches(NAZWA, { message: 'Niepoprawna nazwa rekordu.' }) name!: string;
  @IsIn(TYPY_REKORDOW_DNS_DO_USUNIECIA, TYP) type!: (typeof TYPY_REKORDOW_DNS_DO_USUNIECIA)[number];
  @IsString() @MinLength(1) @MaxLength(2048) @Matches(WARTOSC, { message: 'Wartość rekordu nie może zawierać znaków sterujących.' }) value!: string;
}
