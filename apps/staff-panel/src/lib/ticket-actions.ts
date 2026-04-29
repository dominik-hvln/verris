"use server";

import { revalidatePath } from "next/cache";
import { StaffApiError, staffApi, staffApiMultipart } from "./staff-api";

export async function staffPostReply(ticketId: string, message: string): Promise<{ ok: true } | { error: string }> {
  const m = message.trim();
  if (m.length < 2) return { error: "Wiadomość jest za krótka." };
  try {
    await staffApi(`/tickets/admin/${ticketId}/replies`, {
      method: "POST",
      body: { message: m },
    });
    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath("/");
    revalidatePath("/tickets/active");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się wysłać." };
  }
}

export async function staffPostReplyWithFiles(
  ticketId: string,
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  let message = formData.get("message")?.toString() ?? "";
  const inbound = formData.getAll("files");
  let fileCount = 0;
  for (const entry of inbound) {
    if (entry instanceof File && entry.size > 0) fileCount += 1;
  }

  const trimmed = message.trim();
  if (fileCount === 0) {
    return staffPostReply(ticketId, trimmed);
  }

  const bodyText = trimmed.length === 0 ? "(Załączniki)" : trimmed;

  const outbound = new FormData();
  outbound.append("message", bodyText);
  for (const entry of inbound) {
    if (entry instanceof File && entry.size > 0) {
      outbound.append("files", entry);
    }
  }

  try {
    await staffApiMultipart(`/tickets/admin/${ticketId}/replies/with-files`, outbound);
    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath("/");
    revalidatePath("/tickets/active");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się wysłać." };
  }
}

export async function staffUpdateTicket(
  ticketId: string,
  patch: Partial<{
    status: string;
    priority: string;
    department: string;
    assignedToId: string | null;
  }>,
): Promise<{ ok: true } | { error: string }> {
  try {
    await staffApi(`/tickets/admin/${ticketId}`, { method: "PATCH", body: patch });
    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath("/");
    revalidatePath("/tickets/active");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się zapisać." };
  }
}
