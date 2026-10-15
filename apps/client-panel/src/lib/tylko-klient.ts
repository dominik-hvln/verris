import { apiFetch } from "@/lib/api";

/**
 * Decyzja 15.10 (#12) — panel klienta tylko dla kont klienckich. Konto zespołu (ADMIN/STAFF) wchodzi do konta klienta
 * przez „Zaloguj jako klient” w panelu operatora (sesja w imieniu klienta, z dziennikiem). Wcześniej logowanie kontem
 * zespołu w panel.verris.pl przechodziło — zespół działał w panelu klienta na własnym koncie, poza ścieżką impersonacji.
 */
export const KONTO_ZESPOLU =
  "To konto zespołu Verris — panel klienta jest tylko dla klientów. Do konta klienta wejdziesz przez „Zaloguj jako klient” w panelu operatora.";

/** Sprawdza świeżo wydany token przed zapisaniem sesji. Błąd sprawdzenia = odmowa (jak w panelu obsługi). */
export async function sesjaKlienta(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let rola: string | undefined;
  try {
    rola = (await apiFetch<{ role?: string }>("/users/me", { unauthenticated: true, headers: { Authorization: `Bearer ${token}` } })).role;
  } catch {
    return { ok: false, error: "Nie udało się zweryfikować konta — spróbuj ponownie." };
  }
  if (rola === "ADMIN" || rola === "STAFF") {
    // Sesja wydana przez API nie zostaje w przeglądarce — zamykamy ją, żeby nie wisiała na liście sesji.
    await apiFetch("/auth/logout", { unauthenticated: true, method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
    return { ok: false, error: KONTO_ZESPOLU };
  }
  return { ok: true };
}
