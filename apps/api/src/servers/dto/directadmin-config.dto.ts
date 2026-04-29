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
}
