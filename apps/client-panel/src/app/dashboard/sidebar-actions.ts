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
  return (await fetchSidebarUserState()).user;
}

/**
 * Profil + powód braku profilu. Wylogować wolno WYŁĄCZNIE przy `unauthorized` (brak tokenu
 * albo 401/403). Wcześniej menu wylogowywało przy każdym `null` — także przy 502 w trakcie
 * wdrożenia czy chwilowym braku sieci — i unieważniało sesję klienta w API.
 */
export async function fetchSidebarUserState(): Promise<{ user: SidebarUser | null; unauthorized: boolean }> {
  const token = await getAuthToken();
  if (!token) return { user: null, unauthorized: true };

  try {
    const res = await fetch(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return { user: null, unauthorized: true };
    if (!res.ok) return { user: null, unauthorized: false };
    const data = await res.json();
    const user: SidebarUser = {
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
    return { user, unauthorized: false };
  } catch {
    return { user: null, unauthorized: false };
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
