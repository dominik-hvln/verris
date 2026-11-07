import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TYPY_STRON, type TypStrony } from '@verris/kreator';
import { MODEL_KREATORA_RE } from '../konfiguracja.js';

/** Brief „opisz firmę” (BriefStrony z @verris/kreator). `firma` sprawdza dodatkowo schemat zod w serwisie. */
export class BriefStronyDto {
  @IsString()
  @Length(20, 3000, { message: 'Opis firmy i strony: od 20 do 3000 znaków.' })
  opis!: string;

  @IsIn(TYPY_STRON as unknown as string[], { message: 'Nieznany typ strony.' })
  typ!: TypStrony;

  @IsOptional()
  @IsObject()
  firma?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Ceny: najwyżej 2000 znaków.' })
  ceny?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  ton?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{1,40}$/, { message: 'Nieznany styl.' })
  styl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Inspiracje: najwyżej 1000 znaków.' })
  inspiracje?: string;
}

export class UtworzStroneDto {
  @IsString()
  @Length(1, 80, { message: 'Nazwa strony: od 1 do 80 znaków.' })
  nazwa!: string;

  @ValidateNested()
  @Type(() => BriefStronyDto)
  brief!: BriefStronyDto;
}

/** PATCH /kreator/strony/:id – zmiana nazwy (serwis dodatkowo przycina białe znaki i sprawdza długość po tym). */
export class ZmienNazweDto {
  @IsString()
  @Length(1, 80, { message: 'Nazwa strony: od 1 do 80 znaków.' })
  nazwa!: string;
}

/** Zapis ręczny z edytora – model sprawdza walidujStrone (@verris/kreator) w serwisie. */
export class ZapiszModelDto {
  @IsObject()
  model!: Record<string, unknown>;
}

export class ZmianaAiDto {
  @IsString()
  @Length(3, 1000, { message: 'Polecenie: od 3 do 1000 znaków.' })
  polecenie!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{0,39}$/, { message: 'Nieprawidłowy identyfikator sekcji.' })
  sekcjaId?: string;
}

export class PodgladQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^([a-z0-9-]{1,60}(\/[a-z0-9-]{1,60})?)?$/, { message: 'Nieprawidłowy adres podstrony.' })
  podstrona?: string;

  @IsOptional()
  @IsIn(['0', '1'])
  pro?: '0' | '1';
}

/** Admin: konfiguracja kreatora (zapis przez odczytajKonfiguracjeKreatora – ta sama walidacja co przy odczycie). */
export class KonfiguracjaKreatoraDto {
  @IsOptional()
  @Matches(MODEL_KREATORA_RE, { message: 'Kreator obsługuje tylko modele Anthropic (claude-…).' })
  modelGeneracji?: string;

  @IsOptional()
  @Matches(MODEL_KREATORA_RE, { message: 'Kreator obsługuje tylko modele Anthropic (claude-…).' })
  modelZmian?: string;

  @IsOptional()
  @IsBoolean()
  wlaczony?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  kontaTestowe?: string[];
}
