import { IsBoolean, IsInt, Max, Min } from 'class-validator';

/** Górna granica kwoty kredytów startowych w ustawieniach (zł brutto) — chroni przed literówką w adminie. */
export const MAKS_KREDYT_AUTOSKALOWANIA = 1000;

/**
 * UX-3 — konfiguracja oferty na start (czytana przez panel klienta + admin).
 * Decyzja 6.11.2026 — rabat na start (−15% / −10%) zastąpiony kredytami na autoskalowanie przy pierwszym zakupie
 * hostingu (autoscaling/kredyty-autoskalowania.ts).
 */
export interface TrialOfferConfig {
  /** Ścieżka darmowego trialu bez karty. */
  freeEnabled: boolean;
  /** Promocja przy pierwszym zakupie (kredyty na autoskalowanie) włączona. */
  cardEnabled: boolean;
  /** Kredyty na autoskalowanie przy pierwszym zakupie planu rocznego (zł brutto). */
  annualAutoscalingCredit: number;
  /** Kredyty na autoskalowanie przy pierwszym zakupie planu miesięcznego (zł brutto). */
  monthlyAutoscalingCredit: number;
  /** Ważność kredytów od przyznania (miesiące, stała 12). */
  autoscalingCreditValidityMonths: number;
}

export class UpdateTrialOfferDto {
  @IsBoolean()
  freeEnabled!: boolean;

  @IsBoolean()
  cardEnabled!: boolean;

  @IsInt()
  @Min(0)
  @Max(MAKS_KREDYT_AUTOSKALOWANIA)
  annualAutoscalingCredit!: number;

  @IsInt()
  @Min(0)
  @Max(MAKS_KREDYT_AUTOSKALOWANIA)
  monthlyAutoscalingCredit!: number;
}
