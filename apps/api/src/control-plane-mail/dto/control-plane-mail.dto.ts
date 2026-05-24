import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ControlPlaneMailboxKind, ControlPlaneMailboxStatus } from '@verris/database';
import { LOCAL_PART_RE } from '../control-plane-mail.constants';

export class CreateControlPlaneMailboxDto {
  @IsString()
  @Matches(LOCAL_PART_RE, {
    message: 'Local-part: małe litery, cyfry, kropka, myślnik (max 64 znaki).',
  })
  localPart!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  domain?: string;

  @IsEnum(ControlPlaneMailboxKind)
  kind!: ControlPlaneMailboxKind;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(10240)
  quotaMb?: number;

  @IsOptional()
  @IsBoolean()
  syncUserEmail?: boolean;
}

export class UpdateControlPlaneMailboxDto {
  @IsOptional()
  @IsEnum(ControlPlaneMailboxStatus)
  status?: ControlPlaneMailboxStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(64)
  @Max(10240)
  quotaMb?: number;

  @IsOptional()
  @IsBoolean()
  imapEnabled?: boolean;
}

export class CreateMailAliasDto {
  @IsEmail()
  aliasEmail!: string;
}

export class UpdateSystemAddressesDto {
  @IsOptional()
  @IsEmail()
  noreply?: string;

  @IsOptional()
  @IsEmail()
  support?: string;

  @IsOptional()
  @IsEmail()
  security?: string;

  @IsOptional()
  @IsEmail()
  rodo?: string;

  @IsOptional()
  @IsEmail()
  billing?: string;

  @IsOptional()
  @IsEmail()
  dmarcRua?: string;

  @IsOptional()
  @IsEmail()
  panel?: string;
}
