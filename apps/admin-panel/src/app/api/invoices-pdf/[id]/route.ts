import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { getAdminAuthToken } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = await getAdminAuthToken();
  if (!token) {
    return NextResponse.json({ error: "Brak sesji administratora." }, { status: 401 });
  }
  const res = await fetch(`${API_URL}/admin/invoices/${encodeURIComponent(id)}/pdf`, {
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
      "Content-Disposition": res.headers.get("content-disposition") ?? `attachment; filename="invoice-${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
