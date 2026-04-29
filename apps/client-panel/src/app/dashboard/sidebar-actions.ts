"use server";

import { getAuthToken } from "@/lib/auth";

const API_URL = process.env.API_URL || "http://localhost:3000";

export interface SidebarUser {
  firstName: string | null;
  lastName: string | null;
  email: string;
  hasActiveEcoSubscription?: boolean;
  ecoPoints?: number;
  referralCode?: string | null;
  ecoBadgeToken?: string | null;
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
      ecoPoints: typeof data.ecoPoints === 'number' ? data.ecoPoints : 0,
      referralCode: data.referralCode ?? null,
      ecoBadgeToken: data.ecoBadgeToken ?? null,
    };
  } catch {
    return null;
  }
}
