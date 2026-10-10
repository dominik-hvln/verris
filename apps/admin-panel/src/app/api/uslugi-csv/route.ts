import type { NextRequest } from "next/server";
import { FILTRY_USLUG, proxyCsv } from "@/lib/proxy-csv";

/** F2.4 — eksport listy usług (GET /admin/subscriptions/export.csv; EXPORT_DATA, wpis w dzienniku). */
export async function GET(req: NextRequest) {
  return proxyCsv(req.nextUrl.searchParams, "/admin/subscriptions/export.csv", FILTRY_USLUG, "verris-uslugi");
}
