import { staffApi } from "./staff-api";

/** Odpowiedź `GET /admin/subscriptions/:id` (read-only dla STAFF). */
export interface StaffAdminSubscriptionDetail {
  id: string;
  status: string;
  serviceTag: string | null;
  interval: string;
  paymentSource: string;
  priceAmount: unknown;
  currency: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
  autoscalingEnabled: boolean;
  plan: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    stripePriceId: string | null;
  };
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
  account: null | {
    id: string;
    domain: string;
    daUsername: string;
    status: string;
    serverId: string | null;
    server: null | { id: string; name: string | null; region: string | null; hostname: string | null };
  };
  events: Array<{
    id: string;
    type: string;
    details: unknown;
    createdAt: string;
  }>;
}

export async function staffGetAdminSubscription(id: string): Promise<StaffAdminSubscriptionDetail> {
  return staffApi<StaffAdminSubscriptionDetail>(`/admin/subscriptions/${id}`);
}
