'use server';

import { apiFetch } from '@/lib/api';

export interface NotificationItem {
  id: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unread: number;
}

export async function fetchNotificationsAction(): Promise<NotificationsResponse> {
  try {
    return await apiFetch<NotificationsResponse>('/notifications?limit=20');
  } catch {
    return { items: [], unread: 0 };
  }
}

export async function markNotificationReadAction(id: string): Promise<void> {
  try {
    await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
  } catch {
    /* best-effort */
  }
}

export async function markAllNotificationsReadAction(): Promise<void> {
  try {
    await apiFetch('/notifications/read-all', { method: 'POST' });
  } catch {
    /* best-effort */
  }
}
