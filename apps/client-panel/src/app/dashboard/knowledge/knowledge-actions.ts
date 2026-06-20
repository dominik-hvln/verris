'use server';

import { apiFetch } from '@/lib/api';

export interface KbListItem {
  id: string;
  title: string;
  updatedAt: string;
}

export interface KbArticle {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

export async function fetchKbArticles(): Promise<KbListItem[]> {
  try {
    return await apiFetch<KbListItem[]>('/ai/kb');
  } catch {
    return [];
  }
}

export async function fetchKbArticle(id: string): Promise<KbArticle | null> {
  try {
    return await apiFetch<KbArticle>(`/ai/kb/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}
