import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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
  sourceHost!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  sourcePort!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  sourceUsername!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  sourcePassword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
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
  host!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  port!: number;

  @IsString() @MinLength(1) @MaxLength(128)
  username!: string;

  @IsString() @MinLength(1) @MaxLength(2048)
  password!: string;

  @IsOptional() @IsString() @MaxLength(1024)
  remotePath?: string;

  @IsOptional() @IsString() @MaxLength(16)
  protocol?: 'ftp' | 'ftps' | 'sftp';
}

export class MigrationMysqlSourceDto {
  @IsString() @MinLength(3) @MaxLength(253)
  host!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  port!: number;

  @IsString() @MinLength(1) @MaxLength(128)
  username!: string;

  @IsString() @MinLength(1) @MaxLength(2048)
  password!: string;

  @IsString() @MinLength(1) @MaxLength(64)
  database!: string;
}

export class MigrationImapSourceDto {
  @IsString() @MinLength(3) @MaxLength(253)
  host!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  port!: number;

  @IsString() @MinLength(1) @MaxLength(254)
  username!: string;

  @IsString() @MinLength(1) @MaxLength(2048)
  password!: string;

  /** Docelowy adres skrzynki u nas. Gdy brak — przyjmujemy `username`. */
  @IsOptional() @IsString() @MinLength(3) @MaxLength(254)
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
  host!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(65535)
  port?: number;

  @IsString() @MinLength(1) @MaxLength(128)
  username!: string;

  @IsString() @MinLength(1) @MaxLength(2048)
  password!: string;

  @IsOptional() @IsIn(['cpanel', 'directadmin', 'plesk'])
  panelType?: 'cpanel' | 'directadmin' | 'plesk';
}

