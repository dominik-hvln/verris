import type { NextRequest } from "next/server";
import { FILTRY_KLIENTOW, proxyCsv } from "@/lib/proxy-csv";

/** F2.4 — eksport listy klientów (GET /admin/users/export.csv; EXPORT_DATA, wpis w dzienniku). */
export async function GET(req: NextRequest) {
  return proxyCsv(req.nextUrl.searchParams, "/admin/users/export.csv", FILTRY_KLIENTOW, "verris-klienci");
}
