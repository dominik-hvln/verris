import { NextResponse, type NextRequest } from 'next/server';
import { celGet, MAKS_CIALA_WGRANIA } from './cel';

export const dynamic = 'force-dynamic';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const json = (message: string, status: number) => NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
const tekst = (t: string, status: number) =>
  new NextResponse(t, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

async function komunikatUpstream(r: Response, domyslny: string): Promise<string> {
  const tresc = (await r.json().catch(() => null)) as { message?: unknown } | null;
  const m = tresc?.message;
  if (typeof m === 'string' && m) return m;
  if (m && typeof m === 'object' && typeof (m as { message?: unknown }).message === 'string') return (m as { message: string }).message;
  return domyslny;
}

/**
 * Paczka 131 – pliki Kreatora marki z tokenem sesji (przeglądarka nie zna tokenu; wzorzec tras ZIP kreatora stron
 * i faktur PDF): pobieranie plików i ZIP, podglądy materiałów i logo (SVG/PNG do <img>), krzywe napisu do podglądu
 * na żywo, pliki krojów z fonts-proxy (CSP panelu: font-src 'self') i wgrywanie logo (POST multipart, strumieniem).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ sciezka: string[] }> }): Promise<NextResponse> {
  const { sciezka } = await context.params;
  const cel = celGet(sciezka ?? [], request.nextUrl.searchParams);
  if (!cel) return tekst('Nie znaleziono.', 404);
  const token = request.cookies.get('auth_token')?.value;
  if (!token && !cel.trasa.publiczna) return cel.trasa.typ === 'json' ? json('Zaloguj się ponownie.', 401) : tekst('Zaloguj się ponownie.', 401);

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}${cel.url}`, {
      headers: cel.trasa.publiczna ? {} : { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(cel.trasa.pobranie ? 120_000 : 30_000),
    });
  } catch {
    const m = 'Nie udało się pobrać pliku – spróbuj za chwilę.';
    return cel.trasa.typ === 'json' ? json(m, 503) : tekst(m, 503);
  }
  if (!upstream.ok || !upstream.body) {
    const m = await komunikatUpstream(upstream, 'Nie udało się pobrać pliku.');
    return cel.trasa.typ === 'json' ? json(m, upstream.status) : tekst(m, upstream.status);
  }
  const headers = new Headers({ 'X-Content-Type-Options': 'nosniff' });
  for (const h of ['content-type', 'content-length', 'content-disposition', 'etag']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  // SVG otwarty bezpośrednio w karcie: bez skryptów i zewnętrznych zasobów (obrona w głąb – API i tak sanityzuje).
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:");
  if (cel.trasa.publiczna) headers.set('Cache-Control', 'public, max-age=2592000, immutable');
  else if (cel.trasa.pobranie) headers.set('Cache-Control', 'no-store');
  else headers.set('Cache-Control', 'private, max-age=86400');
  if (cel.trasa.pobranie && !headers.has('content-disposition')) {
    const nazwa = sciezka[sciezka.length - 1]!.replace(/[^a-z0-9._-]/gi, '');
    headers.set('content-disposition', `attachment; filename="${nazwa}"`);
  }
  return new NextResponse(upstream.body, { status: 200, headers });
}

/**
 * Wgranie logo (ścieżki „Mam logo – Key Visual” i „Odśwież logo”): proxy POST multipart → API /kreator-marki/wgraj.
 * Trasa, nie akcja serwera: przeglądarka pokazuje postęp (XMLHttpRequest), a ciało idzie strumieniem do API.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ sciezka: string[] }> }): Promise<NextResponse> {
  const { sciezka } = await context.params;
  if ((sciezka ?? []).join('/') !== 'wgraj') return json('Nie znaleziono.', 404);
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return json('Zaloguj się ponownie.', 401);
  const skad = request.headers.get('sec-fetch-site');
  if (skad && skad !== 'same-origin') return json('Logo wgrywa się z Kreatora marki w panelu.', 403);
  const typ = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data;\s*boundary=/i.test(typ)) return json('Nieprawidłowe żądanie wgrania logo.', 400);
  const dlugosc = Number(request.headers.get('content-length') ?? 'NaN');
  if (!Number.isFinite(dlugosc)) return json('Nieprawidłowe żądanie wgrania logo.', 411);
  if (dlugosc > MAKS_CIALA_WGRANIA) return json('Plik jest za duży.', 413);
  if (!request.body) return json('Wybierz plik z logo.', 400);

  const naglowki: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': typ, 'Content-Length': String(dlugosc) };
  const xff = request.headers.get('x-forwarded-for');
  if (xff) naglowki['x-forwarded-for'] = xff;
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/kreator-marki/wgraj`, {
      method: 'POST',
      headers: naglowki,
      body: request.body,
      duplex: 'half',
      cache: 'no-store',
      // analiza logo (wektoryzacja + AI z wizją) trwa dłużej niż zwykłe wgranie
      signal: AbortSignal.timeout(240_000),
    } as RequestInit & { duplex: 'half' });
  } catch {
    return json('Nie udało się wgrać logo – spróbuj za chwilę.', 503);
  }
  const tresc = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
  if (!upstream.ok) {
    const m = tresc?.message;
    const wewn = m && typeof m === 'object' ? (m as Record<string, unknown>) : null;
    const komunikat = typeof m === 'string' ? m : typeof wewn?.message === 'string' ? wewn.message : Array.isArray(m) ? m.filter((x) => typeof x === 'string').join(', ') : '';
    const kod = tresc?.kod ?? wewn?.kod;
    return NextResponse.json(
      { message: komunikat || 'Nie udało się wgrać logo – spróbuj ponownie.', ...(typeof kod === 'string' ? { kod } : {}) },
      { status: upstream.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.json(tresc, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
