import type { ClientNavContext } from './client-nav-access';

export type SessionProfile = ClientNavContext & {
  email?: string;
  subaccountLabel?: string | null;
};

export function apiBaseUrl(): string {
  return (
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

/** Profil sesji z API (używany w middleware i RSC). */
export async function fetchSessionProfile(
  authToken: string,
): Promise<SessionProfile | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/users/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      isSubaccount?: boolean;
      customerPermissions?: string[] | null;
      email?: string;
      subaccountLabel?: string | null;
    };
    return {
      isSubaccount: Boolean(data.isSubaccount),
      customerPermissions: Array.isArray(data.customerPermissions)
        ? data.customerPermissions.map(String)
        : null,
      email: data.email,
      subaccountLabel: data.subaccountLabel ?? null,
    };
  } catch {
    return null;
  }
}
