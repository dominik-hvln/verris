import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AiKnowledgeAudience, AiKnowledgeStatus } from '@verris/database';
import { FUNKCJE_POMOCY, OBIEKTY_ASYSTENTA } from '../wiedza-staff.js';

export class AiChatTurnDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

/**
 * Kontekst pytania pracownika (patch 7): bez wolnego tekstu — trafia do promptu systemowego. Strona to sama
 * ścieżka panelu, funkcja to klucz słownika „?”, obiekt to typ z listy i ID; dane obiektu nie są pobierane.
 */
export class KontekstAsystentaDto {
  @IsString()
  @MaxLength(200)
  @Matches(/^\/[A-Za-z0-9/_.-]*$/)
  strona!: string;

  @IsOptional()
  @IsIn(FUNKCJE_POMOCY)
  funkcja?: string;

  @IsOptional()
  @IsIn(OBIEKTY_ASYSTENTA)
  obiektTyp?: (typeof OBIEKTY_ASYSTENTA)[number];

  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  obiektId?: string;
}

export class AiChatRequestDto {
  @IsString()
  @Length(1, 2000)
  question!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AiChatTurnDto)
  history?: AiChatTurnDto[];

  @IsOptional()
  @IsString()
  subscriptionId?: string;

  /** Tylko asystent pracowników (POST /ai/staff/chat); czat klienta go nie używa. */
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => KontekstAsystentaDto)
  kontekst?: KontekstAsystentaDto;
}

export class CreateKnowledgeDocDto {
  @IsString()
  @Length(2, 200)
  title!: string;

  @IsString()
  @Length(10, 200_000)
  content!: string;

  @IsOptional()
  @IsEnum(AiKnowledgeAudience)
  audience?: AiKnowledgeAudience;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceRef?: string;
}

export class UpdateKnowledgeDocDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(10, 200_000)
  content?: string;

  @IsOptional()
  @IsEnum(AiKnowledgeAudience)
  audience?: AiKnowledgeAudience;

  @IsOptional()
  @IsEnum(AiKnowledgeStatus)
  status?: AiKnowledgeStatus;
}

/** L-11 — poziom asystenta: dostawca + identyfikator modelu (dowolna nowsza wersja, bez zmian w kodzie). */
export class PoziomAiDto {
  @IsIn(['openai', 'anthropic'])
  dostawca!: 'openai' | 'anthropic';

  @Matches(/^[A-Za-z0-9._:-]{2,80}$/)
  model!: string;
}

export class UstawieniaAiDto {
  @ValidateNested()
  @Type(() => PoziomAiDto)
  szybki!: PoziomAiDto;

  @ValidateNested()
  @Type(() => PoziomAiDto)
  analiza!: PoziomAiDto;

  @IsNumber()
  @Min(0)
  @Max(1000)
  limitKlientaUsd!: number;

  @IsNumber()
  @Min(0)
  @Max(10_000)
  limitPlatformyUsd!: number;

  /** Model → { wej, wyj } USD / 1 mln tokenów; każdy wpis sprawdza jeszcze odczytajKonfiguracjeAi. */
  @IsObject()
  ceny!: Record<string, { wej: number; wyj: number }>;
}
