import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { getAdminAuthToken } from "@/lib/auth";

/** K4 — PDF proformy (GET admin/rozliczenia/proformy/:id/pdf, BILLING_VIEW). Jak /api/invoices-pdf/[id]: sesja admina, tylko UUID. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Nieprawidłowy identyfikator proformy." }, { status: 400 });
  }
  const token = await getAdminAuthToken();
  if (!token) {
    return NextResponse.json({ error: "Brak sesji administratora." }, { status: 401 });
  }
  const res = await fetch(`${API_URL}/admin/rozliczenia/proformy/${encodeURIComponent(id)}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return new NextResponse(body || `PDF nieudany: ${res.status}`, {
      status: res.status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": res.headers.get("content-disposition") ?? `attachment; filename="proforma-${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
