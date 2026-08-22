'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch, ApiError } from '@/lib/api';

export interface AddonCatalogItem {
  slug: string;
  name: string;
  description: string;
  price: string;
  currency: string;
}

export interface PurchasedAddonRow {
  id: string;
  slug: string;
  name: string;
  amount: string;
  status: string;
  createdAt: string;
}

export interface AddonsOverview {
  catalog: AddonCatalogItem[];
  prioritySupport: { active: boolean; until: string | null };
  purchased: PurchasedAddonRow[];
}

export async function fetchAddons(): Promise<AddonsOverview | null> {
  try {
    return await apiFetch<AddonsOverview>('/addons');
  } catch {
    return null;
  }
}

/**
 * Z-06 — zakup dodatku.
 *
 * `idempotencyKey` przychodzi Z KOMPONENTU i musi być stały dla jednej decyzji
 * zakupu. Świadomie NIE generujemy go tutaj: akcja serwerowa wykonuje się na
 * nowo przy każdym kliknięciu, więc klucz tworzony w tym miejscu byłby za
 * każdym razem inny — czyli dokładnie ten błąd, który Z-06 naprawia.
 *
 * Gdy klucza brak (starszy klient, wywołanie z innego miejsca), API wylicza
 * własny z okna czasu — słabszy, ale nadal chroniący przed podwójnym kliknięciem.
 */
export async function purchaseAddonAction(
  slug: string,
  idempotencyKey?: string,
): Promise<{ ok: true; note: string } | { ok: false; error: string }> {
  try {
    const r = await apiFetch<{ note: string }>('/addons/purchase', {
      method: 'POST',
      body: JSON.stringify(idempotencyKey ? { slug, idempotencyKey } : { slug }),
    });
    revalidatePath('/dashboard/addons');
    revalidatePath('/dashboard/billing');
    return { ok: true, note: r.note };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Błąd',
    };
  }
}
