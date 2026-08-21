'use server';

import { adminApi } from './api';

export type AdminPlatformConfig = {
  adminIdleSessionMinutes: number;
};

export async function fetchAdminPlatformConfig(): Promise<AdminPlatformConfig> {
  try {
    return await adminApi<AdminPlatformConfig>('/platform-settings/admin');
  } catch {
    return { adminIdleSessionMinutes: 15 };
  }
}
