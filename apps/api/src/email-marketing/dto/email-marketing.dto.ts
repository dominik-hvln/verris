import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEmmListDto {
  @IsString() @MinLength(2) @MaxLength(120)
  name!: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsBoolean()
  doubleOptIn?: boolean;

  @IsOptional() @IsString() @MaxLength(120)
  fromName?: string;

  @IsOptional() @IsEmail()
  replyTo?: string;
}

export class UpdateEmmListDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsBoolean()
  doubleOptIn?: boolean;

  @IsOptional() @IsString() @MaxLength(120)
  fromName?: string;

  @IsOptional() @IsEmail()
  replyTo?: string;
}

export class AddEmmContactDto {
  @IsEmail()
  email!: string;

  @IsOptional() @IsString() @MaxLength(80)
  firstName?: string;

  @IsOptional() @IsString() @MaxLength(80)
  lastName?: string;
}

class ImportRow {
  @IsEmail()
  email!: string;

  @IsOptional() @IsString() @MaxLength(80)
  firstName?: string;

  @IsOptional() @IsString() @MaxLength(80)
  lastName?: string;
}

export class ImportEmmContactsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportRow)
  rows!: ImportRow[];

  /**
   * Klient deklaruje, że posiada zgodę marketingową tych kontaktów (RODO).
   * Bez tego importu nie wykonujemy — to dowód podstawy prawnej.
   */
  @IsBoolean()
  consentConfirmed!: boolean;
}

export class CreateEmmCampaignDto {
  @IsString() @MinLength(2) @MaxLength(120)
  name!: string;

  @IsString() @MinLength(2) @MaxLength(200)
  subject!: string;

  @IsString() @MinLength(2) @MaxLength(50_000)
  bodyMarkdown!: string;

  @IsString()
  listId!: string;

  @IsOptional() @IsString() @MaxLength(80)
  ctaLabel?: string;

  @IsOptional() @IsString() @MaxLength(500)
  ctaUrl?: string;
}

export class UpdateEmmCampaignDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(200)
  subject?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(50_000)
  bodyMarkdown?: string;

  @IsOptional() @IsString() @MaxLength(80)
  ctaLabel?: string;

  @IsOptional() @IsString() @MaxLength(500)
  ctaUrl?: string;
}
