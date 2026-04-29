import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class NodeProbeResultDto {
  @IsUUID()
  probeId!: string;

  @IsBoolean()
  ok!: boolean;

  @IsInt()
  @Min(0)
  @Max(120_000)
  latencyMs!: number;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  errorCode?: string;
}

export class NodeProbeBatchDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => NodeProbeResultDto)
  samples!: NodeProbeResultDto[];

  @IsOptional()
  @IsISO8601()
  takenAt?: string;
}
