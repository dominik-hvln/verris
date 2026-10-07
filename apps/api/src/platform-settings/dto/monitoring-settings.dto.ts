import { IsBoolean, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

/** MON-3 — ustawienia monitoringu strony (admin). */
export class UpdateMonitoringSettingsDto {
  /** Darmowy interwał sprawdzania w minutach. */
  @IsInt()
  @Min(1)
  @Max(1440)
  freeIntervalMinutes!: number;

  /** Płatny interwał sprawdzania w minutach. */
  @IsInt()
  @Min(1)
  @Max(60)
  paidIntervalMinutes!: number;

  /** Miesięczna cena płatnego monitoringu w K. */
  @IsInt()
  @Min(0)
  @Max(100000)
  paidMonthlyPrice!: number;

  /** Czy oferować klientom upgrade do płatnego monitoringu. */
  @IsBoolean()
  paidOffered!: boolean;
}

/** A-14 — roczna cena brutto ukrycia danych w WHOIS (PLN); 0 = bezpłatnie, pusta/null = usługa niedostępna. */
export class UpdateWhoisPrivacyPriceDto {
  @IsOptional()
  @Matches(/^(\d{1,5}([.,]\d{1,2})?)?$/, { message: 'Podaj kwotę, np. 29,99, albo zostaw puste.' })
  whoisPrivacyPrice?: string | null;
}
