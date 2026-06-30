import { adminApi } from "./api";

export interface StaffAccess {
  role: string;
  isAdmin: boolean;
  roleName?: string | null;
  permissions: string[];
}

/**
 * Uprawnienia zalogowanego operatora (do bramkowania nawigacji/UI).
 * Przy błędzie API zwracamy pełny dostęp — żeby nie zablokować panelu
 * (twarda egzekucja i tak jest po stronie API).
 */
export async function fetchStaffAccess(): Promise<StaffAccess> {
  try {
    return await adminApi<StaffAccess>("/staff/me/access");
  } catch {
    return { role: "ADMIN", isAdmin: true, permissions: [] };
  }
}

export function canAccess(access: StaffAccess, perm?: string): boolean {
  if (access.isAdmin) return true;
  if (!perm) return true;
  return access.permissions.includes(perm);
}
