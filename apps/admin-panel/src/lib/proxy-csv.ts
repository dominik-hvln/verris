import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api";
import { getAdminAuthToken } from "@/lib/auth";

/**
 * F2.4 — pobranie CSV z API z tokenem operatora (przeglądarka go nie ma). Przekazuje tylko filtry z białej listy;
 * odmowę API (403 bez EXPORT_DATA, 400 za dużo wierszy) zwraca jako tekst z tym samym kodem.
 */
export async function proxyCsv(params: URLSearchParams, sciezkaApi: string, dozwolone: readonly string[], plik: string): Promise<NextResponse> {
  const token = await getAdminAuthToken();
  if (!token) return NextResponse.json({ error: "Brak sesji operatora." }, { status: 401 });
  const filtry = new URLSearchParams();
  for (const k of dozwolone) {
    const v = params.get(k)?.trim();
    if (v) filtry.set(k, v);
  }
  const qs = filtry.toString();
  const res = await fetch(`${API_URL}${sciezkaApi}${qs ? `?${qs}` : ""}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) {
    const tresc = await res.text().catch(() => "");
    let komunikat = tresc;
    try {
      const m = (JSON.parse(tresc) as { message?: string | string[] }).message;
      if (m) komunikat = Array.isArray(m) ? m.join(", ") : m;
    } catch {
      // nie JSON — zostaje tekst
    }
    return new NextResponse(komunikat || `Eksport CSV nieudany: ${res.status}`, { status: res.status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new NextResponse(await res.text(), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${plik}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

export const FILTRY_USLUG = ["status", "serverId", "planId", "search"] as const;
export const FILTRY_KLIENTOW = ["search", "status", "saldoOd", "saldoDo", "od", "do"] as const;
