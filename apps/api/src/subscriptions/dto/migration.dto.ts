import { Type } from 'class-transformer';
import {
  IsEnum,
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

