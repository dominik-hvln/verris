import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsNumber,
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
import { JEZYKI_DODATKOWE, MAX_PODSTRON_TLUMACZENIA, TYPY_STRON, type JezykDodatkowy, type TypStrony } from '@verris/kreator';
import { DOSTAWCY_OBRAZOW_AI, MAKS_CENY_OBRAZU_USD, MODEL_KREATORA_RE, type DostawcaObrazowAi } from '../konfiguracja.js';
import { DOSTAWCY_ZDJEC, type NazwaDostawcy } from '../biblioteka/dostawca.js';

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

  /** Paczka 124 – adres podstrony zmienianej sekcji (wersje językowe mają sekcje o tych samych id co oryginał). */
  @IsOptional()
  @IsString()
  @Matches(/^([a-z0-9-]{1,60}(\/[a-z0-9-]{1,60}){0,2})?$/, { message: 'Nieprawidłowy adres podstrony.' })
  podstrona?: string;
}

/** POST /kreator/strony/:id/tlumacz (paczka 124, Kreator Pro) – tłumaczenie podstron na język dodatkowy. */
export class TlumaczenieDto {
  @IsIn(JEZYKI_DODATKOWE, { message: 'Wybierz język: angielski, niemiecki albo ukraiński.' })
  jezyk!: JezykDodatkowy;

  /** Klucze podstron języka głównego (adres bez prefiksu języka; '' = strona główna); brak = wszystkie. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PODSTRON_TLUMACZENIA, { message: `Przetłumacz najwyżej ${MAX_PODSTRON_TLUMACZENIA} podstron naraz.` })
  @IsString({ each: true })
  @Matches(/^([a-z0-9-]{1,60}(\/[a-z0-9-]{1,60})?)?$/, { each: true, message: 'Nieprawidłowy adres podstrony.' })
  podstrony?: string[];
}

export class PodgladQueryDto {
  @IsOptional()
  @IsString()
  // Paczka 124: wersje językowe – do trzech członów (`en/blog/wpis`).
  @Matches(/^([a-z0-9-]{1,60}(\/[a-z0-9-]{1,60}){0,2})?$/, { message: 'Nieprawidłowy adres podstrony.' })
  podstrona?: string;

  @IsOptional()
  @IsIn(['0', '1'])
  pro?: '0' | '1';
}

/** Admin: konfiguracja kreatora (zapis przez odczytajKonfiguracjeKreatora – ta sama walidacja co przy odczycie). */
/** Paczka 124 – ustawienia generowania zdjęć AI (model sprawdza wzorzec dostawcy w odczytajObrazyAi). */
export class ObrazyAiDto {
  @IsOptional()
  @IsBoolean()
  wlaczone?: boolean;

  @IsOptional()
  @IsIn([...DOSTAWCY_OBRAZOW_AI], { message: 'Nieznany dostawca zdjęć AI.' })
  dostawca?: DostawcaObrazowAi;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9.-]{2,60}$/, { message: 'Nieprawidłowa nazwa modelu.' })
  model?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Cena za obraz: liczba (USD), najwyżej 4 miejsca po przecinku.' })
  @Min(0)
  @Max(MAKS_CENY_OBRAZU_USD, { message: `Cena za obraz: najwyżej ${MAKS_CENY_OBRAZU_USD} USD.` })
  cenaZaObrazUsd?: number;
}

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

  /** Paczka 122 – biblioteki zdjęć w edytorze (kolejność = kolejność przełącznika). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(DOSTAWCY_ZDJEC.length)
  @IsIn(DOSTAWCY_ZDJEC as unknown as string[], { each: true, message: 'Nieznana biblioteka zdjęć.' })
  bibliotekiZdjec?: NazwaDostawcy[];

  /** Paczka 124 – zdjęcia AI; pola pominięte zostają bez zmian (scalanie w kontrolerze admina). */
  @IsOptional()
  @ValidateNested()
  @Type(() => ObrazyAiDto)
  obrazyAi?: ObrazyAiDto;
}

/** POST /kreator/pro/okres – okres abonamentu Kreator Pro od następnego odnowienia (paczka 123). */
export class OkresProDto {
  @IsIn(['MONTH', 'YEAR'], { message: 'Okres: miesięczny albo roczny.' })
  okres!: 'MONTH' | 'YEAR';
}
