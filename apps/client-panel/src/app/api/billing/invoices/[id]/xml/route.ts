import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:3000";

/**
 * KSeF 12.10 — plik XML FA(3) faktury wysłany do KSeF — proxy z tokenem sesji.
 * Własność faktury sprawdza API (szuka po id i właścicielu); tu tylko kształt id i sesja.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Bad request", { status: 400 });
  const token = (await cookies()).get("auth_token")?.value;
  if (!token) return new NextResponse("Unauthorized", { status: 401 });

  const upstream = await fetch(`${API_URL}/billing/invoices/${id}/xml`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    return new NextResponse(upstream.body, { status: upstream.status });
  }
  const headers = new Headers({ "cache-control": "no-store" });
  for (const h of ["content-disposition", "content-type", "content-length"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(upstream.body, { status: 200, headers });
}
