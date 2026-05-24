"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export interface ControlPlaneMailboxRow {
  id: string;
  email: string;
  kind: string;
  status: string;
  displayName: string | null;
  quotaMb: number;
  user: { id: string; email: string; firstName: string | null; lastName: string | null; role: string } | null;
  _count: { aliases: number; forwards: number };
}

export async function listTeamMailboxes(): Promise<ControlPlaneMailboxRow[]> {
  return adminApi<ControlPlaneMailboxRow[]>("/admin/mailboxes");
}

export async function createTeamMailboxAction(input: {
  localPart: string;
  kind: "STAFF" | "SYSTEM";
  displayName?: string;
  userId?: string;
}): Promise<{ ok: boolean; error?: string; imapPassword?: string; email?: string }> {
  try {
    const res = await adminApi<{ mailbox: ControlPlaneMailboxRow; imapPassword?: string }>(
      "/admin/mailboxes",
      {
        method: "POST",
        body: {
          localPart: input.localPart.trim().toLowerCase(),
          kind: input.kind,
          displayName: input.displayName?.trim() || undefined,
          userId: input.userId || undefined,
          syncUserEmail: true,
        },
      },
    );
    revalidatePath("/settings/team-mail");
    return {
      ok: true,
      imapPassword: res.imapPassword,
      email: res.mailbox.email,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AdminApiError ? e.message : "Nie udało się utworzyć skrzynki.",
    };
  }
}

export async function syncPostfixMapsAction(): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const res = await adminApi<{ write: { ok: boolean; message?: string } }>(
      "/admin/mailboxes/sync-postfix",
      { method: "POST", body: {} },
    );
    revalidatePath("/settings/team-mail");
    return {
      ok: res.write?.ok ?? true,
      message: res.write?.message,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AdminApiError ? e.message : "Synchronizacja nie powiodła się.",
    };
  }
}
