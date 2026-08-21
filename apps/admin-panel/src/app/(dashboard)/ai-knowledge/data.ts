"use server";

import { revalidatePath } from "next/cache";
import type {
  AiChatMessageDto,
  AiChatResponseDto,
  AiKnowledgeAudience,
  AiKnowledgeDocDetailDto,
  AiKnowledgeDocSummaryDto,
  AiKnowledgeStatus,
  AiStatusDto,
} from "@verris/contracts";
import { adminApi, AdminApiError } from "@/lib/api";

function err(e: unknown): string {
  if (e instanceof AdminApiError) return e.message;
  return e instanceof Error ? e.message : "Nieznany błąd";
}

export async function fetchAiStatus(): Promise<AiStatusDto | null> {
  try {
    return await adminApi<AiStatusDto>(`/ai/status`);
  } catch {
    return null;
  }
}

export async function listKnowledgeDocs(): Promise<AiKnowledgeDocSummaryDto[]> {
  return adminApi<AiKnowledgeDocSummaryDto[]>(`/admin/ai/knowledge`);
}

export async function getKnowledgeDoc(id: string) {
  try {
    return { data: await adminApi<AiKnowledgeDocDetailDto>(`/admin/ai/knowledge/${id}`) };
  } catch (e) {
    return { data: null, error: err(e) };
  }
}

export async function createKnowledgeDoc(input: {
  title: string;
  content: string;
  audience: AiKnowledgeAudience;
  sourceType?: string;
  sourceRef?: string;
}) {
  try {
    const data = await adminApi<AiKnowledgeDocDetailDto>(`/admin/ai/knowledge`, {
      method: "POST",
      body: input,
    });
    revalidatePath("/ai-knowledge");
    return { data };
  } catch (e) {
    return { data: null, error: err(e) };
  }
}

export async function updateKnowledgeDoc(
  id: string,
  input: {
    title?: string;
    content?: string;
    audience?: AiKnowledgeAudience;
    status?: AiKnowledgeStatus;
  },
) {
  try {
    const data = await adminApi<AiKnowledgeDocDetailDto>(`/admin/ai/knowledge/${id}`, {
      method: "PATCH",
      body: input,
    });
    revalidatePath("/ai-knowledge");
    return { data };
  } catch (e) {
    return { data: null, error: err(e) };
  }
}

export async function askStaffAssistant(input: {
  question: string;
  history?: AiChatMessageDto[];
}): Promise<AiChatResponseDto> {
  return adminApi<AiChatResponseDto>(`/ai/staff/chat`, {
    method: "POST",
    body: { question: input.question, history: input.history ?? [] },
  });
}

export async function deleteKnowledgeDoc(id: string) {
  try {
    await adminApi(`/admin/ai/knowledge/${id}`, { method: "DELETE" });
    revalidatePath("/ai-knowledge");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: err(e) };
  }
}
