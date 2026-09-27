import { cookies } from "next/headers";

/**
 * Sesja klienta wygasa po bezczynności (domyślnie 60 min, ustawienie „clientIdleSessionMinutes”).
 * Ciasteczko żyje tyle co bezczynność + zapas na rzadsze odświeżanie (SessionIdleGuard odnawia je
 * co kilka minut przy aktywności) — zamknięta karta nie trzyma już sesji przez 7 dni.
 */
export const DOMYSLNA_SESJA_MIN = 60;
export const ZAPAS_ODSWIEZANIA_MIN = 5;
/** Sesja właściciela odłożona na czas impersonacji z tej samej przeglądarki (wraca po jej końcu). */
export const CIASTECZKO_WLASCICIELA = "auth_token_wlasciciel";

export const opcjeSesji = (minuty: number = DOMYSLNA_SESJA_MIN) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: (Math.min(24 * 60, Math.max(5, minuty)) + ZAPAS_ODSWIEZANIA_MIN) * 60,
});

export async function setAuthCookie(token: string, minuty?: number) {
  const cookieStore = await cookies();
  cookieStore.set("auth_token", token, opcjeSesji(minuty));
}

export async function removeAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("auth_token");
}

export async function getAuthToken() {
  const cookieStore = await cookies();
  return cookieStore.get("auth_token")?.value;
}
