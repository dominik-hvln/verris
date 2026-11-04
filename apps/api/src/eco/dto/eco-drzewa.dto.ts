import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MAKS_KOSZT_DRZEWA_GROSZE, ZAKRESY_DRZEW } from '../drzewa-model.js';

export class WymianaNaDrzewoDto {
  @IsIn(['PULA', 'WLASNE'])
  cel!: 'PULA' | 'WLASNE';

  /** PULA: procent drzewa (1–100). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  procent?: number;

  /** WLASNE: liczba całych drzew. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  drzewa?: number;
}

/** Ustawienia drzew w adminie. Koszt drzewa twardo ≤ 20 zł (decyzja 12). Token API nie jest tu przyjmowany. */
export class UstawieniaDrzewDto {
  @IsOptional() @IsBoolean() wlaczone?: boolean;

  @IsOptional() @IsIn(['produkcja', 'test']) srodowisko?: 'produkcja' | 'test';

  @IsOptional() @IsInt() @Min(1) @Max(MAKS_KOSZT_DRZEWA_GROSZE) kosztDrzewaGrosze?: number;

  @IsOptional() @IsInt() @Min(ZAKRESY_DRZEW.wkladNa100ZlNetto[0]) @Max(ZAKRESY_DRZEW.wkladNa100ZlNetto[1])
  wkladNa100ZlNetto?: number;

  @IsOptional() @IsString() @MaxLength(64) @Matches(/^[A-Za-z0-9_-]*$/, { message: 'ID sadzenia: litery, cyfry, - i _.' })
  idSadzenia?: string;

  @IsOptional() @IsInt() @Min(ZAKRESY_DRZEW.kredytyNaDrzewo[0]) @Max(ZAKRESY_DRZEW.kredytyNaDrzewo[1])
  kredytyNaDrzewo?: number;

  @IsOptional() @IsInt() @Min(ZAKRESY_DRZEW.maksDrzewNaZamowienie[0]) @Max(ZAKRESY_DRZEW.maksDrzewNaZamowienie[1])
  maksDrzewNaZamowienie?: number;

  @IsOptional() @IsInt() @Min(ZAKRESY_DRZEW.punktyNaDrzewo[0]) @Max(ZAKRESY_DRZEW.punktyNaDrzewo[1])
  punktyNaDrzewo?: number;
}

export class PotwierdzSadzenieDto {
  @IsInt() @Min(1) orderId!: number;

  @IsString() @MaxLength(2000) @Matches(/^https:\/\//, { message: 'Adres certyfikatu musi zaczynać się od https://.' })
  certificateUrl!: string;

  @IsOptional() @IsString() @MaxLength(2000) @Matches(/^https:\/\//) certificateImageUrl?: string;
}
