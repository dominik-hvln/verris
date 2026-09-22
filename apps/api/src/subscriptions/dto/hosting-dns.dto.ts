import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

/**
 * F-01/F-02 — rekord DNS od klienta idzie prosto do DirectAdmina
 * (CMD_API_DNS_CONTROL). Do 2026-09-22 body było nietypowane: dowolny typ,
 * dowolna długość, znaki nowej linii w wartości.
 */
export const TYPY_REKORDOW_DNS = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS', 'CAA'] as const;

class RekordDnsBaza {
  @IsString()
  @MinLength(3)
  @MaxLength(253)
  domain!: string;

  /** `@`, etykiety, `*` (wildcard) i `_` (np. _dmarc, _sip._tcp). */
  @IsString()
  @Matches(/^(@|[A-Za-z0-9_*]([A-Za-z0-9_*.-]{0,252})?\.?)$/, { message: 'Niepoprawna nazwa rekordu.' })
  name!: string;

  @IsIn(TYPY_REKORDOW_DNS)
  type!: (typeof TYPY_REKORDOW_DNS)[number];

  /** Bez znaków sterujących — wartość trafia do pliku strefy. */
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  @Matches(/^[^\x00-\x1f\x7f]+$/, { message: 'Wartość rekordu nie może zawierać znaków sterujących.' })
  value!: string;
}

export class UtworzRekordDnsDto extends RekordDnsBaza {
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86400)
  ttl?: number;
}

export class UsunRekordDnsDto extends RekordDnsBaza {}
