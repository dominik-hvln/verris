import { adminApi } from "./api";

export interface StaffAccess {
  role: string;
  isAdmin: boolean;
  roleName?: string | null;
  permissions: string[];
  /** API uprawnień nie odpowiedziało — UI pokazuje tylko to, co nie wymaga uprawnień. */
  niedostepne?: boolean;
}

/**
 * Uprawnienia zalogowanego operatora (do bramkowania nawigacji/UI).
 * Przy błędzie API — fail-closed: żadnych uprawnień (10.10: wcześniej front przyznawał wtedy pełny
 * dostęp ADMIN-a i pokazywał operatorowi moduły spoza jego roli). Twarda egzekucja i tak jest w API.
 */
export async function fetchStaffAccess(): Promise<StaffAccess> {
  try {
    return await adminApi<StaffAccess>("/staff/me/access");
  } catch {
    return { role: "STAFF", isAdmin: false, roleName: null, permissions: [], niedostepne: true };
  }
}

export function canAccess(access: StaffAccess, perm?: string): boolean {
  if (access.isAdmin) return true;
  if (!perm) return true;
  return access.permissions.includes(perm);
}
