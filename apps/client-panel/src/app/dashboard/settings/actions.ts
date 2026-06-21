"use server";

import { getAuthToken } from "@/lib/auth";
import { apiFetch, ApiError } from "@/lib/api";
import type { SidebarTileHref } from "@verris/contracts";

export interface UserProfile {
  id: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  nip: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  locale: string;
  walletBalance: string;
  ecoPoints: number;
  isTwoFactorEnabled: boolean;
  requireStrongAuth?: boolean;
  hasPasskey?: boolean;
  createdAt: string;
  sidebarQuickLinks?: string[];
  isSubaccount?: boolean;
  customerPermissions?: string[] | null;
  subaccountLabel?: string | null;
}

/**
 * Pobiera pełny profil zalogowanego użytkownika.
 */
export async function fetchUserProfile(): Promise<UserProfile | null> {
  const token = await getAuthToken();
  if (!token) return null;
  try {
    return await apiFetch<UserProfile>("/users/me");
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
}

/**
 * Aktualizuje dane profilowe i bilingowe użytkownika.
 */
export async function updateSidebarQuickLinks(links: SidebarTileHref[]) {
  const token = await getAuthToken();
  if (!token) return { error: "Brak autoryzacji" };

  try {
    await apiFetch("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ sidebarQuickLinks: links }),
    });
    return { success: true as const };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "Błąd połączenia z serwerem" };
  }
}

export async function updateUserProfile(data: Partial<UserProfile>) {
  const token = await getAuthToken();
  if (!token) return { error: "Brak autoryzacji" };

  try {
    const updated = await apiFetch<UserProfile>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return { success: true, data: updated };
  } catch {
    return { error: "Błąd połączenia z serwerem" };
  }
}

/** SEC-9 — żądanie zmiany adresu e-mail (link weryfikacyjny trafia na nowy adres). */
export async function requestEmailChange(newEmail: string, password: string) {
  const token = await getAuthToken();
  if (!token) return { error: "Brak autoryzacji" };
  try {
    await apiFetch("/auth/email-change/request", {
      method: "POST",
      body: JSON.stringify({ newEmail, password }),
    });
    return { success: true as const };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "Błąd połączenia z serwerem" };
  }
}

/** SEC-6 — włącz/wyłącz wymóg silnego logowania (passkey/2FA). */
export async function setStrongAuthRequirement(enabled: boolean) {
  const token = await getAuthToken();
  if (!token) return { error: "Brak autoryzacji" };
  try {
    await apiFetch("/users/me/strong-auth", {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    return { success: true as const };
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "Błąd połączenia z serwerem" };
  }
}

/**
 * Zmienia hasło użytkownika.
 */
export async function changeUserPassword(currentPassword: string, newPassword: string) {
  const token = await getAuthToken();
  if (!token) return { error: "Brak autoryzacji" };

  try {
    await apiFetch("/users/password", {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return { success: true };
  } catch {
    return { error: "Błąd połączenia z serwerem" };
  }
}
