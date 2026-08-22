"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

/**
 * Z-05 — ponowne przetworzenie zdarzenia webhooka.
 *
 * Bezpieczne z definicji: księgowanie portfela jest idempotentne po kluczu
 * sesji Stripe'a, więc powtórzenie nie doda pieniędzy drugi raz. Powtórzyć
 * mogą się natomiast maile — świadomy wybór, dwa maile są tańsze niż
 * nieksięgowana wpłata.
 */
export async function replayWebhookEvent(
  eventId: string,
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  try {
    const r = await adminApi<{ eventId: string; status: string }>(
      `/admin/billing/webhooki/${encodeURIComponent(eventId)}/ponow`,
      { method: "POST" },
    );
    revalidatePath("/billing/webhooki");
    return { ok: true, status: r.status };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof AdminApiError
          ? err.message
          : "Nie udało się ponowić zdarzenia.",
    };
  }
}
