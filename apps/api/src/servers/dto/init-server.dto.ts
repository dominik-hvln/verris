import { KODY_REGIONOW } from '../regiony';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class InitServerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  /**
   * Fully-qualified hostname (FQDN) — required for bootstrap v2. The wildcard
   * TLS certificate (CN/SAN `*.verris.pl`) and all client-panel links resolve
   * by hostname, never by raw IP, so we enforce a real FQDN up front.
   */
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @Matches(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i, {
    message: 'hostname musi być poprawnym FQDN (np. node-pl-02.verris.pl), nie surowym IP',
  })
  hostname!: string;

  // P-13 — region trafia do deklaracji lokalizacji danych w panelu klienta; tylko kody z listy.
  @IsOptional()
  @IsIn([...KODY_REGIONOW, ''])
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
