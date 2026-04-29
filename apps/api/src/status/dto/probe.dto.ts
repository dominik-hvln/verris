import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ProbeKind, ProbeSeverity } from '@ekohost/database';

export class CreateProbeDto {
  @IsUUID()
  serverId!: string;

  @IsEnum(ProbeKind)
  kind!: ProbeKind;

  // For HTTP/HTTPS/DA_API a full URL; for TCP-based probes "host:port"; for
  // DNS just the hostname.
  @IsString()
  @Length(3, 200)
  target!: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  label?: string;

  @IsOptional()
  @IsEnum(ProbeSeverity)
  severity?: ProbeSeverity;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  declaredSlaPct?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateProbeDto {
  @IsOptional()
  @IsString()
  @Length(3, 200)
  target?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  label?: string;

  @IsOptional()
  @IsEnum(ProbeSeverity)
  severity?: ProbeSeverity;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  declaredSlaPct?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateIncidentDto {
  @IsOptional()
  @IsString()
  @Length(3, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  publicMessage?: string;
}
