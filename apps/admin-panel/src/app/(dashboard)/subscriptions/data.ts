import { adminApi } from "@/lib/api";

export interface AdminSubscriptionRow {
  id: string;
  status: string;
  /** SVC-TAG — unikalny handle usługi (= login DA dla hostingu). */
  serviceTag: string | null;
  interval: string;
  priceAmount: unknown;
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

export async function listAdminSubscriptions(): Promise<AdminSubscriptionRow[]> {
  return adminApi<AdminSubscriptionRow[]>("/admin/subscriptions");
}
