'use server';

import { staffApi } from './staff-api';

export type StaffPlatformConfig = {
  staffIdleSessionMinutes: number;
};

export async function fetchStaffPlatformConfig(): Promise<StaffPlatformConfig> {
  try {
    return await staffApi<StaffPlatformConfig>('/platform-settings/staff');
  } catch {
    return { staffIdleSessionMinutes: 30 };
  }
}
