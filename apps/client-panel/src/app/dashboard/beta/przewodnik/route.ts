import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { fetchSessionProfileState } from "@/lib/session-profile";

export const dynamic = "force-dynamic";

/**
 * Plik przewodnika poza `public/` — inaczej byłby do pobrania bez logowania. W obrazie Dockera trafia do
 * `.next/standalone/apps/client-panel/assets/…` przez `outputFileTracingIncludes` w next.config.ts (klucz = ta trasa),
 * a `server.js` ze standalone robi `process.chdir(__dirname)`, więc ścieżka od `process.cwd()` działa tak samo jak w dev.
 */
const PLIK_PRZEWODNIKA = path.join("assets", "beta", "Verris-przewodnik-testera.pdf");

/**
 * Decyzja 06.11 — przewodnik testera (PDF) tylko dla zalogowanych: link z maila z zaproszeniem, z kafelka na pulpicie
 * i ze strony Testy (beta). Middleware i tak przekierowuje /dashboard bez sesji do logowania; tu sprawdzamy sesję
 * w API jeszcze raz, bo sama obecność ciasteczka niczego nie dowodzi.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  if (!token) return new NextResponse("Zaloguj się ponownie.", { status: 401 });
  const { profile, unauthorized } = await fetchSessionProfileState(token, request.headers.get("x-forwarded-for"));
  if (unauthorized) return new NextResponse("Zaloguj się ponownie.", { status: 401 });
  if (!profile) {
    return new NextResponse("Panel chwilowo niedostępny – spróbuj za chwilę.", { status: 503, headers: { "Retry-After": "15" } });
  }

  const pdf = await readFile(path.join(process.cwd(), PLIK_PRZEWODNIKA));
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="Verris-przewodnik-testera.pdf"',
      "Content-Length": String(pdf.byteLength),
      "Cache-Control": "private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
