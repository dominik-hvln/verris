import { IsInt, IsIP, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class HandshakeDto {
  @IsString()
  @IsNotEmpty()
  @IsIP()
  ipAddress!: string;

  @IsInt()
  @Min(1)
  totalCpuCores!: number;

  @IsInt()
  @Min(1)
  totalMemoryMb!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalDiskMb?: number;

  @IsOptional()
  @IsString()
  @MaxLength(8192)
  publicKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  agentVersion?: string;
}
