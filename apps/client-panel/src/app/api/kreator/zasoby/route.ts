import { NextResponse, type NextRequest } from 'next/server';
import { MAKS_BAJTOW_ZDJECIA } from '@/app/dashboard/kreator/edytor/zdjecia/typy';

export const dynamic = 'force-dynamic';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
/** Zapas na granice i pola tekstowe multipart ponad sam plik (API ma ten sam zapas). */
const MAKS_CIALA = MAKS_BAJTOW_ZDJECIA + 64 * 1024;

const blad = (message: string, status: number) => NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Paczka 122 – wgranie zdjęcia do biblioteki kreatora: proxy POST multipart → API /kreator/zasoby z tokenem sesji
 * (wzorzec tras ZIP i podglądu). Trasa, nie akcja serwera: przeglądarka wysyła plik przez XMLHttpRequest i pokazuje
 * postęp, a ciało idzie strumieniem do API (bez buforowania 15 MB w Next). Middleware panelu pomija /api, więc
 * limit ciała middleware Next nie dotyczy tej trasy – pilnujemy go sami (Content-Length).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return blad('Zaloguj się ponownie.', 401);
  const skad = request.headers.get('sec-fetch-site');
  if (skad && skad !== 'same-origin') return blad('Zdjęcia wgrywa się z edytora w panelu.', 403);
  const typ = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data;\s*boundary=/i.test(typ)) return blad('Nieprawidłowe żądanie wgrania zdjęcia.', 400);
  const dlugosc = Number(request.headers.get('content-length') ?? 'NaN');
  if (!Number.isFinite(dlugosc)) return blad('Nieprawidłowe żądanie wgrania zdjęcia.', 411);
  if (dlugosc > MAKS_CIALA) return blad(`Zdjęcie jest za duże – limit ${MAKS_BAJTOW_ZDJECIA / 1048576} MB.`, 413);
  if (!request.body) return blad('Wybierz zdjęcie do wgrania.', 400);

  const naglowki: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': typ, 'Content-Length': String(dlugosc) };
  const xff = request.headers.get('x-forwarded-for');
  if (xff) naglowki['x-forwarded-for'] = xff;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/kreator/zasoby`, {
      method: 'POST',
      headers: naglowki,
      body: request.body,
      // Strumień jako ciało żądania (Node fetch/undici) wymaga duplex: 'half'.
      duplex: 'half',
      cache: 'no-store',
      signal: AbortSignal.timeout(120_000),
    } as RequestInit & { duplex: 'half' });
  } catch {
    return blad('Nie udało się wgrać zdjęcia – spróbuj za chwilę.', 503);
  }
  const tresc = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
  if (!upstream.ok) {
    const m = tresc?.message;
    const komunikat = typeof m === 'string' ? m : Array.isArray(m) ? m.filter((x) => typeof x === 'string').join(', ') : '';
    return blad(komunikat || 'Nie udało się wgrać zdjęcia – spróbuj ponownie.', upstream.status);
  }
  return NextResponse.json(tresc, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
