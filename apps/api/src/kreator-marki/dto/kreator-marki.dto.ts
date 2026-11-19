import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CECHY_MARKI, RODZAJE_DROBNYCH, RODZAJE_ZNAKU, UKLADY_LOGO, WARIANTY_KOLORU } from '@verris/kreator';

/**
 * Kreator marki (paczka 131) – DTO tras klienta (kontrakt libs/kreator/src/marka/api-kontrakt.ts). Globalny ValidationPipe
 * pilnuje kształtu i długości (whitelist + forbidNonWhitelisted); semantykę (schematy zod modelu marki: BriefMarki,
 * ProjektLogo, UstawieniaKv, DaneKontaktoweMarki, katalog krojów, reguły jakości) sprawdza serwis – jedno źródło prawdy
 * z biblioteką marki. Obiekty zagnieżdżone (brief, projekt) – tylko „jest obiektem”, resztę waliduje zod.
 */

export class BriefMarkiDto {
  @IsString() @MaxLength(60) nazwa!: string;
  @IsOptional() @IsString() @MaxLength(60) podpis?: string;
  @IsString() @MaxLength(80) branza!: string;
  @IsString() @MaxLength(240) opis!: string;
  @IsOptional() @IsIn([...RODZAJE_ZNAKU]) rodzaj?: string;
  @IsOptional() @IsArray() @IsIn([...CECHY_MARKI], { each: true }) cechy?: string[];
  @IsOptional() @IsArray() @IsInt({ each: true }) barwyLubiane?: number[];
  @IsOptional() @IsArray() @IsInt({ each: true }) barwyOdrzucone?: number[];
  @IsOptional() @IsString() @MaxLength(300) uwagi?: string;
}

export class NowaMarkaDto {
  @IsIn(['nowa'], { message: 'Nową markę z briefu zakładasz ze źródłem „nowa”.' }) zrodlo!: 'nowa';
  @IsObject() brief!: Record<string, unknown>;
}

export class WybierzKierunekDto {
  @IsString() @MaxLength(40) seriaId!: string;
  @IsString() @MaxLength(40) kierunekId!: string;
  @IsOptional() @IsObject() projekt?: Record<string, unknown>;
}

export class ProjektMarkiDto {
  @IsObject() projekt!: Record<string, unknown>;
}

export class UstawieniaKvDto {
  @IsOptional() @IsIn(['bez', 'rzadki', 'gesty']) wzor?: string;
  @IsOptional() @IsString() @MaxLength(80) haslo?: string;
  @IsOptional() @IsString() @MaxLength(40) zdjecieZasobId?: string;
  @IsOptional() @IsBoolean() tloCiemne?: boolean;
}

export class KontaktMarkiDto {
  @IsOptional() @IsString() @MaxLength(80) imie?: string;
  @IsOptional() @IsString() @MaxLength(80) stanowisko?: string;
  @IsOptional() @IsString() @MaxLength(20) telefon?: string;
  @IsOptional() @IsString() @MaxLength(120) email?: string;
  @IsOptional() @IsString() @MaxLength(120) www?: string;
  @IsOptional() @IsString() @MaxLength(160) adres?: string;
}

export class DrobnaZmianaDto {
  @IsIn([...RODZAJE_DROBNYCH]) rodzaj!: string;
  @IsOptional() @IsString() @MaxLength(300) polecenie?: string;
}

export class KvAiDto {
  @IsOptional() @IsString() @MaxLength(500) polecenie?: string;
}

export class ZgodyMarkiDto {
  @IsOptional() @IsBoolean() sprawdzilemTmview?: boolean;
  @IsOptional() @IsBoolean() oswiadczeniePraw?: boolean;
}

/** Pola multipart obok pliku (wartości tekstowe). */
export class WgrajLogoDto {
  @IsOptional() @IsIn(['wgrane', 'odswiezenie']) zrodlo?: string;
  @IsOptional() @IsString() @MaxLength(10) oswiadczenie?: string;
  @IsOptional() @IsString() @MaxLength(60) nazwa?: string;
  @IsOptional() @IsString() @MaxLength(80) branza?: string;
}

export class NapisQueryDto {
  @IsString() @MaxLength(60) font!: string;
  @IsString() @MaxLength(400) tekst!: string;
  @IsOptional() @IsInt() @Min(100) @Max(900) waga?: number;
  @IsOptional() @IsInt() @Min(-50) @Max(600) rozstrzelenie?: number;
}

export class LogoQueryDto {
  @IsOptional() @IsIn([...UKLADY_LOGO]) uklad?: string;
  @IsOptional() @IsIn([...WARIANTY_KOLORU]) wariant?: string;
}

export class ZakupMarkiDto {
  @IsIn(['portfel', 'karta', 'paynow'], { message: 'Wybierz sposób płatności: portfel, karta albo BLIK/przelew.' }) metoda!: string;
  @IsOptional() @IsBoolean() zgodaTresciCyfrowej?: boolean;
}
