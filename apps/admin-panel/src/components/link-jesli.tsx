import Link from "next/link";

/**
 * Link tylko wtedy, gdy operator otworzy stronę docelową (przegląd 10.10: karta klienta, usługi i faktury
 * linkowały do stron, które dla części ról kończyły się odmową). Bez uprawnienia — sam tekst.
 */
export function LinkJesli({ wolno, href, className, children }: { wolno: boolean; href: string; className?: string; children: React.ReactNode }) {
  return wolno ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <span className={className?.replace(/\bhover:\S+/g, "").trim()}>{children}</span>
  );
}
