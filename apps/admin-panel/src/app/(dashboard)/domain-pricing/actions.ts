'use server';

import { revalidatePath } from 'next/cache';
import { adminApi } from '@/lib/api';
import type { SslProduktAdminDto } from '@verris/contracts';

// A-14 — cena ukrycia danych w WHOIS (puste = usługa niedostępna dla klientów)
export async function fetchWhoisPrivacyPrice(): Promise<{ whoisPrivacyPrice: string | null }> {
  return adminApi<{ whoisPrivacyPrice: string | null }>('/admin/platform-settings/whois-privacy');
}

export async function updateWhoisPrivacyPriceAction(
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const whoisPrivacyPrice = String(formData.get('whoisPrivacyPrice') ?? '').trim() || null;
  try {
    await adminApi('/admin/platform-settings/whois-privacy', { method: 'PATCH', body: { whoisPrivacyPrice } });
    revalidatePath('/domain-pricing');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nie udało się zapisać ceny ukrycia danych WHOIS.' };
  }
}

// G-08 — cennik płatnych certyfikatów SSL (DV); pusta cena = produkt niewidoczny dla klientów
export async function fetchSslProducts(): Promise<{ produkty: SslProduktAdminDto[] } | { blad: string }> {
  try {
    return { produkty: await adminApi<SslProduktAdminDto[]>('/admin/ssl/products') };
  } catch (e) {
    return { blad: e instanceof Error ? e.message : 'Nie udało się pobrać listy certyfikatów.' };
  }
}

export async function updateSslPricesAction(
  _prev: { ok?: boolean; error?: string },
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const prices: Record<string, string | null> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith('ssl-')) prices[k.slice(4)] = String(v).trim() || null;
  }
  try {
    await adminApi('/admin/ssl/prices', { method: 'PATCH', body: { prices } });
    revalidatePath('/domain-pricing');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Nie udało się zapisać cennika SSL.' };
  }
}
