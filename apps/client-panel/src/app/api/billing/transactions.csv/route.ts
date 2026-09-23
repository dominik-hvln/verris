import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:3000";

/** M-28 — pobranie pełnej historii transakcji portfela jako CSV (proxy z tokenem sesji). */
export async function GET() {
  const token = (await cookies()).get("auth_token")?.value;
  if (!token) return new NextResponse("Unauthorized", { status: 401 });

  const upstream = await fetch(`${API_URL}/billing/wallet/transactions.csv`, {
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
