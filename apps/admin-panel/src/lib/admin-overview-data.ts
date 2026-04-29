import { adminApi } from "./api";

/** Odpowiedź `GET /admin/dashboard/overview`. */
export type AdminDashboardOverview = {
  generatedAt: string;
  users: { total: number; clients: number; staffAndAdmin: number };
  subscriptions: { byStatus: Record<string, number>; active: number };
  servers: { total: number; active: number; byStatus: Record<string, number> };
  accounts: { total: number };
  tickets: { openNonClosed: number };
  billing: {
    periodDays: number;
    walletNetPln: string;
    walletByTypePln: Record<string, string>;
  };
  serverRows: Array<{
    id: string;
    name: string;
    ipAddress: string;
    region: string | null;
    status: string;
    lastHeartbeatAt: string | null;
    allocatedCpu: number;
    totalCpuCores: number | null;
  }>;
  recentSubscriptions: Array<{
    id: string;
    status: string;
    createdAt: string;
    priceAmount: unknown;
    currency: string;
    interval: string;
    plan: { name: string; slug: string };
    user: { email: string; firstName: string | null; lastName: string | null };
  }>;
};

export async function fetchAdminDashboardOverview(): Promise<AdminDashboardOverview> {
  return adminApi<AdminDashboardOverview>("/admin/dashboard/overview");
}
