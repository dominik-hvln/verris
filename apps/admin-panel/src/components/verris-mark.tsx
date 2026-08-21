/**
 * Znak Verris (KV) — ten sam wektor co w panelu klienta i na pomoc.verris.pl.
 * Chevron „V" w kolorze `currentColor` + mint akcent. Używać w kaflu KV
 * (ciemny pine + mint), żeby logo było spójne we wszystkich panelach.
 */
export function VerrisMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Verris">
      <path
        d="M26 30 L40 30 L50 52 L60 30 L74 30 L50 78 Z M44 55 L56 55 L50 69 Z"
        fill="currentColor"
        fillRule="evenodd"
      />
      <path d="M44 55 L56 55 L50 69 Z" fill="none" stroke="#34E5A0" strokeWidth="1.6" />
    </svg>
  );
}
