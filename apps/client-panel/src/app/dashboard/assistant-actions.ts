'use server';

import type { AiChatMessageDto, AiChatResponseDto, AiStatusDto } from '@verris/contracts';
import { apiFetch } from '@/lib/api';

export async function fetchAiStatusAction(): Promise<AiStatusDto | null> {
  try {
    return await apiFetch<AiStatusDto>('/ai/status');
  } catch {
    return null;
  }
}

export async function askHostingAssistantAction(input: {
  question: string;
  history?: AiChatMessageDto[];
  subscriptionId?: string | null;
}): Promise<AiChatResponseDto> {
  return apiFetch<AiChatResponseDto>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({
      question: input.question,
      history: input.history ?? [],
      subscriptionId: input.subscriptionId ?? undefined,
    }),
  });
}
