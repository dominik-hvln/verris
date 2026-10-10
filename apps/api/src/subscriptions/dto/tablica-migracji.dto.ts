import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ETAPY, OKNO_POPRAWEK_MAX_DNI, POLA_CHECKLISTY } from '../tablica-migracji.js';

/** D11 — przejście etapu: powód obowiązkowy przy cofnięciu (sprawdza tablica-migracji.ts), okno poprawek w dniach. */
export class EtapMigracjiDto {
  @IsIn(ETAPY, { message: 'Nieznany etap.' })
  etap!: string;

  @IsOptional() @IsString() @MaxLength(500)
  powod?: string | null;

  @IsOptional() @IsInt() @Min(1) @Max(OKNO_POPRAWEK_MAX_DNI)
  oknoDni?: number | null;
}

/** D11 — terminy, Przerywacz, przypisanie i zgłoszenie; pole pominięte zostaje bez zmian, null czyści. */
export class UstawieniaMigracjiDto {
  @IsOptional() @IsISO8601({ strict: true }, { message: 'Termin: data w formacie ISO.' })
  termin?: string | null;

  @IsOptional() @IsISO8601({ strict: true }, { message: 'Wygaśnięcie u starego dostawcy: data w formacie ISO.' })
  wygasaUStaregoAt?: string | null;

  @IsOptional() @IsISO8601({ strict: true }, { message: 'Wygaśnięcie domeny: data w formacie ISO.' })
  domenaWygasaAt?: string | null;

  @IsOptional() @IsBoolean()
  przerywacz?: boolean;

  @IsOptional() @IsString() @MaxLength(64)
  przypisanyDoId?: string | null;

  /** #ab12cd34 albo pełne id zgłoszenia klienta. */
  @IsOptional() @IsString() @MaxLength(64)
  zgloszenie?: string | null;
}

export class ChecklistaMigracjiDto {
  @IsIn(POLA_CHECKLISTY, { message: 'Nieznana pozycja checklisty.' })
  pole!: string;

  /** TTL 300 — true/false; pozostałe — tekst (null czyści). Typ sprawdza serwis. */
  @ValidateIf((_, v) => typeof v === 'string')
  @MaxLength(2000)
  wartosc!: string | boolean | null;
}

export class KontaktMigracjiDto {
  @IsIn(['TELEFON', 'MAIL'], { message: 'Kanał: telefon albo mail.' })
  kanal!: string;

  @IsString() @MaxLength(2000)
  tresc!: string;

  @IsOptional() @IsString() @MaxLength(64)
  zgloszenie?: string | null;

  @IsOptional() @IsISO8601({ strict: true })
  kiedy?: string | null;
}
