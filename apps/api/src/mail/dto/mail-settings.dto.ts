import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class AdminMailSettingsResponseDto {
  transport!: 'local' | 'external';
  fromAddress!: string;
  fromName!: string;
  smtpHost!: string;
  smtpPort!: number;
  smtpSecure!: 'none' | 'starttls' | 'tls';
  smtpUser!: string;
  /** True when an encrypted password is stored (never returned in clear). */
  smtpPasswordConfigured!: boolean;
}

export class UpdateMailSettingsDto {
  @IsIn(['local', 'external'])
  transport!: 'local' | 'external';

  @IsEmail()
  @MaxLength(320)
  fromAddress!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fromName!: string;

  @IsOptional()
  @ValidateIf((o: UpdateMailSettingsDto) => o.transport === 'external')
  @IsString()
  @MinLength(1)
  @MaxLength(253)
  smtpHost?: string;

  @IsOptional()
  @ValidateIf((o: UpdateMailSettingsDto) => o.transport === 'external')
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @ValidateIf((o: UpdateMailSettingsDto) => o.transport === 'external')
  @IsIn(['none', 'starttls', 'tls'])
  smtpSecure?: 'none' | 'starttls' | 'tls';

  @IsOptional()
  @IsString()
  @MaxLength(320)
  smtpUser?: string;

  /** Leave empty to keep the existing password. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  smtpPassword?: string;
}

export class TestMailSettingsDto {
  @IsOptional()
  @IsEmail()
  to?: string;
}
