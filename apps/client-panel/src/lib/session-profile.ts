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
  forwardedFor?: string | null,
): Promise<SessionProfile | null> {
  return (await fetchSessionProfileState(authToken, forwardedFor)).profile;
}

/**
 * Profil + powód jego braku. `unauthorized` (401/403) = sesja odrzucona przez API i można
 * usunąć ciasteczko. Każda inna awaria (5xx w trakcie wdrożenia, sieć, zły JSON) to „nie wiemy”:
 * nie wolno wpuścić (uprawnienia subkonta nieznane), ale nie wolno też wylogować.
 */
export async function fetchSessionProfileState(
  authToken: string,
  forwardedFor?: string | null,
): Promise<{ profile: SessionProfile | null; unauthorized: boolean }> {
  const zapamietany = PAMIEC.get(authToken);
  if (zapamietany && Date.now() - zapamietany.at < PAMIEC_MS) return { profile: zapamietany.profile, unauthorized: false };
  const profile = await pobierzProfil(authToken, forwardedFor);
  if (profile === 'odrzucona') {
    PAMIEC.delete(authToken);
    return { profile: null, unauthorized: true };
  }
  if (profile) {
    if (PAMIEC.size >= PAMIEC_MAX) PAMIEC.delete(PAMIEC.keys().next().value!);
    PAMIEC.set(authToken, { profile, at: Date.now() });
  }
  return { profile, unauthorized: false };
}

/**
 * Middleware sprawdza profil przy KAŻDYM żądaniu /dashboard — także przy każdej akcji serwera i
 * każdym prefetchu linku. Jeden widok pulpitu to ~40 takich żądań, więc bez pamięci podręcznej
 * sam profil zjadał limit API klienta. Udany profil pamiętamy krótko per token; API i tak
 * sprawdza uprawnienia przy każdym wywołaniu, więc odebranie uprawnień subkontu dotrze do menu
 * najpóźniej po PAMIEC_MS.
 */
const PAMIEC_MS = 20_000;
const PAMIEC_MAX = 2_000;
const PAMIEC = new Map<string, { profile: SessionProfile; at: number }>();

/** Tylko dla testów. */
export function wyczyscPamiecProfili(): void {
  PAMIEC.clear();
}

/**
 * IP klienta (`x-forwarded-for` od Caddy) idzie dalej do API tak jak w `apiFetch`. Bez tego
 * sprawdzenie sesji w middleware — przy KAŻDYM żądaniu /dashboard, także każdej akcji serwera —
 * trafiało do API z adresu kontenera panelu, czyli do jednego wspólnego limitu 300/min dla
 * wszystkich klientów naraz. Po jego wyczerpaniu middleware odpowiadał 503 „Panel chwilowo
 * niedostępny”, a strony wiszące na akcjach serwera zostawały na „Wczytywanie…”.
 * Budżet czasu: zawieszone API nie może zawiesić każdej strony panelu.
 */
async function pobierzProfil(authToken: string, forwardedFor?: string | null): Promise<SessionProfile | null | 'odrzucona'> {
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${authToken}` };
    if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;
    const res = await fetch(`${apiBaseUrl()}/users/me`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 401 || res.status === 403) return 'odrzucona';
    if (!res.ok) return null;
    const data = (await res.json()) as {
      isSubaccount?: boolean;
      customerPermissions?: string[] | null;
      email?: string;
      subaccountLabel?: string | null;
      serviceScope?: string[];
      billingOutside?: boolean;
    };
    return {
      isSubaccount: Boolean(data.isSubaccount),
      customerPermissions: Array.isArray(data.customerPermissions)
        ? data.customerPermissions.map(String)
        : null,
      email: data.email,
      subaccountLabel: data.subaccountLabel ?? null,
      serviceScope: Array.isArray(data.serviceScope) ? data.serviceScope.map(String) : [],
      billingOutside: Boolean(data.billingOutside),
    };
  } catch {
    return null;
  }
}
