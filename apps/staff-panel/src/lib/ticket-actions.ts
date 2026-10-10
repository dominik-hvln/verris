"use server";

import { revalidatePath } from "next/cache";
import type { ServiceDiagnosticsDto } from "@verris/contracts";
import { StaffApiError, staffApi, staffApiMultipart } from "./staff-api";

export interface CannedResponseRow {
  id: string;
  title: string;
  content: string;
  topic: string | null;
  shortcut?: string | null;
  /** PB-37 — POWITANIE, DIAGNOZA, OPOZNIENIE, ZALECENIA, ZAMKNIECIE */
  category?: string | null;
}

/** SUP-2/SUP-V2 — szablony odpowiedzi (posortowane pod temat; opcjonalne wyszukiwanie). */
export async function staffFetchCanned(topic?: string, query?: string, ticketId?: string): Promise<CannedResponseRow[]> {
  try {
    const params = new URLSearchParams();
    if (ticketId) params.set("ticketId", ticketId);
    if (topic) params.set("topic", topic);
    if (query && query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    return await staffApi<CannedResponseRow[]>(`/tickets/canned${qs ? `?${qs}` : ""}`);
  } catch {
    return [];
  }
}

export async function staffPostReply(
  ticketId: string,
  message: string,
  czekaj: "tak" | "nie" = "tak",
): Promise<{ ok: true } | { error: string }> {
  const m = message.trim();
  if (m.length < 2) return { error: "Wiadomość jest za krótka." };
  try {
    await staffApi(`/tickets/admin/${ticketId}/replies`, {
      method: "POST",
      body: { message: m, czekaj },
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

/**
 * F2.5 — zgłoszenie założone przez obsługę w imieniu klienta. Klient: `userId` (z karty / filtra skrzynki)
 * albo dokładny e-mail. Zwraca id nowego zgłoszenia — formularz przechodzi do jego wątku.
 */
export async function staffCreateTicketOnBehalf(fd: FormData): Promise<{ ok: true; id: string } | { error: string }> {
  const pole = (k: string) => fd.get(k)?.toString().trim() ?? "";
  const userId = pole("userId");
  const email = pole("email");
  if (!userId && !email) return { error: "Podaj e-mail klienta." };
  const body: Record<string, string> = { subject: pole("subject"), message: pole("message"), priority: pole("priority") || "NORMAL", department: pole("department") || "TECHNICAL" };
  if (userId) body.userId = userId;
  else body.email = email;
  try {
    const r = await staffApi<{ id: string }>("/tickets/admin/w-imieniu", { method: "POST", body });
    revalidatePath("/");
    return { ok: true, id: r.id };
  } catch (e) {
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się założyć zgłoszenia." };
  }
}

/** F2.5 — notatka wewnętrzna w wątku: bez maila do klienta i bez zmiany stanu zgłoszenia. */
export async function staffPostNote(ticketId: string, message: string): Promise<{ ok: true } | { error: string }> {
  const m = message.trim();
  if (m.length < 2) return { error: "Notatka jest za krótka." };
  try {
    await staffApi(`/tickets/admin/${ticketId}/notatki`, { method: "POST", body: { message: m } });
    revalidatePath(`/tickets/${ticketId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się zapisać notatki." };
  }
}

export async function staffPostReplyWithFiles(
  ticketId: string,
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const message = formData.get("message")?.toString() ?? "";
  const czekaj = formData.get("czekaj")?.toString() === "nie" ? "nie" : "tak";
  const inbound = formData.getAll("files");
  let fileCount = 0;
  for (const entry of inbound) {
    if (entry instanceof File && entry.size > 0) fileCount += 1;
  }
  // F2.5 — „Zapisz jako notatkę”: ta sama treść idzie do notatek wewnętrznych, nigdy do klienta.
  if (formData.get("rodzaj")?.toString() === "notatka") {
    if (fileCount > 0) return { error: "Notatka nie przyjmuje załączników — wyślij je w odpowiedzi albo usuń z pola." };
    return staffPostNote(ticketId, message);
  }

  const trimmed = message.trim();
  if (fileCount === 0) {
    return staffPostReply(ticketId, trimmed, czekaj);
  }

  const bodyText = trimmed.length === 0 ? "(Załączniki)" : trimmed;

  const outbound = new FormData();
  outbound.append("message", bodyText);
  outbound.append("czekaj", czekaj);
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
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się ustawić flagi ryzyka." };
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

/** PB-43 — zmiana usługi, której dotyczy zgłoszenie (null = bez usługi). */
export async function staffLinkTicketService(
  ticketId: string,
  subscriptionId: string | null,
): Promise<{ ok: true } | { error: string }> {
  try {
    await staffApi(`/tickets/admin/${ticketId}/usluga`, { method: "POST", body: { subscriptionId } });
    revalidatePath(`/tickets/${ticketId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się zmienić usługi zgłoszenia." };
  }
}

/** PB-43 — diagnostyka usługi powiązanej ze zgłoszeniem (ta sama co na karcie usługi). */
export async function staffTicketDiagnostics(
  ticketId: string,
): Promise<{ ok: true; data: ServiceDiagnosticsDto } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await staffApi<ServiceDiagnosticsDto>(`/tickets/admin/${ticketId}/diagnostyka`) };
  } catch (e) {
    return { ok: false, error: e instanceof StaffApiError ? e.message : "Nie udało się uruchomić diagnostyki." };
  }
}

/** F2.5 — cofnięcie eskalacji (powód obowiązkowy; priorytet wraca do sprzed eskalacji). */
export async function staffUndoEscalation(ticketId: string, reason: string): Promise<{ ok: true } | { error: string }> {
  try {
    await staffApi(`/tickets/admin/${ticketId}/escalate/cofnij`, { method: "POST", body: { reason } });
    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się cofnąć eskalacji." };
  }
}

/** F2.5 — tagi zgłoszenia (cała lista). */
export async function staffSetTags(ticketId: string, tagi: string[]): Promise<{ ok: true; tags: string[] } | { error: string }> {
  try {
    const r = await staffApi<{ tags: string[] }>(`/tickets/admin/${ticketId}/tagi`, { method: "POST", body: { tagi } });
    revalidatePath(`/tickets/${ticketId}`);
    return { ok: true, tags: r.tags };
  } catch (e) {
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się zapisać tagów." };
  }
}

/** F2.5 — tagi w użyciu (podpowiedzi); przy błędzie pusta lista. */
export async function staffListTags(): Promise<{ tag: string; liczba: number }[]> {
  try {
    return await staffApi<{ tag: string; liczba: number }[]>("/tickets/admin/tagi");
  } catch {
    return [];
  }
}

/** F2.5 — odhaczone kroki runbooka zapisane w wątku jako notatka wewnętrzna. */
export async function staffRunbookSteps(ticketId: string, runbookKey: string, kroki: number[]): Promise<{ ok: true } | { error: string }> {
  try {
    await staffApi(`/tickets/admin/${ticketId}/runbook/kroki`, { method: "POST", body: { runbookKey, kroki } });
    revalidatePath(`/tickets/${ticketId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof StaffApiError ? e.message : "Nie udało się zapisać kroków." };
  }
}
