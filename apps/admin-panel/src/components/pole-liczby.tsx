'use client';

import { useState, type InputHTMLAttributes } from 'react';

/** „44,99” i „44.99” → 44.99; puste albo nieliczba → NaN. */
export const liczbaZPola = (s: string) => Number.parseFloat(s.replace(',', '.'));

/**
 * Pole liczby z kwotą/ułamkiem. Kontrolowane `<input type="number">` z `Number(e.target.value)` w polskiej
 * przeglądarce zerowało wartość przy wpisaniu kropki (separatorem jest „,”, a pole z „44.” jest puste)
 * i przy czyszczeniu — „44.99” zapisywało się jako 99 albo 0. Tu tekst trzyma pole, a `onChange`
 * dostaje liczbę tylko wtedy, gdy wpis jest liczbą. Po wyjściu z pola tekst wraca do bieżącej wartości.
 */
export function PoleLiczby({
  value,
  onChange,
  min = 0,
  ...rest
}: { value: number; onChange: (n: number) => void; min?: number } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'min'
>) {
  const pokaz = (n: number) => String(n).replace('.', ',');
  const [tekst, setTekst] = useState(pokaz(value));
  // Wartość zmieniona z zewnątrz (np. po zapisie) — tekst nadąża, chyba że już ją wyraża („0,50” = 0.5).
  const [poprzednia, setPoprzednia] = useState(value);
  if (value !== poprzednia) {
    setPoprzednia(value);
    if (liczbaZPola(tekst) !== value) setTekst(pokaz(value));
  }
  return (
    <input
      inputMode="decimal"
      {...rest}
      value={tekst}
      onChange={(e) => {
        setTekst(e.target.value);
        const n = liczbaZPola(e.target.value);
        if (Number.isFinite(n)) onChange(Math.max(min, n));
      }}
      onBlur={(e) => {
        setTekst(pokaz(value));
        rest.onBlur?.(e);
      }}
    />
  );
}
