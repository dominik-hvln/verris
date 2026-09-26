"use server";

import { adminApi } from "./api";

export interface AdminNotification {
  id: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export async function listNotifications(): Promise<{
  items: AdminNotification[];
  unread: number;
}> {
  try {
    return await adminApi<{ items: AdminNotification[]; unread: number }>("/notifications?limit=20");
  } catch {
    return { items: [], unread: 0 };
  }
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  try {
    return await adminApi<{ updated: number }>("/notifications/read-all", { method: "POST" });
  } catch {
    return { updated: 0 };
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await adminApi(`/notifications/${id}/read`, { method: "POST" });
  } catch {
    /* best-effort */
  }
}
