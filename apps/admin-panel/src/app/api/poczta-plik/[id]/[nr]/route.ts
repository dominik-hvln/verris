import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { getAdminAuthToken } from "@/lib/auth";

/**
 * F3.7 — „Pokaż” plik z maila od nieznanego nadawcy: proxy do GET /admin/poczta-zgloszen/:id/pliki/:nr (TICKETS_VIEW).
 * API wydaje plik tylko z potwierdzam=1 (panel dokleja je dopiero po potwierdzeniu w oknie) — zawsze jako pobranie,
 * z nosniff, żeby przeglądarka niczego nie otwierała w kontekście panelu.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; nr: string }> }) {
  const { id, nr } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{1,3}$/.test(nr)) {
    return NextResponse.json({ error: "Nieprawidłowy identyfikator pliku." }, { status: 400 });
  }
  const token = await getAdminAuthToken();
  if (!token) return NextResponse.json({ error: "Brak sesji operatora." }, { status: 401 });
  const potwierdzam = req.nextUrl.searchParams.get("potwierdzam") === "1" ? "?potwierdzam=1" : "";
  const res = await fetch(`${API_URL}/admin/poczta-zgloszen/${encodeURIComponent(id)}/pliki/${nr}${potwierdzam}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return new NextResponse(body || `Plik niedostępny: ${res.status}`, { status: res.status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new NextResponse(await res.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": res.headers.get("content-disposition") ?? "attachment",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
