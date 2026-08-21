import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Z-03 — wzorce pól migracji, które trafiają do polecenia powłoki na węźle.
 *
 * Zlecenie migracji wykonuje `ops/scripts/node-migration-worker.sh`, jako root,
 * na węźle hostującym konta innych klientów. Do 2026-08-21 te pola miały
 * wyłącznie walidację długości, a w skrypcie lądowały w `eval` (nazwa bazy)
 * i w łańcuchu poleceń `lftp -e` (ścieżka zdalna). Apostrof w ścieżce albo
 * średnik w nazwie bazy dawały wykonanie dowolnego polecenia jako root.
 *
 * To jest PIERWSZA warstwa. Druga to `ops/scripts/lib/migration-input-guard.sh`
 * — te same wzorce po stronie węzła, żeby inna droga do kolejki (skrypt
 * operatorski, ręczny INSERT, przyszły endpoint) nie ominęła kontroli.
 * **Zmiana wzorca tutaj wymaga zmiany tam** — pilnuje tego test
 * `migration-input-validation.spec.ts`, który karmi obie warstwy tym samym
 * zestawem danych i porównuje werdykty.
 *
 * Zasada: allowlista znaków, nie blacklista. Hasła są celowo bez ograniczeń —
 * idą do zmiennych środowiskowych i argumentów, nigdy do łańcucha poleceń.
 */
export const MIGRACJA_WZORCE = {
  host: /^[A-Za-z0-9]([A-Za-z0-9._:-]{0,251}[A-Za-z0-9])?$/,
  username: /^[A-Za-z0-9][A-Za-z0-9._@+-]{0,127}$/,
  /**
   * Login skrzynki IMAP bywa pełnym adresem e-mail i pole dopuszcza 254 znaki
   * (limit adresu e-mail wg RFC 5321). Bez osobnego wzorca `@MaxLength(254)`
   * i `@Matches` mówiłyby dwie różne rzeczy, a użytkownik z długim adresem
   * dostawałby komunikat o niedozwolonych znakach, choć znaki są w porządku.
   */
  usernameImap: /^[A-Za-z0-9][A-Za-z0-9._@+-]{0,253}$/,
  database: /^[A-Za-z0-9][A-Za-z0-9_$-]{0,63}$/,
  path: /^[A-Za-z0-9 ._/-]{1,1024}$/,
  email: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/,
} as const;

const KOMUNIKAT = {
  host: 'Nazwa hosta może zawierać wyłącznie litery, cyfry, kropkę, myślnik i dwukropek.',
  username: 'Login może zawierać wyłącznie litery, cyfry oraz . _ @ + -',
  database: 'Nazwa bazy może zawierać wyłącznie litery, cyfry oraz _ $ -',
  path: 'Ścieżka może zawierać wyłącznie litery, cyfry, spację oraz . _ / - i nie może wychodzić w górę drzewa (..).',
  email: 'Podaj poprawny adres e-mail.',
} as const;

export enum ExternalMigrationSourceType {
  FTP = 'FTP',
  MYSQL = 'MYSQL',
  IMAP = 'IMAP',
}

export class RequestExternalMigrationDto {
  @IsEnum(ExternalMigrationSourceType)
  sourceType!: ExternalMigrationSourceType;

  @IsString()
  @MinLength(3)
  @MaxLength(253)
  @Matches(MIGRACJA_WZORCE.host, { message: KOMUNIKAT.host })
  sourceHost!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  sourcePort!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(MIGRACJA_WZORCE.username, { message: KOMUNIKAT.username })
  sourceUsername!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  sourcePassword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  @Matches(MIGRACJA_WZORCE.path, { message: KOMUNIKAT.path })
  @Matches(/^(?!.*\.\.).*$/, { message: KOMUNIKAT.path })
  sourcePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class RequestInternalMigrationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  targetServerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

// Sprint 7 / R-MIG-1 — pakietowe zlecenie migracji.
// Każdy z trzech bloków (FTP, MySQL, IMAP) jest opcjonalny; wymagamy co najmniej
// jednego (walidacja ręczna w serwisie). Po stronie API enkrypujemy bundle
// w jednym tokenie, żeby nie zostawić surowego hasła w żadnej tabeli.

import { IsArray, ArrayMaxSize, ValidateNested } from 'class-validator';

export class MigrationFtpSourceDto {
  @IsString() @MinLength(3) @MaxLength(253)
  @Matches(MIGRACJA_WZORCE.host, { message: KOMUNIKAT.host })
  host!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  port!: number;

  @IsString() @MinLength(1) @MaxLength(128)
  @Matches(MIGRACJA_WZORCE.username, { message: KOMUNIKAT.username })
  username!: string;

  /** Hasło celowo bez ograniczeń znaków — patrz komentarz przy MIGRACJA_WZORCE. */
  @IsString() @MinLength(1) @MaxLength(2048)
  password!: string;

  @IsOptional() @IsString() @MaxLength(1024)
  @Matches(MIGRACJA_WZORCE.path, { message: KOMUNIKAT.path })
  @Matches(/^(?!.*\.\.).*$/, { message: KOMUNIKAT.path })
  remotePath?: string;

  @IsOptional() @IsString() @MaxLength(16)
  protocol?: 'ftp' | 'ftps' | 'sftp';
}

export class MigrationMysqlSourceDto {
  @IsString() @MinLength(3) @MaxLength(253)
  @Matches(MIGRACJA_WZORCE.host, { message: KOMUNIKAT.host })
  host!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  port!: number;

  @IsString() @MinLength(1) @MaxLength(128)
  @Matches(MIGRACJA_WZORCE.username, { message: KOMUNIKAT.username })
  username!: string;

  @IsString() @MinLength(1) @MaxLength(2048)
  password!: string;

  @IsString() @MinLength(1) @MaxLength(64)
  @Matches(MIGRACJA_WZORCE.database, { message: KOMUNIKAT.database })
  database!: string;
}

export class MigrationImapSourceDto {
  @IsString() @MinLength(3) @MaxLength(253)
  @Matches(MIGRACJA_WZORCE.host, { message: KOMUNIKAT.host })
  host!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  port!: number;

  @IsString() @MinLength(1) @MaxLength(254)
  @Matches(MIGRACJA_WZORCE.usernameImap, { message: KOMUNIKAT.username })
  username!: string;

  @IsString() @MinLength(1) @MaxLength(2048)
  password!: string;

  /** Docelowy adres skrzynki u nas. Gdy brak — przyjmujemy `username`. */
  @IsOptional() @IsString() @MinLength(3) @MaxLength(254)
  @Matches(MIGRACJA_WZORCE.email, { message: KOMUNIKAT.email })
  email?: string;
}

export class CreateMigrationBundleDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(253)
  targetDomain?: string;

  /**
   * Domena, pod którą strona działała u starego dostawcy. Gdy różna od
   * `targetDomain`, WP_FIXUP wykona `wp search-replace` starej domeny na nową.
   */
  @IsOptional() @IsString() @MinLength(3) @MaxLength(253)
  sourceDomain?: string;

  /** Skąd przyszły dane: cpanel | directadmin | plesk | manual (statystyka + kontekst dla staffa). */
  @IsOptional() @IsString() @MaxLength(32)
  sourcePanelType?: string;

  @IsOptional() @ValidateNested() @Type(() => MigrationFtpSourceDto)
  ftp?: MigrationFtpSourceDto;

  @IsOptional() @IsArray() @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MigrationMysqlSourceDto)
  mysql?: MigrationMysqlSourceDto[];

  @IsOptional() @IsArray() @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MigrationImapSourceDto)
  imap?: MigrationImapSourceDto[];

  @IsOptional() @IsString() @MaxLength(5000)
  notes?: string;

  /**
   * Zgoda/upoważnienie klienta (RODO): potwierdza prawo do przeniesienia danych
   * i upoważnia nas do dostępu do hostingu źródłowego (powierzenie przetwarzania,
   * DPA). Wymagane przy starcie migracji (egzekwowane w `createBundle`),
   * pomijane przy preflightcie. Zapisujemy w audycie jako podstawę operacji.
   */
  @IsOptional()
  @Type(() => Boolean)
  consentAccepted?: boolean;
}

/** O-2/#18 — auto-discovery: dane logowania do panelu starego hostingu. */
export class DiscoverMigrationSourceDto {
  @IsString() @MinLength(3) @MaxLength(253)
  @Matches(MIGRACJA_WZORCE.host, { message: KOMUNIKAT.host })
  host!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  port?: number;

  @IsString() @MinLength(1) @MaxLength(128)
  @Matches(MIGRACJA_WZORCE.username, { message: KOMUNIKAT.username })
  username!: string;

  @IsString() @MinLength(1) @MaxLength(2048)
  password!: string;

  @IsOptional() @IsIn(['cpanel', 'directadmin', 'plesk'])
  panelType?: 'cpanel' | 'directadmin' | 'plesk';
}

