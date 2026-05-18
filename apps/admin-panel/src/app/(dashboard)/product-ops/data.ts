import { adminApi } from "@/lib/api";

export interface PreflightResponse {
  goLiveReady: boolean;
  blockers: string[];
  metrics: Record<string, number>;
}

export interface FeatureFlagRow {
  id: string;
  key: string;
  name: string;
  enabledDefault: boolean;
  rolloutPercent: number;
  createdAt: string;
}

export interface ProductAnnouncementRow {
  id: string;
  kind: string;
  status: string;
  title: string;
  publishedAt: string | null;
  createdAt: string;
}

export interface MaintenanceWindowRow {
  id: string;
  title: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  server: { id: string; name: string | null; hostname: string | null } | null;
}

export interface StatusWebhookEndpointRow {
  id: string;
  url: string;
  isActive: boolean;
  events: string[];
  createdAt: string;
  _count: { deliveries: number };
}

export interface StatusWebhookDeliveryRow {
  id: string;
  event: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
  endpoint: { id: string; url: string };
}

export interface CapacityRow {
  id: string;
  name: string;
  hostname: string;
  status: string;
  activeAccounts: number;
  cpuCommitted: number;
  ramCommittedMb: number;
  latestDiskUsageMb: number;
  risk: "low" | "medium" | "high";
}

export interface AnomalyBoardResponse {
  openIncidents: Array<{ id: string; title: string; severity: string; startedAt: string }>;
  failedMigrations: Array<{ id: string; targetDomain: string | null; lastError: string | null; updatedAt: string }>;
  failedProvisioning: Array<{ id: string; provisioningLastError: string | null; user: { email: string } }>;
  usageSpikes: Array<{ id: string; subscriptionId: string | null; cpuUsageMax: number; ioUsageKbps: number; bucketStart: string }>;
}

export async function getProductOpsDashboard() {
  const [preflight, flags, announcements, maintenance, webhooks, deliveries, capacity, anomalies] = await Promise.all([
    adminApi<PreflightResponse>("/admin/product-ops/preflight"),
    adminApi<FeatureFlagRow[]>("/admin/product-ops/feature-flags"),
    adminApi<ProductAnnouncementRow[]>("/admin/product-ops/announcements"),
    adminApi<MaintenanceWindowRow[]>("/admin/product-ops/maintenance-windows"),
    adminApi<StatusWebhookEndpointRow[]>("/admin/product-ops/status-webhooks"),
    adminApi<StatusWebhookDeliveryRow[]>("/admin/product-ops/status-webhook-deliveries"),
    adminApi<CapacityRow[]>("/admin/product-ops/capacity"),
    adminApi<AnomalyBoardResponse>("/admin/product-ops/anomalies"),
  ]);
  return { preflight, flags, announcements, maintenance, webhooks, deliveries, capacity, anomalies };
}
