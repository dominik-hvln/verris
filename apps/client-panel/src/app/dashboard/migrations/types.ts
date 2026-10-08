export type MigrationStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'RUNNING'
  | 'ATTENTION'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export type MigrationJobKind =
  | 'FILES_SFTP_RSYNC'
  | 'FILES_DELTA'
  | 'MYSQL_IMPORT'
  | 'WP_FIXUP'
  | 'IMAP_SYNC'
  | 'IMAP_DELTA'
  | 'HTTP_POST_CHECK';

export type MigrationJobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'RETRYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export interface MigrationJobView {
  id: string;
  kind: MigrationJobKind;
  status: MigrationJobStatus;
  sequence: number;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  progress: { bytes: string; files: number; note: string | null; at: string } | null;
  integrity: MigrationIntegrity | null;
  /** `strona-bez-bazy` — test strony po migracji bez bazy wrócił z błędem (oczekiwane, nie eskalujemy). */
  uwaga?: 'strona-bez-bazy' | null;
  lastHeartbeatAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export type MigrationIntegrity =
  | { kind: 'files'; sourceFiles: number | null; targetFiles: number; targetBytes: number; match: boolean | null }
  | {
      kind: 'mysql';
      database: string;
      targetTables: number;
      targetRows: number;
      sourceRows: number | null;
      match: boolean | null;
    }
  | { kind: 'imap'; mailbox: string; sourceMessages: number | null; targetMessages: number | null; match: boolean | null };

export interface MigrationBundleSummary {
  id: string;
  status: MigrationStatus;
  currentStep: string | null;
  targetDomain: string | null;
  sourcePanelType: string | null;
  needsAttention: boolean;
  attentionReason: string | null;
  cutoverMode: string | null;
  cutoverAt: string | null;
  bytesTransferred: string;
  filesTransferred: number;
  databasesMigrated: number;
  mailboxesMigrated: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  ticketId: string | null;
  /** PB-45 — migracja przygotowana przez obsługę czeka na Twoją zgodę do tej chwili (null = nie czeka). */
  consentExpiresAt?: string | null;
}

/** PB-45 — prośba o zgodę na migrację przygotowaną przez obsługę (co i skąd — bez haseł). */
export interface ProsbaOZgode {
  id: string;
  stan: 'oczekuje' | 'zaakceptowana' | 'odrzucona' | 'wygasla' | 'anulowana';
  targetDomain: string | null;
  createdAt: string;
  wygasa: string | null;
  decyzjaAt: string | null;
  ticketId: string | null;
  zrodlo: {
    ftp: { protocol: string; host: string; port: number; username: string; remotePath: string } | null;
    mysql: Array<{ host: string; port: number; database: string; username: string | null }>;
    imap: Array<{ email: string; host: string }>;
    utworzBrakujaceSkrzynki: boolean;
    notes: string | null;
  } | null;
}

export interface MigrationBundleDetail extends MigrationBundleSummary {
  jobs: MigrationJobView[];
}

export interface DiscoveredDatabase {
  name: string;
  sizeMb: number | null;
  /** Plesk: subskrypcja (konto) bazy. */
  konto?: string;
}
/** Strona na starym hostingu — katalog względem startu FTP konta (null = nieznany). */
export interface DiscoveredSite {
  domain: string;
  kind: 'main' | 'addon' | 'sub';
  ftpPath: string | null;
  konto?: string;
  ftpUser?: string;
}
export interface DiscoveredMailbox {
  email: string;
  sizeMb: number | null;
}
export interface DiscoveryResult {
  panelType: 'cpanel' | 'directadmin' | 'plesk';
  panelHost: string;
  panelPort: number;
  primaryDomain: string | null;
  domains: string[];
  databases: DiscoveredDatabase[];
  mailboxes: DiscoveredMailbox[];
  /** Starsze API mogło nie zwracać — traktuj brak jak pustą listę. */
  sites?: DiscoveredSite[];
  ftpHint: { host: string; port: number; username: string; protocol: 'ftp' } | null;
  warnings: string[];
}

export interface PreflightCheckResult {
  kind: 'ftp' | 'sftp' | 'mysql' | 'imap';
  target: string;
  /** blocked — host odrzucony przed połączeniem (sieć prywatna, serwer Verris): tej migracji nie da się dokończyć. */
  status: 'ok' | 'reachable' | 'auth_failed' | 'unreachable' | 'blocked';
  message: string;
  latencyMs: number | null;
}
export interface PreflightSummary {
  ok: boolean;
  checks: PreflightCheckResult[];
  checkedAt: string;
}

export interface CutoverRecordInstruction {
  type: 'A' | 'MX' | 'NS';
  name: string;
  value: string;
  priority?: number;
  note: string;
}
export interface CutoverPlan {
  migrationRequestId: string;
  domain: string | null;
  status: 'done' | 'ready' | 'waiting-dns' | 'blocked';
  message: string;
  deltaSyncRecommended: boolean;
  nameserverOption: { nameservers: string[]; note: string } | null;
  records: CutoverRecordInstruction[];
  cutoverAt: string | null;
  cutoverMode: string | null;
}

export const JOB_LABELS: Record<MigrationJobKind, string> = {
  FILES_SFTP_RSYNC: 'Pliki strony',
  FILES_DELTA: 'Pliki — dosynchronizowanie',
  MYSQL_IMPORT: 'Baza danych',
  WP_FIXUP: 'Konfiguracja WordPress',
  IMAP_SYNC: 'Poczta (skrzynki)',
  IMAP_DELTA: 'Poczta — dosynchronizowanie',
  HTTP_POST_CHECK: 'Test działania strony',
};

export const STATUS_LABELS: Record<MigrationStatus, string> = {
  DRAFT: 'Czeka na Twoją zgodę',
  QUEUED: 'W kolejce',
  RUNNING: 'W toku',
  ATTENTION: 'Przejął zespół',
  COMPLETED: 'Zakończona',
  FAILED: 'Błąd',
  CANCELED: 'Anulowana',
};
