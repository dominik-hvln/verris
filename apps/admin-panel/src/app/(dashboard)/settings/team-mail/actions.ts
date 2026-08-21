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

export interface ControlPlaneMailboxDetail extends ControlPlaneMailboxRow {
  aliases: { id: string; aliasEmail: string }[];
  forwards: {
    id: string;
    forwardTo: string;
    keepCopy: boolean;
    confirmedAt: string | null;
    createdAt: string;
  }[];
}

export interface SystemAddressRow {
  role: string;
  email: string;
  mailboxId: string | null;
}

export async function listTeamMailboxes(): Promise<ControlPlaneMailboxRow[]> {
  return adminApi<ControlPlaneMailboxRow[]>("/admin/mailboxes");
}

export async function listSystemAddresses(): Promise<SystemAddressRow[]> {
  return adminApi<SystemAddressRow[]>("/admin/mailboxes/system-addresses");
}

export async function getTeamMailboxAction(
  mailboxId: string,
): Promise<ControlPlaneMailboxDetail> {
  return adminApi<ControlPlaneMailboxDetail>(`/admin/mailboxes/${mailboxId}`);
}

export async function addTeamMailboxAliasAction(
  mailboxId: string,
  aliasEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await adminApi(`/admin/mailboxes/${mailboxId}/aliases`, {
      method: "POST",
      body: { aliasEmail: aliasEmail.trim().toLowerCase() },
    });
    revalidatePath("/settings/team-mail");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AdminApiError ? e.message : "Nie udało się dodać aliasu.",
    };
  }
}

export async function removeTeamMailboxAliasAction(
  aliasId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await adminApi(`/admin/mailboxes/aliases/${aliasId}`, { method: "DELETE", body: {} });
    revalidatePath("/settings/team-mail");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AdminApiError ? e.message : "Nie udało się usunąć aliasu.",
    };
  }
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

export async function resetTeamMailboxPasswordAction(
  mailboxId: string,
): Promise<{ ok: boolean; error?: string; imapPassword?: string; email?: string }> {
  try {
    const mb = await adminApi<ControlPlaneMailboxRow>(`/admin/mailboxes/${mailboxId}`);
    const res = await adminApi<{ imapPassword: string }>(
      `/admin/mailboxes/${mailboxId}/reset-password`,
      { method: "POST", body: {} },
    );
    revalidatePath("/settings/team-mail");
    return { ok: true, imapPassword: res.imapPassword, email: mb.email };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AdminApiError ? e.message : "Nie udało się zresetować hasła.",
    };
  }
}

export async function addTeamMailboxForwardAction(
  mailboxId: string,
  forwardTo: string,
  keepCopy = true,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const res = await adminApi<{ message: string }>(`/admin/mailboxes/${mailboxId}/forwards`, {
      method: "POST",
      body: { forwardTo: forwardTo.trim().toLowerCase(), keepCopy },
    });
    revalidatePath("/settings/team-mail");
    return { ok: true, message: res.message };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AdminApiError ? e.message : "Nie udało się dodać przekierowania.",
    };
  }
}

export async function removeTeamMailboxForwardAction(
  forwardId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await adminApi(`/admin/mailboxes/forwards/${forwardId}`, { method: "DELETE", body: {} });
    revalidatePath("/settings/team-mail");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AdminApiError ? e.message : "Nie udało się usunąć przekierowania.",
    };
  }
}

export async function importTeamMailboxesCsvAction(
  csv: string,
  dryRun: boolean,
): Promise<{
  ok: boolean;
  error?: string;
  result?: { dryRun: boolean; created: number; rows: Array<{ email: string; action: string; error?: string }> };
}> {
  try {
    const result = await adminApi<{
      dryRun: boolean;
      created: number;
      rows: Array<{ email: string; action: string; error?: string }>;
    }>("/admin/mailboxes/import", {
      method: "POST",
      body: { csv, dryRun },
    });
    revalidatePath("/settings/team-mail");
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AdminApiError ? e.message : "Import nie powiódł się.",
    };
  }
}

export async function updateSystemAddressesAction(
  updates: Partial<Record<string, string>>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await adminApi("/admin/mailboxes/system-addresses", {
      method: "PATCH",
      body: updates,
    });
    revalidatePath("/settings/team-mail");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AdminApiError ? e.message : "Nie udało się zapisać adresów.",
    };
  }
}

export async function syncPostfixMapsAction(): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const res = await adminApi<{
      write: { ok: boolean; message?: string };
      postmapRequired?: boolean;
      pendingForwards?: number;
      hint?: string;
    }>("/admin/mailboxes/sync-postfix", { method: "POST", body: {} });
    revalidatePath("/settings/team-mail");
    const parts: string[] = [];
    if (res.write?.ok) parts.push("Pliki map zapisane.");
    if (res.postmapRequired) {
      parts.push("Na serwerze: ./ops/scripts/prod-mail-postmap-reload.sh (lub systemd verris-postfix-maps).");
    }
    if (res.pendingForwards && res.pendingForwards > 0) {
      parts.push(`${res.pendingForwards} forward(ów) czeka na potwierdzenie linkiem.`);
    }
    if (res.hint && !res.write?.ok) parts.push(res.hint);
    return {
      ok: res.write?.ok ?? true,
      message: parts.length > 0 ? parts.join(" ") : res.write?.message,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof AdminApiError ? e.message : "Synchronizacja nie powiodła się.",
    };
  }
}
