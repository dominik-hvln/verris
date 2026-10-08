"use server";

import { AdminApiError, adminApi } from "@/lib/api";

/** Wynik `POST /admin/users/:id/diagnostics/dns-tls` — ten sam endpoint co w panelu obsługi (zapis w dzienniku po stronie API). */
export interface WynikDnsTls {
  hostname: string;
  serverLabel: string | null;
  expectedServerIpv4: string | null;
  ipv4MatchesDnsA: boolean | null;
  durationMs: number;
  dns: {
    a: string[];
    aaaa: string[];
    mx: Array<{ priority: number; exchange: string }>;
    ns: string[];
    errors: Partial<Record<"a" | "aaaa" | "mx" | "ns", string>>;
  };
  tls: {
    ok: boolean;
    error?: string;
    subjectCN?: string;
    issuer?: string;
    validFrom?: string;
    validTo?: string;
    authorized?: boolean;
    authorizationError?: string;
  };
}

/** PB-46 — diagnostyka DNS + TLS na karcie klienta admina (wcześniej tylko w panelu obsługi). */
export async function diagnostykaDnsTlsAction(
  userId: string,
  payload: { subscriptionId?: string; domain?: string },
): Promise<{ ok: true; data: WynikDnsTls } | { ok: false; error: string }> {
  try {
    const data = await adminApi<WynikDnsTls>(`/admin/users/${encodeURIComponent(userId)}/diagnostics/dns-tls`, {
      method: "POST",
      body: {
        subscriptionId: payload.subscriptionId?.trim() || undefined,
        domain: payload.domain?.trim() || undefined,
      },
    });
    return { ok: true, data };
  } catch (err) {
    if (err instanceof AdminApiError) return { ok: false, error: err.message };
    return { ok: false, error: "Diagnostyka DNS/TLS nie powiodła się." };
  }
}
