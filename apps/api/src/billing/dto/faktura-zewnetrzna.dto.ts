import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * FAK-01 — numer faktury VAT wystawionej w programie księgowym.
 *
 * Format zależy od programu i od tego, jaką numerację ustawi księgowa, więc
 * nie wymuszamy wzorca serii — tylko zestaw znaków, który spotyka się w
 * numerach faktur. Bez spacji na brzegach i bez znaków sterujących: numer
 * trafia do PDF-u, CSV i maila.
 */
export class FakturaZewnetrznaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N} ./_\-#]*[\p{L}\p{N}]$|^[\p{L}\p{N}]$/u, {
    message: 'Numer faktury: litery, cyfry oraz . / _ - # i spacje w środku.',
  })
  numer!: string;
}
