"use server";

import { adminApi } from "@/lib/api";

export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "CANCELED";

export type MarketingSegment =
  | "NEWSLETTER_OPT_IN"
  | "PRODUCT_UPDATES_OPT_IN"
  | "ALL_ACTIVE_USERS";

export interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  bodyMarkdown: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  segment: MarketingSegment;
  status: CampaignStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  recipientCount: number;
  sentCount: number;
  suppressedCount: number;
  failedCount: number;
  createdAt: string;
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  return adminApi<CampaignRow[]>(`/admin/marketing/campaigns`);
}

export async function estimateSegment(
  segment: MarketingSegment,
): Promise<{ segment: MarketingSegment; count: number }> {
  return adminApi(`/admin/marketing/campaigns/segments/${segment}/count`);
}
