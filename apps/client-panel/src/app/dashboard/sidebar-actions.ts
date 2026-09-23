"use server";

import { getAuthToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

const API_URL = process.env.API_URL || "http://localhost:3000";

export interface SidebarUser {
  firstName: string | null;
  lastName: string | null;
  email: string;
  hasActiveEcoSubscription?: boolean;
  isEcoProgramParticipant?: boolean;
  ecoPoints?: number;
  referralCode?: string | null;
  ecoBadgeToken?: string | null;
  sidebarQuickLinks?: string[];
  /**
   * Saldo portfela w PLN (string z Prisma Decimal). UI renderuje to jako
   * wirtualne kredyty Verris 1:1 — patrz `lib/credits.ts`. `null` oznacza
   * błąd fetchu (np. wygasły token), żeby topbar mógł pokazać fallback.
   */
  walletBalance: string | null;
  isSubaccount?: boolean;
  customerPermissions?: string[] | null;
  /** PB-16 — preferencje wyglądu per użytkownik; null = jeszcze nie wybrał. */
  panelViewMode: 'simple' | 'full' | null;
  panelTheme: 'dark' | 'light' | null;
  /** PROD-02 — baner „Pierwsze kroki” schowany na koncie. */
  onboardingHidden: boolean;
}

/**
 * Lekki fetch profilu do wyświetlenia w sidebarze.
 */
export async function fetchSidebarUser(): Promise<SidebarUser | null> {
  const token = await getAuthToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      hasActiveEcoSubscription: Boolean(data.hasActiveEcoSubscription),
      isEcoProgramParticipant: Boolean(
        data.isEcoProgramParticipant ?? data.hasActiveEcoSubscription,
      ),
      ecoPoints: typeof data.ecoPoints === 'number' ? data.ecoPoints : 0,
      referralCode: data.referralCode ?? null,
      ecoBadgeToken: data.ecoBadgeToken ?? null,
      sidebarQuickLinks: Array.isArray(data.sidebarQuickLinks) ? data.sidebarQuickLinks : [],
      walletBalance:
        typeof data.walletBalance === 'string'
          ? data.walletBalance
          : typeof data.walletBalance === 'number'
            ? data.walletBalance.toFixed(2)
            : null,
      isSubaccount: Boolean(data.isSubaccount),
      panelViewMode: data.panelViewMode === 'simple' || data.panelViewMode === 'full' ? data.panelViewMode : null,
      panelTheme: data.panelTheme === 'dark' || data.panelTheme === 'light' ? data.panelTheme : null,
      onboardingHidden: data.onboardingHidden === true,
      customerPermissions: Array.isArray(data.customerPermissions)
        ? data.customerPermissions.map(String)
        : null,
    };
  } catch {
    return null;
  }
}

/** PB-16 — zapis widoku/motywu panelu na koncie (żeby działał na każdym urządzeniu). Błąd nie przerywa pracy. */
export async function savePanelPreferences(prefs: { panelViewMode?: 'simple' | 'full'; panelTheme?: 'dark' | 'light'; onboardingHidden?: boolean }): Promise<boolean> {
  const token = await getAuthToken();
  if (!token) return false;
  try {
    await apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify(prefs) });
    return true;
  } catch {
    return false;
  }
}
