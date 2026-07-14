"use server";

import { staffApi } from "./staff-api";

export interface StaffNotification {
  id: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export async function staffListNotifications(): Promise<{
  items: StaffNotification[];
  unread: number;
}> {
  try {
    return await staffApi<{ items: StaffNotification[]; unread: number }>("/notifications?limit=20");
  } catch {
    return { items: [], unread: 0 };
  }
}

export async function staffMarkAllNotificationsRead(): Promise<{ updated: number }> {
  try {
    return await staffApi<{ updated: number }>("/notifications/read-all", { method: "POST" });
  } catch {
    return { updated: 0 };
  }
}

export async function staffMarkNotificationRead(id: string): Promise<void> {
  try {
    await staffApi(`/notifications/${id}/read`, { method: "POST" });
  } catch {
    /* best-effort */
  }
}
