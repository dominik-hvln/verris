import { adminApi } from "@/lib/api";

/** Z-05 — zdarzenia webhooka Stripe'a widziane z panelu admina. */
export interface WebhookEventRow {
  eventId: string;
  type: string;
  status: "PENDING" | "PROCESSED" | "FAILED";
  attempts: number;
  lastError: string | null;
  claimedAt: string | null;
  nextAttemptAt: string | null;
  processedAt: string | null;
  alertedAt: string | null;
  payloadPurgedAt: string | null;
  createdAt: string;
  mozliwePonowienie: boolean;
  zaciete: boolean;
}

export interface WebhookEventsResponse {
  zdarzenia: WebhookEventRow[];
  podsumowanie: { pending: number; failed: number; processed: number };
  progAlertu: number;
}

export async function listWebhookEvents(status?: string): Promise<WebhookEventsResponse> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return adminApi<WebhookEventsResponse>(`/admin/billing/webhooki${q}`);
}
