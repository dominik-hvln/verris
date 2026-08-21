import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class HostingRestoreDto {
  @IsString()
  @MaxLength(200)
  backupId!: string;

  @IsOptional()
  @IsBoolean()
  scopeFiles?: boolean;

  @IsOptional()
  @IsBoolean()
  scopeDatabases?: boolean;

  @IsOptional()
  @IsBoolean()
  scopeEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  safetyBackup?: boolean;

  /** Must equal the service domain — confirms overwrite of live data. */
  @IsOptional()
  @IsString()
  @MaxLength(253)
  confirmDomain?: string;
}
