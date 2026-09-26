import type { InputHTMLAttributes } from 'react';

/**
 * Pole wyboru w stylu panelu (zamiast systemowego, które wygląda inaczej w każdej przeglądarce).
 * Pod spodem zostaje prawdziwy <input type="checkbox"> — przezroczysty, na wierzchu ramki — więc
 * działają `name`, `required`, `defaultChecked`, formularze server actions, klawiatura i czytniki ekranu.
 * `className` trafia na obudowę (rozmiar, marginesy), np. "h-5 w-5 mt-0.5".
 */
export function Checkbox({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <span className={['relative inline-flex h-4 w-4 flex-none', className].filter(Boolean).join(' ')}>
      <input
        {...props}
        type="checkbox"
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden
        className="pointer-events-none h-full w-full rounded-[4px] border border-line-strong bg-card transition-colors peer-checked:border-verris-green peer-checked:bg-verris-green peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--data)]/40 peer-disabled:opacity-50"
      />
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute inset-0 m-auto h-[70%] w-[70%] text-verris-paper opacity-0 peer-checked:opacity-100"
      >
        <path d="M2.5 6.2 5 8.5l4.5-5" />
      </svg>
    </span>
  );
}
