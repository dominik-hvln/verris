/** Typy raportu dostarczalności (dane idą przez /api/services/[id]/deliverability). */

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface DeliverabilityCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  suggestion?: {
    host: string;
    type: string;
    value: string;
    /** Rekord w strefie Verris do zastąpienia (edycja zamiast dodania). */
    replaces?: { name: string; type: string; value: string };
    /** Rekord już jest w strefie Verris — trzeba go skopiować do zewnętrznego DNS. */
    inZone?: boolean;
  };
}

export interface DeliverabilityReport {
  domain: string | null;
  sendingIp: string | null;
  generatedAt: string;
  score: number;
  checks: DeliverabilityCheck[];
  blacklists: Array<{ zone: string; listed: boolean }>;
  /** Domena używa serwerów DNS Verris; null = nie wiadomo. */
  usesPlatformDns: boolean | null;
}
