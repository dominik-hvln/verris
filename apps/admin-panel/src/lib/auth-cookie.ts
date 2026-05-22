import { panelAuthCookieOptions as buildOptions } from "@verris/contracts";

const EIGHT_HOURS = 60 * 60 * 8;

export function panelAuthCookieDomain(): string | undefined {
  return process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;
}

export function panelAuthCookieOptions(domain?: string) {
  return buildOptions({
    maxAgeSeconds: EIGHT_HOURS,
    cookieDomain: domain ?? panelAuthCookieDomain(),
    secure: process.env.NODE_ENV === "production",
  });
}
