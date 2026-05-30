import { IsBoolean, IsOptional } from 'class-validator';

export class QueueHostingProfileTaskDto {
  /** When true (default), skips long CustomBuild rebuild — only Governor/settings. */
  @IsOptional()
  @IsBoolean()
  skipBuild?: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
