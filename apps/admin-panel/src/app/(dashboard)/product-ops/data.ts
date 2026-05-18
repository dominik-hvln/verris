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

export async function getProductOpsDashboard() {
  const [preflight, flags, announcements, maintenance] = await Promise.all([
    adminApi<PreflightResponse>("/admin/product-ops/preflight"),
    adminApi<FeatureFlagRow[]>("/admin/product-ops/feature-flags"),
    adminApi<ProductAnnouncementRow[]>("/admin/product-ops/announcements"),
    adminApi<MaintenanceWindowRow[]>("/admin/product-ops/maintenance-windows"),
  ]);
  return { preflight, flags, announcements, maintenance };
}
