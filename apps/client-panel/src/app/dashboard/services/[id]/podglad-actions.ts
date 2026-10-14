'use server';

import { apiFetch } from '@/lib/api';

export type PodgladStrony = { url: string; wygasa: string; domena: string };

/**
 * 15.10 — tymczasowy adres podglądu strony przed zmianą DNS. `null`, gdy funkcja nie jest włączona albo konto
 * nie jest aktywne — wtedy panel nic nie pokazuje (podgląd to dodatek, nie krok wymagany).
 */
export async function pobierzPodgladAction(serviceId: string): Promise<PodgladStrony | null> {
  try {
    return await apiFetch<PodgladStrony>(`/services/${serviceId}/podglad`);
  } catch {
    return null;
  }
}
