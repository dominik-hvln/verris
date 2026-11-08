import { apiFetch } from '@/lib/api';

/**
 * Paczka 122 – dla podglądu na żywo renderowanego w panelu (trasa /api/kreator/podglad): `adresZasobu` do
 * OpcjeRenderu z podpisanymi adresami API zdjęć z biblioteki (tylko zasoby konta z sesji). Brak zdjęć albo błąd
 * API → undefined (renderer w podglądzie rysuje wtedy ramkę zastępczą). Zdjęcie spoza biblioteki konta (usunięte) –
 * przezroczysty piksel zamiast adresu. Tylko po stronie serwera (apiFetch czyta ciasteczko sesji).
 */
const PIKSEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export async function adresZasobuDlaPodgladu(
  ids: string[],
): Promise<((zasobId: string, szerokosc: number, format: 'webp' | 'jpg') => string) | undefined> {
  const czyste = [...new Set(ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)))].slice(0, 100);
  if (!czyste.length) return undefined;
  try {
    const wynik = await apiFetch<{ adresy?: Record<string, string> }>(`/kreator/zasoby/adresy?ids=${czyste.join(',')}`, { timeoutMs: 10_000 });
    const adresy = wynik && typeof wynik.adresy === 'object' && wynik.adresy ? wynik.adresy : {};
    // Tylko adresy https/http (API) – nic innego nie trafi do src obrazu.
    return (id, s, f) => {
      const baza = Object.prototype.hasOwnProperty.call(adresy, id) ? adresy[id] : undefined;
      return typeof baza === 'string' && /^https?:\/\//i.test(baza) ? `${baza}${s}.${f}` : PIKSEL;
    };
  } catch {
    return undefined;
  }
}
