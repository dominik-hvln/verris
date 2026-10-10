import { staffApi } from "./staff-api";

export interface StaffAccess {
  role: string;
  isAdmin: boolean;
  roleName?: string | null;
  permissions: string[];
  /** L1-KARTA — odczyt `/staff/me/access` zawiódł; uprawnienia nieznane (nie: „brak uprawnień”). */
  nieOdczytano?: true;
}

/**
 * PB-46 — uprawnienia zalogowanego operatora (`GET /staff/me/access`) do ukrywania przycisków, których rola
 * nie pozwala użyć. Przy błędzie API — brak uprawnień (pokazujemy podgląd, nie formularz); twarda egzekucja
 * i tak jest po stronie API.
 */
export async function pobierzDostepOperatora(): Promise<StaffAccess> {
  try {
    return await staffApi<StaffAccess>("/staff/me/access");
  } catch {
    return { role: "STAFF", isAdmin: false, permissions: [], nieOdczytano: true };
  }
}

export function maUprawnienie(dostep: StaffAccess, klucz: string): boolean {
  return dostep.isAdmin || dostep.permissions.includes(klucz);
}

/**
 * Pozycja 21 — „Zaloguj jako klient” tylko dla operatora, którego API wpuści
 * (POST /admin/users/:id/impersonate: CUSTOMERS_VIEW + CUSTOMERS_IMPERSONATE). Przy nieodczytanym
 * dostępie lista uprawnień jest pusta, więc przycisk znika (fail-closed).
 */
export function mozeWejscNaKonto(dostep: StaffAccess): boolean {
  return maUprawnienie(dostep, "CUSTOMERS_VIEW") && maUprawnienie(dostep, "CUSTOMERS_IMPERSONATE");
}
