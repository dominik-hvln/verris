'use client';

import { useSearchParams } from 'next/navigation';
import { sciezkaPowrotu } from '@/lib/sciezka-powrotu';

/** Ukryte pole `next` formularza logowania — po zalogowaniu wracamy tam, skąd middleware odesłał na /login. */
export function PolePowrotu() {
  const next = useSearchParams().get('next');
  return next ? <input type="hidden" name="next" value={sciezkaPowrotu(next)} /> : null;
}

/** To samo dla logowania passkey (bez formularza) — czytane w chwili logowania z paska adresu. */
export function powrotZAdresu(): string {
  return sciezkaPowrotu(new URLSearchParams(window.location.search).get('next'));
}
