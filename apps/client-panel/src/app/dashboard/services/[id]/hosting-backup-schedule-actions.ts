'use server';

import { apiFetch, ApiError } from '@/lib/api';

export type BackupFrequency = 'OFF' | 'DAILY' | 'WEEKLY';
export type BackupScheduleState = {
  frequency: BackupFrequency;
  hour: number;
  dayOfWeek: number;
  enabled: boolean;
  retainCount: number;
  lastRunAt: string | null;
  lastStatus: string | null;
};
type Result = { ok: true } | { ok: false; error: string };
function errMsg(err: unknown): string {
  return err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Błąd';
}

export async function fetchBackupScheduleAction(subscriptionId: string): Promise<BackupScheduleState> {
  return apiFetch(`/services/${subscriptionId}/hosting-backup-schedule`);
}

export async function setBackupScheduleAction(input: {
  subscriptionId: string;
  frequency: BackupFrequency;
  hour: number;
  dayOfWeek: number;
  enabled: boolean;
  retainCount: number;
}): Promise<Result> {
  try {
    await apiFetch(`/services/${input.subscriptionId}/hosting-backup-schedule`, {
      method: 'POST',
      body: JSON.stringify({ frequency: input.frequency, hour: input.hour, dayOfWeek: input.dayOfWeek, enabled: input.enabled, retainCount: input.retainCount }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}
