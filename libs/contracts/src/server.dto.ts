/**
 * Shared DTO shapes for Server / Bootstrap APIs.
 * Kept as plain TS types (no class-validator decorators) so they can be
 * imported by both the Nest API and the Next.js panels.
 */

export type ServerStatus =
  | 'INIT'
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'MAINTENANCE'
  | 'OFFLINE'
  | 'DEPROVISIONING';

export interface ServerSummaryDto {
  id: string;
  name: string | null;
  hostname: string | null;
  ipAddress: string;
  region: string | null;
  status: ServerStatus;

  totalCpuCores: number | null;
  totalMemoryMb: number | null;
  totalDiskMb: number | null;

  allocatedCpu: number;
  allocatedMemory: number;
  allocatedDisk: number;

  agentVersion: string | null;
  lastHandshakeAt: string | null;
  lastHeartbeatAt: string | null;

  daHost: string | null;
  daPort: number | null;
  daUsername: string | null;
  daUseTls: boolean;
  daPasswordSet: boolean;

  approvedAt: string | null;
  approvedById: string | null;
  notes: string | null;

  // Sprint 4 / A-08
  maintenanceReason: string | null;
  maintenanceStartedAt: string | null;
  maintenanceStartedById: string | null;

  createdAt: string;
  updatedAt: string;

  _count?: { accounts: number };
}

export interface InitServerInput {
  name: string;
  /** Required FQDN for bootstrap v2 (TLS wildcard + panel links resolve by hostname). */
  hostname: string;
  region?: string;
  notes?: string;
}

export interface InitServerResponseDto {
  server: ServerSummaryDto;
  bootstrapToken: string;
  bootstrapTokenId: string;
  expiresAt: string;
}

export interface BootstrapScriptResponseDto {
  serverId: string;
  script: string;
  bootstrapToken: string;
  expiresAt: string;
}

export interface UpdateDirectAdminConfigInput {
  daHost: string;
  daPort: number;
  daUsername: string;
  daPassword?: string;
  daUseTls?: boolean;
}

export interface DirectAdminTestResultDto {
  ok: boolean;
  sampleCount?: number;
  error?: string;
  /** Login-key scope probe — provisioning needs both packages + accounts. */
  scope?: {
    packages: boolean;
    accounts: boolean;
    packageCount: number | null;
  };
}
