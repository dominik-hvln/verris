import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

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

/** H-16 — lista kopii off-site konta widziana z węzła docelowego. */
export class ListaNaWezleDto {
  @IsUUID()
  targetServerId!: string;

  @IsOptional()
  @Matches(/^\d{8}$/)
  snapshot?: string;
}

/** H-16 — odtworzenie konta z kopii off-site na innym węźle. */
export class OdtworzNaWezleDto extends ListaNaWezleDto {
  @IsString()
  @MaxLength(210)
  archive!: string;
}
