"use server";

import type { AiChatMessageDto, AiChatResponseDto, AiStatusDto, KontekstAsystentaDto } from "@verris/contracts";
import { AdminApiError, adminApi } from "@/lib/api";

/** Asystent pracowników (POST /ai/staff/chat) z kontekstem strony; błąd wraca treścią, nie wyjątkiem (produkcja go maskuje). */
export async function zapytajAsystenta(input: {
  question: string;
  history?: AiChatMessageDto[];
  kontekst?: KontekstAsystentaDto;
}): Promise<AiChatResponseDto> {
  try {
    return await adminApi<AiChatResponseDto>(`/ai/staff/chat`, {
      method: "POST",
      body: { question: input.question, history: input.history ?? [], ...(input.kontekst ? { kontekst: input.kontekst } : {}) },
    });
  } catch (e) {
    const powod = e instanceof AdminApiError || e instanceof Error ? e.message : "nieznany błąd";
    return { available: false, answer: `Asystent nie odpowiedział: ${powod}`, sources: [] };
  }
}

/** Czy asystent działa (GET /ai/status) — bez tego „?” prowadzi do funkcji zamiast do asystenta. */
export async function asystentDostepny(): Promise<boolean> {
  try {
    return (await adminApi<AiStatusDto>(`/ai/status`)).configured;
  } catch {
    return false;
  }
}
