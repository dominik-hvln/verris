import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { renderujStrone, walidujStrone, migrujModel, type WersjaKreatora } from '@verris/kreator';
import { apiFetch, ApiError } from '@/lib/api';
import type { StanKreatora } from '@/lib/kreator';
import { adresZasobuDlaPodgladu } from '@/app/dashboard/kreator/edytor/zdjecia/adresy-podgladu';
import { LIMIT_CIALA, naglowkiPodgladu, stronaKomunikatu, zasobyModelu, zDodatkamiEdytora, zlozPodglad } from './sklad';

export const dynamic = 'force-dynamic';

/**
 * Podgląd na żywo w edytorze kreatora. Edytor wysyła formularz POST (application/x-www-form-urlencoded) do ramki
 * `target="podglad"`: pole `model` (JSON modelu z edytora, także niezapisanego), `podstrona` (slug), `pro` ('1' =
 * pokaż elementy Pro ze wstęgą), `przewin` (px), `zaznaczona` (id sekcji), `edycja` ('1' = edycja tekstu na stronie,
 * 'zaznacz' = telefon: stuknięcie w tekst otwiera pole w formularzu edytora; brak = zwykły podgląd). Pole `wersja` z formularza jest
 * IGNOROWANE – wersję kreatora (próba/hosting/Pro) bierze trasa z API (GET /kreator/stan) dla sesji z ciasteczka.
 * Render po stronie serwera Next: przeglądarka nie dostaje renderera ani master promptu.
 */

/** Wersja kreatora konta – krótko w pamięci, bo edytor odświeża podgląd co kilkaset ms przy pisaniu. */
const CZAS_PAMIECI_MS = 30_000;
const pamiec = new Map<string, { wersja: WersjaKreatora; do: number }>();

function bazaFontow(): string {
  return `${(process.env.NEXT_PUBLIC_API_URL || 'https://api.verris.pl').replace(/\/+$/, '')}/fonts/kreator`;
}

function odpowiedz(status: number, tytul: string, tresc: string, lista: string[] = []): NextResponse {
  return new NextResponse(stronaKomunikatu(tytul, tresc, lista), { status, headers: naglowkiPodgladu(bazaFontow()) });
}

type WynikWersji = { ok: true; wersja: WersjaKreatora } | { ok: false; odp: NextResponse };

async function wersjaKonta(token: string): Promise<WynikWersji> {
  const klucz = createHash('sha256').update(token).digest('hex');
  const teraz = Date.now();
  const zapis = pamiec.get(klucz);
  if (zapis && zapis.do > teraz) return { ok: true, wersja: zapis.wersja };
  try {
    const stan = await apiFetch<StanKreatora>('/kreator/stan', { timeoutMs: 10_000 });
    if (!stan.dostep || !stan.wersja) {
      return { ok: false, odp: odpowiedz(403, 'Podgląd niedostępny', stan.powod ?? 'Kreator nie jest dostępny na tym koncie.') };
    }
    if (pamiec.size > 500) pamiec.clear();
    pamiec.set(klucz, { wersja: stan.wersja, do: teraz + CZAS_PAMIECI_MS });
    return { ok: true, wersja: stan.wersja };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { ok: false, odp: odpowiedz(401, 'Sesja wygasła', 'Zaloguj się ponownie, żeby zobaczyć podgląd.') };
    if (e instanceof ApiError && e.status === 403) return { ok: false, odp: odpowiedz(403, 'Podgląd niedostępny', e.message) };
    return { ok: false, odp: odpowiedz(503, 'Podgląd chwilowo niedostępny', 'Nie udało się połączyć z kreatorem – spróbuj za chwilę.') };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return odpowiedz(401, 'Sesja wygasła', 'Zaloguj się ponownie, żeby zobaczyć podgląd.');

  // Formularz wysyła wyłącznie edytor panelu (ta sama strona). Cudzy formularz POST nie dostanie podglądu.
  const skad = request.headers.get('sec-fetch-site');
  if (skad && skad !== 'same-origin') return odpowiedz(403, 'Podgląd niedostępny', 'Podgląd otwiera się tylko z edytora w panelu.');

  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    return odpowiedz(415, 'Nieobsługiwane żądanie', 'Podgląd przyjmuje tylko formularz edytora.');
  }
  const deklarowana = Number(request.headers.get('content-length') ?? '0');
  if (deklarowana > LIMIT_CIALA) return odpowiedz(413, 'Strona jest za duża na podgląd', 'Zmniejsz liczbę podstron albo sekcji.');
  const surowe = await request.text();
  if (Buffer.byteLength(surowe, 'utf8') > LIMIT_CIALA) return odpowiedz(413, 'Strona jest za duża na podgląd', 'Zmniejsz liczbę podstron albo sekcji.');

  const pola = new URLSearchParams(surowe);
  const podstrona = pola.get('podstrona') ?? '';
  if (!/^([a-z0-9-]{1,60}(\/[a-z0-9-]{1,60}){0,2})?$/.test(podstrona)) return odpowiedz(400, 'Nieprawidłowa podstrona', 'Wybierz podstronę z listy w edytorze.');
  const zaznaczona = pola.get('zaznaczona');
  const edycjaPole = pola.get('edycja');
  const edycja = edycjaPole === '1' ? 'edycja' : edycjaPole === 'zaznacz' ? 'zaznacz' : null;
  const przewin = Number(pola.get('przewin') ?? '0');

  let dane: unknown;
  try {
    dane = JSON.parse(pola.get('model') ?? '');
  } catch {
    return odpowiedz(400, 'Nie udało się odczytać strony', 'Odśwież edytor i spróbuj ponownie.');
  }

  const wersja = await wersjaKonta(token);
  if (!wersja.ok) return wersja.odp;

  const w = walidujStrone(migrujModel(dane));
  if (!w.ok) {
    return odpowiedz(400, 'Podgląd czeka na poprawki', 'Strona ma pola do poprawienia – zaznaczyliśmy je w edytorze. Podgląd odświeży się sam.', w.bledy.slice(0, 5));
  }
  if (!w.strona.strony.some((p) => p.slug === podstrona)) return odpowiedz(404, 'Nie ma takiej podstrony', 'Wybierz podstronę z listy w edytorze.');

  const baza = bazaFontow();
  // Zdjęcia z biblioteki: podpisane adresy API (tylko zasoby konta z sesji); błąd API = ramki zastępcze.
  const adresZasobu = await adresZasobuDlaPodgladu(zasobyModelu(w.strona));
  const render = renderujStrone(w.strona, {
    tryb: 'podglad',
    wersja: wersja.wersja,
    podgladPro: pola.get('pro') === '1',
    bazaFontow: baza,
    noindex: true,
    edycja: edycja !== null,
    ...(adresZasobu ? { adresZasobu } : {}),
  });
  const html = zlozPodglad(render.pliki, podstrona);
  if (html === null) return odpowiedz(404, 'Nie ma takiej podstrony', 'Wybierz podstronę z listy w edytorze.');

  const zId = zaznaczona && /^[a-z][a-z0-9-]{0,39}$/.test(zaznaczona) ? zaznaczona : null;
  const wynik = zDodatkamiEdytora(html, { podstrona, przewin: Number.isFinite(przewin) ? przewin : 0, zaznaczona: zId, edycja });
  return new NextResponse(wynik, { status: 200, headers: naglowkiPodgladu(baza) });
}

/** Podgląd tylko POST-em z edytora; wejście z paska adresu dostaje komunikat zamiast błędu Next. */
export async function GET(): Promise<NextResponse> {
  return odpowiedz(405, 'Podgląd otwiera się w edytorze', 'Wróć do edytora strony w panelu.');
}
