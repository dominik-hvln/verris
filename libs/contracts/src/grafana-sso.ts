const DEFAULT_DASHBOARD_PATH = '/d/verris-ops-storage/verris-ops-storage';

/** Docelowy URL dashboardu Grafana (bez hop SSO). */
export function grafanaDashboardUrl(grafanaBaseUrl: string | undefined): string | null {
  const base = grafanaBaseUrl?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, '')}${DEFAULT_DASHBOARD_PATH}`;
}

/** Ogranicza redirect tylko do originu Grafany (open-redirect safe). */
export function safeGrafanaRedirectUrl(
  requested: string | null | undefined,
  grafanaBaseUrl: string,
): string {
  const base = grafanaBaseUrl.replace(/\/$/, '');
  const fallback = `${base}${DEFAULT_DASHBOARD_PATH}`;
  const raw = requested?.trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.origin !== new URL(base).origin) return fallback;
    return url.toString();
  } catch {
    if (raw.startsWith('/')) return `${base}${raw}`;
    return fallback;
  }
}

export type PanelAuthCookieInit = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
  domain?: string;
};

/** Opcje httpOnly cookie panelu; `domain` = SSO między subdomenami (np. `.verris.pl`). */
export function panelAuthCookieOptions(params: {
  maxAgeSeconds?: number;
  cookieDomain?: string;
  secure: boolean;
}): PanelAuthCookieInit {
  const domain = params.cookieDomain?.trim();
  return {
    httpOnly: true,
    secure: params.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: params.maxAgeSeconds ?? 60 * 60 * 8,
    ...(domain ? { domain } : {}),
  };
}
