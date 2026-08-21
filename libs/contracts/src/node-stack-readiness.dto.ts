import type { AuditRecordField, AuditCheckStatus, DocAttestation } from './node-audit.dto';

/** Pojedyncza usługa / moduł wymagany na węźle hostingowym. */
export interface NodeStackServiceCheckDto {
  id: string;
  title: string;
  /** Czy brak usługi blokuje provisioning LIVE. */
  required: boolean;
  status: AuditCheckStatus;
  summary: string;
  records: AuditRecordField[];
  docAttestation: DocAttestation[];
}

export interface NodeStackHostingProfileRefDto {
  id: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface NodeStackReadinessDto {
  serverId: string;
  serverName: string | null;
  /** Host użyty do sond TCP/TLS (hostname węzła lub daHost). */
  probeHost: string;
  generatedAt: string;
  status: AuditCheckStatus;
  checks: NodeStackServiceCheckDto[];
  hostingProfileTask: NodeStackHostingProfileRefDto | null;
  /** Można zlecić profil (ACTIVE + agent). */
  ensureAvailable: boolean;
}

export interface EnsureNodeStackInput {
  /** Domyślnie true — bez długiego rebuild PHP/LS. */
  skipBuild?: boolean;
}
