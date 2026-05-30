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
    revalidatePath("/tickets/closed");
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
    revalidatePath("/tickets/closed");
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
    revalidatePath("/tickets/closed");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się zapisać." };
  }
}

export async function staffEscalateTicket(
  ticketId: string,
  reason: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    await staffApi(`/tickets/admin/${ticketId}/escalate`, {
      method: "POST",
      body: { reason },
    });
    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath("/");
    revalidatePath("/tickets/active");
    revalidatePath("/tickets/closed");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się eskalować." };
  }
}

export async function staffApplyRunbook(
  ticketId: string,
  runbookKey: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    await staffApi(`/tickets/admin/${ticketId}/runbook`, {
      method: "POST",
      body: { runbookKey },
    });
    revalidatePath(`/tickets/${ticketId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się przypisać runbooka." };
  }
}

export async function staffSetRiskFlag(
  ticketId: string,
  riskFlag: string,
  riskReason: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    await staffApi(`/tickets/admin/${ticketId}/risk`, {
      method: "POST",
      body: { riskFlag: riskFlag || null, riskReason: riskReason || null },
    });
    revalidatePath(`/tickets/${ticketId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się ustawić risk flag." };
  }
}

export async function staffGenerateAiSuggestion(
  ticketId: string,
): Promise<{ ok: true; suggestion: unknown } | { error: string }> {
  try {
    const suggestion = await staffApi(`/ai/tickets/${ticketId}/suggestion`, { method: "POST" });
    return { ok: true, suggestion };
  } catch (e) {
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się wygenerować sugestii AI." };
  }
}

export async function staffGetAiStatus(): Promise<{ provider: string; configured: boolean }> {
  try {
    return await staffApi<{ provider: string; configured: boolean }>("/ai/status");
  } catch {
    return { provider: "openai-compatible", configured: false };
  }
}
