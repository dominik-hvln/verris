import Link from "next/link";

/**
 * Stronicowanie skrzynki i zamkniętych. Bez "use client": strony (Server Components) dają tu funkcję `link`,
 * a funkcji nie da się przekazać komponentowi klienckiemu (przegląd F2.5 — skrzynka by się nie wczytała).
 */
export function Stronicowanie({ strona, stron, razem, link }: { strona: number; stron: number; razem: number; link: (s: number) => string }) {
  if (stron <= 1) return null;
  const PRZ = "inline-flex h-8 items-center rounded-[9px] border border-line-strong bg-card px-3 text-[13px] font-semibold text-foreground no-underline hover:border-primary";
  return (
    <nav aria-label="Strony" className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground" data-stronicowanie="skrzynka">
      <span>
        Strona {strona} z {stron} · {razem} zgłoszeń
      </span>
      <span className="flex gap-2">
        {strona > 1 ? <Link href={link(strona - 1)} className={PRZ}>← Poprzednia</Link> : null}
        {strona < stron ? <Link href={link(strona + 1)} className={PRZ}>Następna →</Link> : null}
      </span>
    </nav>
  );
}
