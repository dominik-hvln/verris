'use client';

import { useSearchParams } from 'next/navigation';
import { DOMYSLNY_POWROT, sciezkaPowrotu } from '@/lib/sciezka-powrotu';

/** Ukryte pole `next` formularza logowania — po zalogowaniu wracamy tam, skąd middleware odesłał na /login. */
export function PolePowrotu() {
  const next = useSearchParams().get('next');
  return next ? <input type="hidden" name="next" value={sciezkaPowrotu(next)} /> : null;
}

/** P4-4: „Zarejestruj się” z logowania zachowuje cel (np. zamówienie poczty) — nowy klient nie traci go po drodze. */
export function adresRejestracji(next: string | null): string {
  const cel = next ? sciezkaPowrotu(next) : DOMYSLNY_POWROT;
  return cel === DOMYSLNY_POWROT ? '/register' : `/register?next=${encodeURIComponent(cel)}`;
}

export function LinkRejestracji({ className, children }: { className?: string; children: React.ReactNode }) {
  const next = useSearchParams().get('next');
  return (
    <a href={adresRejestracji(next)} className={className}>
      {children}
    </a>
  );
}

/** To samo dla logowania passkey (bez formularza) — czytane w chwili logowania z paska adresu. */
export function powrotZAdresu(): string {
  return sciezkaPowrotu(new URLSearchParams(window.location.search).get('next'));
}
