/**
 * Asystent AI na verris.pl — czy pokazać widget (6.11.2026). Jedyny włącznik to przełącznik w Admin → Konfiguracja asystenta (/settings/ai), sekcja „Asystent na verris.pl”;
 * layout pyta API w runtime (GET /public/asystent/status), bez flagi budowania. Wynik w cache danych Next 60 s —
 * widget pojawia się (i znika) do ok. minuty po zmianie w adminie. Błąd, timeout albo zły JSON = niewidoczny.
 * Moduł tylko dla serwera (layout); nie `'use server'`, żeby nie stał się akcją wywoływaną z przeglądarki.
 */

export function adresApi(): string {
  return (process.env.API_URL || 'http://api:3000').replace(/\/$/, '');
}

export const CZAS_STATUSU_MS = 1500;

export async function asystentDostepny(): Promise<boolean> {
  try {
    const res = await fetch(`${adresApi()}/public/asystent/status`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(CZAS_STATUSU_MS),
    });
    if (!res.ok) return false;
    const cialo = (await res.json()) as { dostepny?: unknown } | null;
    return cialo?.dostepny === true;
  } catch {
    return false;
  }
}
