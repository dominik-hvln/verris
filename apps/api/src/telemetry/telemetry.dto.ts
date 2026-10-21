import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { USLUGI_WATCHDOGA } from '@verris/contracts';

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

  /**
   * Audit F-07: whether the node carries the /etc/verris-hardened marker
   * (written by security-hardening-baseline.sh during LIVE onboarding).
   */
  @IsOptional() @IsBoolean()
  hardened?: boolean;

  /** DB-1 — silnik bazy danych węzła, np. "MariaDB" / "MySQL" (mariadbd --version). */
  @IsOptional() @IsString() @MaxLength(40)
  dbEngine?: string;

  /** DB-1 — wersja silnika bazy, np. "10.6.18". */
  @IsOptional() @IsString() @MaxLength(40)
  dbVersion?: string;

  /** PB-30 — wersje stosu do raportu zgodności z manifestem floty. */
  @IsOptional() @IsString() @MaxLength(40)
  stackVersion?: string;

  @IsOptional() @IsString() @MaxLength(40)
  daVersion?: string;

  @IsOptional() @IsString() @MaxLength(40)
  lsVersion?: string;

  @IsOptional() @IsString() @MaxLength(40)
  clVersion?: string;

  @IsOptional() @IsString() @MaxLength(40)
  phpVersion?: string;

  /** NODE-03 — pojemność węzła z każdego raportu (nproc, MemTotal, df /). */
  @IsOptional() @IsInt() @Min(1) @Max(4096)
  totalCpuCores?: number;

  @IsOptional() @IsInt() @Min(1) @Max(64 * 1024 * 1024)
  totalMemoryMb?: number;

  @IsOptional() @IsInt() @Min(1) @Max(1024 * 1024 * 1024)
  totalDiskMb?: number;

  /** F3.4 — watchdog usług (agent lve-agent/1.3+): stan usług z białej listy; brak bloku = stary agent albo brak systemctl. */
  @IsOptional() @IsArray() @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => NodeServiceStateDto)
  services?: NodeServiceStateDto[];
}

/** F3.4 — stan jednej usługi z białej listy (watchdog agenta): klucz, ActiveState, UnitFileState. */
export class NodeServiceStateDto {
  @IsIn(USLUGI_WATCHDOGA.map((u) => u.klucz))
  k!: string;

  @IsString() @Matches(/^[a-z-]{1,20}$/)
  s!: string;

  @IsOptional() @IsString() @Matches(/^[a-z-]{1,20}$/)
  e?: string;
}

/**
 * F2.6 — faulty limitów jednego konta w oknie (liczba odbić od limitu). Źródło na węźle: `cloudlinux-statistics
 * --json --period=1d|7d --order-by=any_faults`, sekcja `faults.<zasób>.lve` (format i jednostki:
 * https://docs.cloudlinux.com/cloudlinuxos/command-line_tools/#cloudlinux-statistics, LVE-Stats 2 jak lveinfo:
 * https://docs.cloudlinux.com/cloudlinuxos/command-line_tools/#lveinfo). Brak pola = węzeł go nie podał (np. IOPS < LVE 8).
 */
export class LveFaultsAccountDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  username!: string;

  @IsOptional() @IsInt() @Min(0) cpu?: number;
  @IsOptional() @IsInt() @Min(0) ep?: number;
  @IsOptional() @IsInt() @Min(0) nproc?: number;
  @IsOptional() @IsInt() @Min(0) pmem?: number;
  @IsOptional() @IsInt() @Min(0) io?: number;
  @IsOptional() @IsInt() @Min(0) iops?: number;
}

export class LveFaultsWindowDto {
  /** Długość okna w godzinach: 24 (doba) albo 168 (7 dni). */
  @IsInt() @IsIn([24, 168])
  hours!: number;

  /** Tylko konta z co najmniej jednym faultem (agent odfiltrowuje zera). */
  @IsArray() @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LveFaultsAccountDto)
  accounts!: LveFaultsAccountDto[];

  /** Węzeł ma więcej kont z faultami niż limit raportu (lista ucięta do najgorszych). */
  @IsOptional() @IsBoolean()
  truncated?: boolean;
}

/**
 * F2.6 — raport faultów z węzła (co ~10 min, niezależnie od kubełków zużycia). `error` = narzędzie zwróciło błąd
 * (`result` ≠ `success`) — wtedy okien nie ma, a panel pokazuje błąd zamiast zer.
 */
export class LveFaultsReportDto {
  @IsOptional() @IsArray() @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => LveFaultsWindowDto)
  windows?: LveFaultsWindowDto[];

  @IsOptional() @IsString() @MaxLength(300)
  error?: string;
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

  /** F2.6 — faulty limitów kont (opcjonalne: stary agent ich nie wysyła i nie psuje to raportu). */
  @IsOptional()
  @ValidateNested()
  @Type(() => LveFaultsReportDto)
  faults?: LveFaultsReportDto;

  /**
   * 21.10 — oczekujące aktualizacje bezpieczeństwa (agent lve-agent/1.4+, co ~6 h). Kształt StanAktualizacjiWezla
   * (libs/contracts/src/aktualizacje-wezla.ts) sprawdza wpis po wpisie `oczyscRaportAktualizacji` — zły wiersz odpada,
   * nie cały raport; tu tylko „to jest obiekt”.
   */
  @IsOptional()
  @IsObject()
  aktualizacje?: Record<string, unknown>;

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
