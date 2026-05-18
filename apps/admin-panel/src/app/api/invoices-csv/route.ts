import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { getAdminAuthToken } from "@/lib/auth";

/**
 * Server-side proxy dla `GET /admin/invoices/export.csv`.
 * Browser nie ma dostępu do tokena admin-panelu — używamy go po stronie Node.
 */
export async function GET(req: NextRequest) {
  const token = await getAdminAuthToken();
  if (!token) {
    return NextResponse.json({ error: "Brak sesji administratora." }, { status: 401 });
  }
  const params = req.nextUrl.searchParams;
  const upstreamUrl = `${API_URL}/admin/invoices/export.csv?${params.toString()}`;
  const res = await fetch(upstreamUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return new NextResponse(body || `Eksport CSV nieudany: ${res.status}`, {
      status: res.status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const csv = await res.text();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="verris-faktury-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
