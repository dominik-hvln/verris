import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * Ciała żądań narzędzi hostingu (`services.controller`). Do 2026-09-24 typowane inline (`@Body() body: {…}`),
 * a przy typie inline ValidationPipe niczego nie sprawdza: tablica zamiast napisu albo znak nowej linii
 * szły prosto do DirectAdmina. Tu tylko kształt i bezpieczne znaki — reguły biznesowe zostają w serwisach.
 */
const JEDNA_LINIA = /^[^\x00-\x1f\x7f]*$/;
const KOMUNIKAT_LINII = 'Pole nie może zawierać znaków nowej linii ani innych znaków sterujących.';

export function Linia(max: number): PropertyDecorator {
  return (target, key) => {
    IsString()(target, key);
    MaxLength(max)(target, key);
    Matches(JEDNA_LINIA, { message: KOMUNIKAT_LINII })(target, key);
  };
}

function Haslo(min = 8): PropertyDecorator {
  return (target, key) => {
    Linia(128)(target, key);
    MinLength(min, { message: `Hasło musi mieć co najmniej ${min} znaków.` })(target, key);
  };
}

export class InstalacjaAplikacjiDto {
  @Linia(64) app!: string;
  @Linia(64) adminUser!: string;
  @Linia(254) adminEmail!: string;
  @IsOptional() @Linia(128) adminPassword?: string;
}

export class WersjaPhpDto {
  @Linia(16) version!: string;
}

export class WersjaPhpDomenyDto extends WersjaPhpDto {
  @Linia(253) domain!: string;
}

/** D-12 — eksport bazy (pełna nazwa login_nazwa; przynależność sprawdza serwis). */
export class EksportBazyDto {
  @Linia(64) db!: string;
}

export class ImportBazyDto extends EksportBazyDto {
  @Linia(128) file!: string;
}

/** H-10/H-11 — archiwum w ~/backups i ścieżka wewnątrz (format sprawdza FileRestoreService). */
export class ListaArchiwumDto {
  @Linia(210) archive!: string;
  @IsOptional() @Linia(1024) path?: string;
}

export class OdtworzenieZArchiwumDto {
  @Linia(210) archive!: string;
  @Linia(1024) path!: string;
}

/** C-21 — włączenie/wyłączenie SSH w klatce. */
export class DostepSshDto {
  @IsBoolean() enabled!: boolean;
}

/** C-22 — klucze publiczne (format sprawdza SshAccessService). */
export class KluczeSshDto {
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(4096, { each: true })
  keys!: string[];
}

/** I-05 — sprawdzenie WordPressa domeny. */
export class WordpressDomenyDto {
  @Linia(253) domain!: string;
}

/**
 * I-05 — aktualizacja z panelu. `plugins`/`themes`: „*” = wszystkie z dostępną aktualizacją
 * albo lista slugów (format sprawdza WpUpdateService).
 */
export class AktualizacjaWordpressaDto {
  @Linia(253) domain!: string;
  @IsIn(['none', 'minor', 'all']) core!: string;
  @IsDefined() plugins!: '*' | string[];
  @IsDefined() themes!: '*' | string[];
}

/** J-02 — wtyczka LiteSpeed Cache w WordPressie domeny. */
export class CacheWordpressaDto {
  @Linia(253) domain!: string;
  @IsIn(['on', 'off', 'purge', 'redis-on', 'redis-off']) action!: string;
}

/** C-25/C-26 — repozytorium Git strony (format adresu, gałęzi i katalogu sprawdza GitDeployService). */
export class RepozytoriumGitDto {
  @Linia(253) domain!: string;
  @IsOptional() @Linia(200) dir?: string;
  @IsOptional() @Linia(500) url?: string;
  @IsOptional() @Linia(100) branch?: string;
}

/** I-13 — kopia strony na inną domenę konta. */
export class KlonStronyDto {
  @Linia(253) source!: string;
  @Linia(253) target!: string;
}

/** E-19 — dziennik dostarczania poczty, opcjonalnie zawężony do adresu. */
export class DziennikPocztyDto {
  @IsOptional() @IsEmail() @MaxLength(254) address?: string;
}

/** I-08 — poprawki zabezpieczeń WordPressa (wp-config.php); I-15 — tryb konserwacji. */
export class ZabezpieczeniaWordpressaDto {
  @Linia(253) domain!: string;
  @IsIn(['file-edit', 'debug-off', 'maintenance-on', 'maintenance-off']) action!: string;
}

/** I-04 — automatyczne aktualizacje WordPressa domeny. */
export class AutomatWordpressaDto {
  @Linia(253) domain!: string;
  @IsIn(['none', 'minor', 'all']) core!: string;
  @IsBoolean() plugins!: boolean;
  @IsBoolean() themes!: boolean;
}

/** B-05 — dyrektywy PHP w `.user.ini` domeny. Listę dozwolonych i zakresy sprawdza `php-ini.ts`. */
export class UstawieniaPhpDomenyDto {
  @Linia(253) domain!: string;
  @IsObject() values!: Record<string, string>;
}

export class NowaBazaDanychDto {
  @Linia(64) name!: string;
  @Linia(64) user!: string;
  @Haslo() password!: string;
}

export class PrzekierowaniePocztyDto {
  @Linia(64) name!: string;
  /** Lista adresów po przecinku — jedna linia. */
  @Linia(2000) destinations!: string;
}

export class AutoresponderDto {
  @Linia(64) name!: string;
  /** Treść wiadomości może mieć wiele linii. */
  @IsString() @MaxLength(10_000) text!: string;
  @IsOptional() @Linia(254) cc?: string;
}

export class KatalogDto {
  @Linia(1024) dir!: string;
}

export class OchronaKataloguDto extends KatalogDto {
  @IsOptional() @Linia(128) realm?: string;
  @Linia(64) user!: string;
  /** Panel wymaga tu min. 6 znaków (hasło do .htpasswd, nie do bazy). */
  @Haslo(6) password!: string;
}

export class DomenaDto {
  @Linia(253) domain!: string;
}

export class AliasDomenyDto {
  @Linia(253) alias!: string;
}

export class CatchAllDto {
  @IsIn(['fail', 'blackhole', 'address']) mode!: 'fail' | 'blackhole' | 'address';
  /** Panel wysyła ostatnio wpisany adres także przy innych trybach — sprawdzamy go tylko, gdy jest używany. */
  @ValidateIf((o: CatchAllDto) => o.mode === 'address')
  @IsEmail()
  @MaxLength(254)
  address?: string;
}

export class FiltrSpamuDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @Linia(8) requiredScore?: string;
  @IsOptional() @Linia(64) subjectTag?: string;
}

export class DostepZdalnyBazyDto {
  @Linia(64) db!: string;
  @Linia(253) host!: string;
}

export class UzytkownikBazyDto {
  @Linia(64) db!: string;
  @Linia(64) user!: string;
}

export class UzytkownikBazyZHaslemDto extends UzytkownikBazyDto {
  @Haslo() password!: string;
}

export class LogowanieSsoDto {
  @IsIn(['phpmyadmin', 'webmail', 'panel']) target!: 'phpmyadmin' | 'webmail' | 'panel';
}

export class SubdomenaDto extends DomenaDto {
  @Linia(63) subdomain!: string;
}

export class NowyStagingDto extends DomenaDto {
  @IsOptional() @Linia(32) label?: string;
  @IsOptional() @IsBoolean() withDatabase?: boolean;
}

export class MigawkaOffsiteDto {
  @IsOptional() @Linia(128) snapshot?: string;
}

export class ArchiwumOffsiteDto extends MigawkaOffsiteDto {
  @Linia(1024) archive!: string;
}

export class HarmonogramKopiiDto {
  @IsIn(['OFF', 'DAILY', 'WEEKLY']) frequency!: 'OFF' | 'DAILY' | 'WEEKLY';
  @IsInt() @Min(0) @Max(23) hour!: number;
  @IsInt() @Min(0) @Max(6) dayOfWeek!: number;
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(60) retainCount?: number;
}

/** Narzędzia WWW (.htaccess). Format ścieżek, celów, IP i domen sprawdza DirectAdminService. */
export class PrzekierowanieDto {
  @Linia(1024) from!: string;
  @Linia(2048) to!: string;
  @IsIn(['301', '302']) type!: '301' | '302';
}

export class OchronaHotlinkDto {
  @IsBoolean() enabled!: boolean;
  @Linia(500) extensions!: string;
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(253, { each: true }) @Matches(JEDNA_LINIA, { each: true, message: KOMUNIKAT_LINII })
  allow!: string[];
}

export class NarzedziaWwwDto {
  @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => PrzekierowanieDto)
  redirects?: PrzekierowanieDto[];
  @IsOptional() @ValidateNested() @Type(() => OchronaHotlinkDto)
  hotlink?: OchronaHotlinkDto;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) @MaxLength(64, { each: true }) @Matches(JEDNA_LINIA, { each: true, message: KOMUNIKAT_LINII })
  blockedIps?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(1024, { each: true }) @Matches(JEDNA_LINIA, { each: true, message: KOMUNIKAT_LINII })
  protectedDirs?: string[];
  @IsOptional() @IsBoolean() forceHttps?: boolean;
  @IsOptional() @IsIn(['none', 'www', 'nonwww']) wwwMode?: 'none' | 'www' | 'nonwww';
}

/** Auto-deploy z Git (cron). Gałąź i komendę build dodatkowo czyści serwis. */
export class ZadanieDeployDto extends DomenaDto {
  @IsOptional() @Linia(255) branch?: string;
  @IsOptional() @Linia(500) buildCommand?: string;
  @IsIn(['every_15m', 'hourly', 'daily']) frequency!: 'every_15m' | 'hourly' | 'daily';
}
