'use server';

import { apiFetch } from '@/lib/api';

export type ClientPlatformConfig = {
  ecoPointsPerTree: number;
  ecoBadgeImpressionsPerPoint: number;
  ecoPointsPer10Credits: number;
  clientIdleSessionMinutes: number;
  /** P-1 — custom-branded Roundcube webmail URL ('' = not configured). */
  webmailUrl: string;
};

export async function fetchClientPlatformConfig(): Promise<ClientPlatformConfig> {
  try {
    return await apiFetch<ClientPlatformConfig>('/platform-settings/client');
  } catch {
    return {
      ecoPointsPerTree: 1000,
      ecoBadgeImpressionsPerPoint: 100,
      ecoPointsPer10Credits: 100,
      clientIdleSessionMinutes: 60,
      webmailUrl: '',
    };
  }
}
