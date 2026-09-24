import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Polityka pojemności węzła. Współczynniki nadsubskrypcji sprawdza `bladWspolczynnika` w serwisie. */
export class PolitykaPojemnosciDto {
  @IsOptional() @IsBoolean() acceptsNewAccounts?: boolean;
  /** null = bez limitu. */
  @IsOptional() @IsInt() @Min(0) maxAccounts?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(90) reservedHeadroomPercent?: number;
  // Z-12 — nadsubskrypcja pojemności węzła (1 = wyłączona).
  @IsOptional() @IsNumber() overcommitCpu?: number;
  @IsOptional() @IsNumber() overcommitRam?: number;
  @IsOptional() @IsNumber() overcommitDisk?: number;
}

export class WygaszenieWezlaDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
