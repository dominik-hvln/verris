import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:3000";

/**
 * A2-06 (paczka 109) — egzemplarz umowy powierzenia (DPA) z danymi stron: PDF z `GET /me/dpa.pdf` przez sesję panelu
 * (token w ciasteczku httpOnly, więc przeglądarka nie pobierze go z API sama). API sprawdza akceptację aktualnej
 * wersji i zwraca błąd z opisem, gdy jej nie ma.
 */
export async function GET() {
  const token = (await cookies()).get("auth_token")?.value;
  if (!token) return new NextResponse("Zaloguj się ponownie.", { status: 401 });

  const upstream = await fetch(`${API_URL}/me/dpa.pdf`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    return new NextResponse(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "text/plain" } });
  }
  const headers = new Headers({ "cache-control": "no-store" });
  for (const h of ["content-disposition", "content-type", "content-length"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(upstream.body, { status: 200, headers });
}
