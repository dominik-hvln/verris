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

/** Profil sesji z API (używany w middleware i RSC). Każda awaria → `null`. */
export async function fetchSessionProfile(
  authToken: string,
): Promise<SessionProfile | null> {
  return (await fetchSessionProfileState(authToken)).profile;
}

/**
 * Profil + powód jego braku. `unauthorized` (401/403) = sesja odrzucona przez API i można
 * usunąć ciasteczko. Każda inna awaria (5xx w trakcie wdrożenia, sieć, zły JSON) to „nie wiemy”:
 * nie wolno wpuścić (uprawnienia subkonta nieznane), ale nie wolno też wylogować.
 */
export async function fetchSessionProfileState(
  authToken: string,
): Promise<{ profile: SessionProfile | null; unauthorized: boolean }> {
  const profile = await pobierzProfil(authToken);
  return profile === 'odrzucona' ? { profile: null, unauthorized: true } : { profile, unauthorized: false };
}

async function pobierzProfil(authToken: string): Promise<SessionProfile | null | 'odrzucona'> {
  try {
    const res = await fetch(`${apiBaseUrl()}/users/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) return 'odrzucona';
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
