'use server';

import { apiFetch } from '@/lib/api';

/**
 * KB-UNIFY-2 — panel klienta czyta z CMS Bazy Wiedzy (pomoc.verris.pl), a nie ze
 * starej AI KB. Jedna, spójna baza. `id` = slug artykułu.
 */

export interface KbListItem {
  id: string; // slug
  title: string;
  category?: string;
}

export interface KbArticle {
  id: string; // slug
  title: string;
  content: string; // Markdown
  updatedAt: string;
  category?: string | null;
}

type PublicTree = Array<{
  slug: string;
  name: string;
  parentId: string | null;
  articles: Array<{ slug: string; title: string; excerpt: string | null }>;
}>;

export async function fetchKbArticles(): Promise<KbListItem[]> {
  try {
    const tree = await apiFetch<PublicTree>('/kb/api/tree', { unauthenticated: true });
    const items: KbListItem[] = [];
    for (const cat of tree) {
      for (const a of cat.articles) {
        items.push({ id: a.slug, title: a.title, category: cat.name });
      }
    }
    return items;
  } catch {
    return [];
  }
}

export async function fetchKbArticle(slug: string): Promise<KbArticle | null> {
  try {
    const a = await apiFetch<{
      slug: string;
      title: string;
      bodyMarkdown: string;
      updatedAt: string;
      categoryName: string | null;
    } | null>(`/kb/api/article/${encodeURIComponent(slug)}`, { unauthenticated: true });
    if (!a) return null;
    return { id: a.slug, title: a.title, content: a.bodyMarkdown, updatedAt: a.updatedAt, category: a.categoryName };
  } catch {
    return null;
  }
}
