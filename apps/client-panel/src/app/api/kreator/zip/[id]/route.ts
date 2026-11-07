import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const tekst = (t: string, status: number) =>
  new NextResponse(t, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/**
 * „Pobierz ZIP” w edytorze kreatora – proxy GET /kreator/strony/:id/zip z tokenem sesji (wzorzec faktur PDF).
 * Komunikat odmowy z API (np. 403 w okresie próbnym) przechodzi do klienta po polsku; 404 = API jeszcze bez ZIP.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return tekst('Nie znaleziono strony.', 400);
  const token = (await cookies()).get('auth_token')?.value;
  if (!token) return tekst('Zaloguj się ponownie.', 401);

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/kreator/strony/${id}/zip`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return tekst('Nie udało się przygotować pliku ZIP – spróbuj za chwilę.', 503);
  }
  if (upstream.status === 404) return tekst('Pobieranie ZIP będzie dostępne wkrótce.', 404);
  if (!upstream.ok || !upstream.body) {
    const tresc = await upstream.json().catch(() => null) as { message?: unknown } | null;
    const komunikat = typeof tresc?.message === 'string' ? tresc.message : 'Nie udało się przygotować pliku ZIP.';
    return tekst(komunikat, upstream.status);
  }
  const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  for (const h of ['content-disposition', 'content-type', 'content-length']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has('content-disposition')) headers.set('content-disposition', 'attachment; filename="strona.zip"');
  return new NextResponse(upstream.body, { status: 200, headers });
}
