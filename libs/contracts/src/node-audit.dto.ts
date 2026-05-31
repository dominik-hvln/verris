/**
 * Shared DTO shapes for the node audit & repair API.
 *
 * The audit follows the two-phase validator model: phase 1 confirms an object
 * actually exists (DB row / DA package / agent), phase 2 confirms it matches
 * the expected Verris `Plan` and vendor documentation. Every check carries the
 * concrete records it read plus a documentation attestation so the admin sees
 * *why* a state is considered correct — not just a green badge.
 */

export type AuditCheckStatus = 'OK' | 'WARN' | 'FAIL' | 'UNKNOWN';

/** Repair invasiveness — drives the confirmation UX in the admin panel. */
export type RepairRisk = 'safe' | 'caution' | 'danger';

export interface AuditRecordField {
  /** Human label, PL. */
  label: string;
  /** What we expected (from Plan / spec), if applicable. */
  expected?: string | null;
  /** What we actually read from DA / DB / node. */
  actual?: string | null;
  /** Per-field pass flag (undefined = informational only). */
  ok?: boolean;
}

export interface DocAttestation {
  vendor: 'DirectAdmin' | 'CloudLinux' | 'LiteSpeed' | 'Verris';
  /** Statement of what the check verified against documented behaviour. */
  statement: string;
  /** Link to the relevant documentation section (opened in a new tab). */
  reference?: string | null;
  /** ISO date the statement was last verified against vendor docs. */
  verifiedAt?: string | null;
  /** Installed product version on the node, when known. */
  productVersion?: string | null;
}

export interface AuditRepairDto {
  /** Stable id used by `POST /admin/servers/:id/repair/:actionId`. */
  actionId: string;
  risk: RepairRisk;
  /** Button label, PL. */
  label: string;
  /** Plain-language description of exactly what the repair will do. */
  description: string;
  /** caution/danger require an explicit confirmation in the UI. */
  requiresConfirmation: boolean;
  /**
   * For `danger` repairs: the value the admin must type to confirm (the server
   * name). The API re-checks it. `null` for safe/caution.
   */
  confirmValue?: string | null;
  /** Warning shown for caution/danger repairs ("może uszkodzić X"). */
  warning?: string | null;
}

export type AuditCheckCategory =
  | 'DA_CONNECTIVITY'
  | 'DA_PACKAGES'
  | 'DA_LOCALE'
  | 'HOSTNAME'
  | 'TLS'
  | 'AGENT'
  | 'DNS';

export interface AuditCheckDto {
  id: string;
  title: string;
  category: AuditCheckCategory;
  status: AuditCheckStatus;
  /** One-line PL summary (sukces / co naprawić). */
  summary: string;
  /** Concrete records read during the check (phase 1 + phase 2 evidence). */
  records: AuditRecordField[];
  docAttestation: DocAttestation[];
  /** Present only when an automated repair exists for this check. */
  repair: AuditRepairDto | null;
}

export interface NodeStackVersions {
  directadmin: string | null;
  cloudlinux: string | null;
  litespeed: string | null;
  agent: string | null;
}

export interface NodeAuditReportDto {
  serverId: string;
  serverName: string | null;
  generatedAt: string;
  /** Worst status across all checks. */
  status: AuditCheckStatus;
  stackVersions: NodeStackVersions;
  checks: AuditCheckDto[];
}

export interface NodeRepairInput {
  /** Required for `danger` repairs — must equal the server name. */
  confirm?: string;
}

export interface NodeRepairResultDto {
  serverId: string;
  actionId: string;
  ok: boolean;
  message: string;
  /** The single check re-validated immediately after the repair ran. */
  check: AuditCheckDto | null;
}
