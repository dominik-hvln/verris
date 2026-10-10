import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

/**
 * F2.7 — ciała tras karty domeny w panelu operatora (domeny.admin.controller.ts). Każde niesie powód (D2; długość
 * sprawdza serwis — ten sam komunikat dla wszystkich akcji) i opcjonalny numer zgłoszenia klienta.
 */
export class PowodDomenyDto {
  @IsString() @MaxLength(500) powod!: string;
  /** #ab12cd34 albo pełne id zgłoszenia klienta (tickets/zgloszenie-klienta.ts). */
  @IsOptional() @IsString() @Length(1, 64) zgloszenie?: string;
}

export class BlokadaDomenyDto extends PowodDomenyDto {
  @IsBoolean() locked!: boolean;
}

export class SerweryNazwOperatoraDto extends PowodDomenyDto {
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(253, { each: true }) nameservers!: string[];
}

export class OdnowienieOperatoraDto extends PowodDomenyDto {
  @IsOptional()
  @IsInt({ message: 'Okres odnowienia: od 1 do 10 lat.' })
  @Min(1, { message: 'Okres odnowienia: od 1 do 10 lat.' })
  @Max(10, { message: 'Okres odnowienia: od 1 do 10 lat.' })
  years?: number;
}

export class PonowienieZamowieniaDto extends PowodDomenyDto {
  /** Nowy kod EPP (transfer odrzucony przez zły kod); brak — zapisany przy zamówieniu klienta. */
  @IsOptional() @IsString() @MaxLength(256) authCode?: string;
}
