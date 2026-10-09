export type AiKnowledgeAudience = 'CLIENT' | 'STAFF' | 'ALL';
export type AiKnowledgeStatus = 'ACTIVE' | 'ARCHIVED';

export interface AiStatusDto {
  provider: string;
  configured: boolean;
  embeddings: boolean;
}

export interface AiKnowledgeDocSummaryDto {
  id: string;
  title: string;
  sourceType: string;
  sourceRef: string | null;
  audience: AiKnowledgeAudience;
  status: AiKnowledgeStatus;
  charCount: number;
  chunkCount: number;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiKnowledgeDocDetailDto {
  id: string;
  title: string;
  sourceType: string;
  sourceRef: string | null;
  audience: AiKnowledgeAudience;
  status: AiKnowledgeStatus;
  charCount: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatMessageDto {
  role: 'user' | 'assistant';
  content: string;
}

/** Typy obiektów, na których karcie pracownik może pytać asystenta (asystent dostaje tylko typ i ID, nie dane). */
export const OBIEKTY_ASYSTENTA = ['wezel', 'klient', 'usluga', 'faktura', 'zgloszenie', 'migracja', 'operator'] as const;
export type ObiektAsystenta = (typeof OBIEKTY_ASYSTENTA)[number];

/** Kontekst pytania pracownika: strona panelu admina, funkcja ze słownika „?” i obiekt z karty. */
export interface KontekstAsystentaDto {
  strona: string;
  funkcja?: string;
  obiektTyp?: ObiektAsystenta;
  obiektId?: string;
}

export interface AiChatRequestDto {
  question: string;
  history?: AiChatMessageDto[];
  subscriptionId?: string | null;
  kontekst?: KontekstAsystentaDto;
}

export interface AiChatSourceDto {
  docId: string;
  title: string;
}

export interface AiChatResponseDto {
  available: boolean;
  answer: string;
  sources: AiChatSourceDto[];
  unavailableReason?: string;
}
