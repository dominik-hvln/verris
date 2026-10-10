import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { getAdminAuthToken } from "@/lib/auth";

/**
 * Fala 1B — „Pobierz UPO” na stronie faktury: proxy do GET /admin/ksef/invoices/:id/upo (tylko ADMIN; UPO istnieje
 * tylko dla faktury przyjętej przez KSeF). Jak /api/invoices-pdf/[id]: sesja admina, tylko UUID, bez cache.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Nieprawidłowy identyfikator faktury." }, { status: 400 });
  }
  const token = await getAdminAuthToken();
  if (!token) {
    return NextResponse.json({ error: "Brak sesji administratora." }, { status: 401 });
  }
  const res = await fetch(`${API_URL}/admin/ksef/invoices/${encodeURIComponent(id)}/upo`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return new NextResponse(body || `UPO niedostępne: ${res.status}`, {
      status: res.status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new NextResponse(await res.text(), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="UPO-${id}.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
