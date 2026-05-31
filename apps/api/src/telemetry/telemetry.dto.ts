import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * One bucketed sample for one DirectAdmin user, as collected by the node
 * agent (typically from `lveinfo`/`cloudlinux-statistic`).
 *
 * Buckets are aligned in UTC (e.g. minute-aligned for `bucketDurationS=60`).
 * The agent groups raw 1s readings into avg/max per bucket before pushing.
 */
export class AccountMetricsDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  /** Average CPU usage in percent over the bucket (0..N×100). */
  @IsNumber() @Min(0) @Max(100_000)
  cpuUsagePercent!: number;

  /** Optional max CPU within the bucket — useful for spike detection. */
  @IsOptional() @IsNumber() @Min(0) @Max(100_000)
  cpuUsageMaxPercent?: number;

  /** Average RSS in MB. */
  @IsNumber() @Min(0)
  memUsageMb!: number;

  @IsOptional() @IsNumber() @Min(0)
  memUsageMaxMb?: number;

  /** Disk usage (point-in-time, taken at bucket end). */
  @IsNumber() @Min(0)
  diskUsageMb!: number;

  /** I/O throughput average in kbps. */
  @IsOptional() @IsNumber() @Min(0)
  ioUsageKbps?: number;

  /** Optional ISO timestamp for the bucket start. Defaults to "now − duration". */
  @IsOptional() @IsISO8601()
  bucketStart?: string;
}

/**
 * Node-level runtime status reported by the agent every cycle (independent of
 * per-account telemetry, so it flows even when the node has no hosting
 * accounts yet). Feeds the node audit "CageFS" check.
 */
export class NodeStatusDto {
  /** Whether CloudLinux CageFS is enabled on the node (cagefsctl --cagefs-status). */
  @IsOptional() @IsBoolean()
  cagefsEnabled?: boolean;

  /** Number of accounts currently caged (cagefsctl --list-enabled). */
  @IsOptional() @IsInt() @Min(0)
  cagefsEnabledCount?: number;
}

export class CloudLinuxTelemetryDto {
  // serverId is authoritative from X-Server-Id; kept optional for self-tests.
  @IsOptional()
  @IsString()
  serverId?: string;

  /** Node-level runtime status (CageFS etc.), reported each agent cycle. */
  @IsOptional()
  @ValidateNested()
  @Type(() => NodeStatusDto)
  node?: NodeStatusDto;

  /**
   * Bucket length in seconds. The agent typically pushes 60 s buckets every
   * minute; the engine aggregates 5 of those for autoscaling decisions.
   */
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(86_400)
  bucketDurationS?: number;

  /** ISO timestamp of the bucket start; if omitted, server uses now − duration. */
  @IsOptional()
  @IsISO8601()
  bucketStart?: string;

  /** Optional version of the agent — useful for compatibility checks. */
  @IsOptional()
  @IsString()
  agentVersion?: string;

  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => AccountMetricsDto)
  accounts!: AccountMetricsDto[];
}
