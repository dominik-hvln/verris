import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Per-node authoritative nameservers. Send both `ns1` and `ns2` to override the
 * platform default, or empty strings to clear and inherit the platform default.
 */
export class UpdateNameserversDto {
  @IsOptional()
  @IsString()
  @MaxLength(253)
  ns1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  ns2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  ns3?: string;
}
