import { adminApi } from "@/lib/api";

export interface AdminSubscriptionRow {
  id: string;
  status: string;
  provisioningStage?: string | null;
  /** SVC-TAG — unikalny handle usługi (= login DA dla hostingu). */
  serviceTag: string | null;
  interval: string;
  priceAmount: unknown;
  /** PB-27 — cena indywidualna (gdy ustawiona, to ją płaci klient). */
  individualPrice?: string | null;
  currency: string;
  createdAt: string;
  plan: { slug: string; name: string };
  user: { email: string; firstName: string | null; lastName: string | null };
  account: {
    id: string;
    daUsername: string;
    domain: string;
    status: string;
    serverId: string | null;
  } | null;
}

/** F2.4 — filtry listy usług (te same nazwy co API; puste pomijane). */
export interface FiltryUslug {
  status?: string;
  serverId?: string;
  planId?: string;
  search?: string;
}

export interface ListaUslug {
  rows: AdminSubscriptionRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** Ile usług w każdym stanie przy pozostałych filtrach (zakładki stanu). */
  liczby: Record<string, number>;
}

export function parametryUslug(f: FiltryUslug, page = 1): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of ["status", "serverId", "planId", "search"] as const) {
    const v = f[k]?.trim();
    if (v) p.set(k, v);
  }
  if (page > 1) p.set("page", String(page));
  return p;
}

export async function listAdminSubscriptions(f: FiltryUslug = {}, page = 1): Promise<ListaUslug> {
  const qs = parametryUslug(f, page).toString();
  return adminApi<ListaUslug>(`/admin/subscriptions${qs ? `?${qs}` : ""}`);
}
