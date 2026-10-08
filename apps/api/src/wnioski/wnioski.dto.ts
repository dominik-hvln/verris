import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** PB-48 — złożenie wniosku. Payload sprawdza klasa DTO typu z rejestru (rejestr-wnioskow.ts). */
export class ZlozWniosekDto {
  @IsString()
  @MaxLength(64)
  typ!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  subscriptionId?: string;

  @IsObject()
  payload!: Record<string, unknown>;

  /** Dlaczego operacja jest potrzebna — widzi to akceptujący i dziennik. */
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  uzasadnienie!: string;
}

/** Odrzucenie — powód wymagany (wnioskujący dostaje go w powiadomieniu). */
export class OdrzucWniosekDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  powod?: string;
}

/** Akceptacja — opcjonalna uwaga akceptującego. */
export class AkceptujWniosekDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  uwaga?: string;
}

export class HistoriaWnioskowQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;
}
