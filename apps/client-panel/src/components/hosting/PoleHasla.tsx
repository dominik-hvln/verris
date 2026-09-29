'use client';

import { useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';

export function genPassword(len = 18): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

/**
 * Pole hasła: domyślnie ukryte (kropki), przycisk pokaż/ukryj i generator. Wygenerowane hasło
 * pokazujemy od razu, żeby klient mógł je przepisać lub skopiować. Fragment — wstaw do istniejącego
 * kontenera `flex gap-1.5`.
 */
export function PoleHasla({
  value,
  onChange,
  placeholder,
  className,
  small = false,
  etykieta = 'Hasło',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className: string;
  small?: boolean;
  /** Dostępna nazwa pola (pole nie siedzi w <label>). */
  etykieta?: string;
}) {
  const [widoczne, setWidoczne] = useState(false);
  const ikona = small ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const przycisk = `shrink-0 rounded-[7px] border border-line bg-raised ${small ? 'px-2' : 'px-2.5'} text-[color:var(--verris-body)] hover:bg-raised`;
  return (
    <>
      <input
        type={widoczne ? 'text' : 'password'}
        autoComplete="new-password"
        spellCheck={false}
        aria-label={etykieta}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
      <button
        type="button"
        title={widoczne ? 'Ukryj hasło' : 'Pokaż hasło'}
        aria-label={widoczne ? 'Ukryj hasło' : 'Pokaż hasło'}
        onClick={() => setWidoczne((v) => !v)}
        className={przycisk}
      >
        {widoczne ? <EyeOff className={ikona} /> : <Eye className={ikona} />}
      </button>
      <button
        type="button"
        title="Wygeneruj hasło"
        aria-label="Wygeneruj hasło"
        onClick={() => {
          onChange(genPassword());
          setWidoczne(true);
        }}
        className={przycisk}
      >
        <KeyRound className={ikona} />
      </button>
    </>
  );
}
