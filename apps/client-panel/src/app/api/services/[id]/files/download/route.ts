import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:3000";

/**
 * H-13 — pobranie dużego pliku z konta (np. archiwum kopii) strumieniem: przeglądarka dostaje
 * bajty wprost z API, bez base64 w akcji serwera i bez limitu 100 MB menedżera plików.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !path || path.length > 1024 || path.includes("\0")) {
    return new NextResponse("Bad request", { status: 400 });
  }
  const token = (await cookies()).get("auth_token")?.value;
  if (!token) return new NextResponse("Unauthorized", { status: 401 });

  const upstream = await fetch(`${API_URL}/services/${id}/files/download-stream?path=${encodeURIComponent(path)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    const tekst = await upstream.text().catch(() => "");
    let komunikat = "Nie udało się pobrać pliku.";
    try {
      komunikat = (JSON.parse(tekst) as { message?: string }).message ?? komunikat;
    } catch {
      /* odpowiedź nie-JSON — zostaje komunikat ogólny */
    }
    return new NextResponse(komunikat, { status: upstream.status || 502, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const headers = new Headers();
  for (const h of ["content-disposition", "content-type", "content-length"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(upstream.body, { status: 200, headers });
}
