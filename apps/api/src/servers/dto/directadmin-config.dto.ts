import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpdateDirectAdminConfigDto {
  @IsString()
  @MinLength(3)
  daHost!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  daPort!: number;

  @IsString()
  @MinLength(1)
  daUsername!: string;

  /**
   * DA login key / password. Stored encrypted at rest.
   * Optional on update — if omitted, the existing password is preserved.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  daPassword?: string;

  @IsOptional()
  @IsBoolean()
  daUseTls?: boolean;

  /**
   * Audit F-04: allow a self-signed / unverified TLS cert on the DA API.
   * Escape hatch for the onboarding window ONLY — the node audit flags any
   * node left with this enabled.
   */
  @IsOptional()
  @IsBoolean()
  daAllowInvalidCert?: boolean;
}
