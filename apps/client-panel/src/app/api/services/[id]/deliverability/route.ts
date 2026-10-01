import { NextResponse } from "next/server";
import { apiFetch, ApiError } from "@/lib/api";

/**
 * Odczyt przez route handler, nie server action: akcje serwera Next wykonują się
 * po kolei, więc wolna sonda (DNS, martwy węzeł) blokowała całą stronę usługi.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "Bad request" }, { status: 400 });
  try {
    const domena = new URL(req.url).searchParams.get("domain");
    if (domena && !/^[a-z0-9.-]{3,253}$/i.test(domena)) return NextResponse.json({ message: "Bad request" }, { status: 400 });
    const q = domena ? `?domain=${encodeURIComponent(domena)}` : "";
    return NextResponse.json(await apiFetch(`/services/${id}/deliverability${q}`));
  } catch (e) {
    const status = e instanceof ApiError && e.status >= 400 ? e.status : 502;
    return NextResponse.json({ message: e instanceof Error ? e.message : "Błąd" }, { status });
  }
}
