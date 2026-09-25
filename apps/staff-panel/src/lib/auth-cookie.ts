import { panelAuthCookieOptions as buildOptions } from "@verris/contracts";

const EIGHT_HOURS = 60 * 60 * 8;

/**
 * Ciasteczko sesji panelu tylko dla jego własnego hosta (bez Domain). Do 2026-09-25 szło z
 * AUTH_COOKIE_DOMAIN=.verris.pl na wszystkie subdomeny (www, api, status, panel klienta) — przejęcie
 * albo logi dowolnej z nich dawały token operatora. Grafana dostaje własną sesję przez bilet z API.
 */
export function panelAuthCookieOptions() {
  return buildOptions({ maxAgeSeconds: EIGHT_HOURS, secure: process.env.NODE_ENV === "production" });
}

/** Domena, na której mogło zostać ciasteczko sprzed zmiany — kasujemy je przy logowaniu i wylogowaniu. */
export function staraDomenaCiasteczka(): string | undefined {
  return process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;
}
