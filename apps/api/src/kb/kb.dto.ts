import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Czesciowy } from '../common/validation/czesciowy.js';

/** Autoring Bazy wiedzy (panel admina). Treść Markdown renderuje www — tu kształt i granice. */
const TYLKO_HTTPS = /^https:\/\/[^\s"'<>]+$/;

export class KategoriaKbDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(120) slug?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsString() @MaxLength(64) icon?: string | null;
  @IsOptional() @IsString() @MaxLength(64) parentId?: string | null;
  @IsOptional() @IsInt() @Min(0) order?: number;
}

export class ZmianaKategoriiKbDto extends Czesciowy(KategoriaKbDto) {}

export class PytanieFaqDto {
  @IsString() @MaxLength(300) q!: string;
  @IsString() @MaxLength(4000) a!: string;
}

class PolaArtykulu {
  @IsOptional() @IsString() @MaxLength(160) slug?: string;
  @IsOptional() @IsString() @MaxLength(500) excerpt?: string | null;
  @IsOptional() @IsIn(['DRAFT', 'PUBLISHED']) status?: 'DRAFT' | 'PUBLISHED';
  @IsOptional() @IsString() @MaxLength(160) seoTitle?: string | null;
  @IsOptional() @IsString() @MaxLength(320) seoDescription?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => PytanieFaqDto)
  faq?: PytanieFaqDto[] | null;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(160, { each: true })
  relatedSlugs?: string[];
  @IsOptional() @IsInt() @Min(0) order?: number;
}

export class ArtykulKbDto extends PolaArtykulu {
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsString() @MaxLength(64) categoryId!: string;
  @IsString() @MaxLength(200_000) bodyMarkdown!: string;
}

export class ZmianaArtykuluKbDto extends Czesciowy(ArtykulKbDto) {}

/** Baner CTA w artykułach — linki tylko https (bez `javascript:` i podobnych w href na www). */
export class BanerKbDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @MaxLength(120) headline?: string;
  @IsOptional() @IsString() @MaxLength(300) subtext?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsString({ each: true }) @MaxLength(120, { each: true }) bullets?: string[];
  @IsOptional() @IsString() @MaxLength(60) buttonLabel?: string;
  @IsOptional() @Matches(TYLKO_HTTPS, { message: 'Adres przycisku musi zaczynać się od https://' }) @MaxLength(500) buttonUrl?: string;
  @IsOptional() @Matches(TYLKO_HTTPS, { message: 'Adres statusu musi zaczynać się od https://' }) @MaxLength(500) statusUrl?: string;
  @IsOptional() @IsString() @MaxLength(60) statusLabel?: string;
  @IsOptional() @IsBoolean() pattern?: boolean;
}
