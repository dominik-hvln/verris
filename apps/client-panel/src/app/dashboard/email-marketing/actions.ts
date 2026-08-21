'use server';

import { apiFetch, ApiError } from '@/lib/api';

export type EmmOverview = {
  subscriptionId: string;
  limits: { maxContacts: number | null; monthlySends: number | null };
  usage: { contacts: number; sentThisMonth: number };
  lists: number;
  campaigns: number;
};
export type EmmList = {
  id: string;
  name: string;
  description: string | null;
  doubleOptIn: boolean;
  fromName: string | null;
  replyTo: string | null;
  subscribed: number;
  pending: number;
  unsubscribed: number;
  createdAt: string;
};
export type EmmContact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  source: string | null;
  createdAt: string;
};
export type EmmCampaign = {
  id: string;
  name: string;
  subject: string;
  bodyMarkdown: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  listId: string;
  listName: string | null;
  status: string;
  scheduledAt: string | null;
  recipientCount: number;
  sentCount: number;
  suppressedCount: number;
  failedCount: number;
  createdAt: string;
};

type Res<T> = { ok: true; data: T } | { ok: false; error: string };
function err(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Wystąpił błąd.';
}
async function call<T>(path: string, init?: RequestInit): Promise<Res<T>> {
  try {
    const data = await apiFetch<T>(path, init);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

const base = (sub: string) => `/email-marketing/${sub}`;

export async function fetchOverview(sub: string) {
  return call<EmmOverview>(`${base(sub)}/overview`);
}
export async function fetchLists(sub: string) {
  return call<EmmList[]>(`${base(sub)}/lists`);
}
export async function createList(
  sub: string,
  input: { name: string; description?: string; doubleOptIn?: boolean; fromName?: string; replyTo?: string },
) {
  return call<EmmList>(`${base(sub)}/lists`, { method: 'POST', body: JSON.stringify(input) });
}
export async function deleteList(sub: string, listId: string) {
  return call<{ ok: true }>(`${base(sub)}/lists/${listId}`, { method: 'DELETE' });
}
export async function fetchContacts(sub: string, listId: string) {
  return call<EmmContact[]>(`${base(sub)}/lists/${listId}/contacts`);
}
export async function addContact(
  sub: string,
  listId: string,
  input: { email: string; firstName?: string; lastName?: string },
) {
  return call<EmmContact>(`${base(sub)}/lists/${listId}/contacts`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
export async function importContacts(
  sub: string,
  listId: string,
  rows: Array<{ email: string; firstName?: string; lastName?: string }>,
  consentConfirmed: boolean,
) {
  return call<{ added: number; skipped: number; total: number }>(
    `${base(sub)}/lists/${listId}/contacts/import`,
    { method: 'POST', body: JSON.stringify({ rows, consentConfirmed }) },
  );
}
export async function deleteContact(sub: string, listId: string, contactId: string) {
  return call<{ ok: true }>(`${base(sub)}/lists/${listId}/contacts/${contactId}`, { method: 'DELETE' });
}
export async function fetchCampaigns(sub: string) {
  return call<EmmCampaign[]>(`${base(sub)}/campaigns`);
}
export async function createCampaign(
  sub: string,
  input: { name: string; subject: string; bodyMarkdown: string; listId: string; ctaLabel?: string; ctaUrl?: string },
) {
  return call<EmmCampaign>(`${base(sub)}/campaigns`, { method: 'POST', body: JSON.stringify(input) });
}
export async function sendCampaign(sub: string, campaignId: string) {
  return call<EmmCampaign>(`${base(sub)}/campaigns/${campaignId}/send`, { method: 'POST' });
}
export async function deleteCampaign(sub: string, campaignId: string) {
  return call<{ ok: true }>(`${base(sub)}/campaigns/${campaignId}`, { method: 'DELETE' });
}
