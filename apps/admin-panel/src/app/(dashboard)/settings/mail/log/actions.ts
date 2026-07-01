'use server';

import { adminApi } from '@/lib/api';

export type EmailLogItem = {
  id: string;
  toEmail: string;
  userId: string | null;
  category: string;
  tag: string | null;
  subject: string;
  status: string;
  providerId: string | null;
  messageId: string | null;
  errorMessage: string | null;
  campaignId: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type EmailLogPage = {
  items: EmailLogItem[];
  nextCursor: string | null;
  stats: {
    total: number;
    sent: number;
    failed: number;
    suppressed: number;
    queued: number;
    bounced: number;
  };
};

export type EmailLogQuery = {
  status?: string;
  q?: string;
  toEmail?: string;
  cursor?: string;
  limit?: number;
};

export async function fetchEmailLog(query: EmailLogQuery = {}): Promise<EmailLogPage> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.q) params.set('q', query.q);
  if (query.toEmail) params.set('to', query.toEmail);
  if (query.cursor) params.set('cursor', query.cursor);
  params.set('limit', String(query.limit ?? 50));
  const qs = params.toString();
  return adminApi<EmailLogPage>(`/admin/email-log${qs ? `?${qs}` : ''}`);
}
