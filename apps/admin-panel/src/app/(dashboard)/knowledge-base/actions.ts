'use server';

import { revalidatePath } from 'next/cache';
import { adminApi, AdminApiError } from '@/lib/api';

export type KbCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  parentId: string | null;
  order: number;
};

export type KbArticle = {
  id: string;
  slug: string;
  categoryId: string;
  title: string;
  excerpt: string | null;
  bodyMarkdown: string;
  status: 'DRAFT' | 'PUBLISHED';
  seoTitle: string | null;
  seoDescription: string | null;
  authorName: string | null;
  order: number;
  views: number;
  publishedAt: string | null;
  updatedAt: string;
};

export type KbArticleListItem = Omit<KbArticle, 'bodyMarkdown'>;

type Res<T = void> = { ok: true; data?: T } | { ok: false; error: string };
function err(e: unknown): string {
  return e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : 'Wystąpił błąd.';
}

// ---- categories
export async function fetchCategories(): Promise<KbCategory[]> {
  try {
    return await adminApi<KbCategory[]>('/admin/kb/categories');
  } catch {
    return [];
  }
}

export async function createCategory(input: {
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  parentId?: string | null;
  order?: number;
}): Promise<Res<KbCategory>> {
  try {
    const data = await adminApi<KbCategory>('/admin/kb/categories', { method: 'POST', body: input });
    revalidatePath('/knowledge-base');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function updateCategory(id: string, input: Partial<KbCategory>): Promise<Res<KbCategory>> {
  try {
    const data = await adminApi<KbCategory>(`/admin/kb/categories/${id}`, { method: 'PATCH', body: input });
    revalidatePath('/knowledge-base');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function deleteCategory(id: string): Promise<Res> {
  try {
    await adminApi(`/admin/kb/categories/${id}`, { method: 'DELETE' });
    revalidatePath('/knowledge-base');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

// ---- articles
export async function fetchArticles(categoryId?: string): Promise<KbArticleListItem[]> {
  try {
    const qs = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : '';
    return await adminApi<KbArticleListItem[]>(`/admin/kb/articles${qs}`);
  } catch {
    return [];
  }
}

export async function getArticle(id: string): Promise<KbArticle | null> {
  try {
    return await adminApi<KbArticle>(`/admin/kb/articles/${id}`);
  } catch {
    return null;
  }
}

export type ArticleInput = {
  title: string;
  slug?: string;
  categoryId: string;
  excerpt?: string;
  bodyMarkdown: string;
  status?: 'DRAFT' | 'PUBLISHED';
  seoTitle?: string;
  seoDescription?: string;
  order?: number;
};

export async function createArticle(input: ArticleInput): Promise<Res<KbArticle>> {
  try {
    const data = await adminApi<KbArticle>('/admin/kb/articles', { method: 'POST', body: input });
    revalidatePath('/knowledge-base');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function updateArticle(id: string, input: Partial<ArticleInput>): Promise<Res<KbArticle>> {
  try {
    const data = await adminApi<KbArticle>(`/admin/kb/articles/${id}`, { method: 'PATCH', body: input });
    revalidatePath('/knowledge-base');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function deleteArticle(id: string): Promise<Res> {
  try {
    await adminApi(`/admin/kb/articles/${id}`, { method: 'DELETE' });
    revalidatePath('/knowledge-base');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
