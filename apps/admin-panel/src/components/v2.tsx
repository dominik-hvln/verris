import Link from "next/link";

/** PB-34 — wspólne klocki ekranów admina z makiety (karty, paski, pigułki). */
export const PRZYCISK =
  "inline-flex h-[38px] items-center gap-2 rounded-[9px] border border-line-strong bg-transparent px-3.5 text-sm font-semibold text-foreground hover:border-primary disabled:opacity-50";
export const PRZYCISK_GLOWNY =
  "inline-flex h-[38px] items-center gap-2 rounded-[9px] border border-primary bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50";
export const KARTA = "rounded-[10px] border border-line bg-card";
export const WIERSZ = "flex items-center gap-3.5 border-t border-line px-[18px] py-[13px]";

export function Pasek({ proc, ton = "ok" }: { proc: number; ton?: "ok" | "warn" }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-[3px] bg-raised" role="img" aria-label={`${proc}%`}>
      <span className={`block h-full rounded-[3px] ${ton === "warn" ? "bg-warn" : "bg-data"}`} style={{ width: `${Math.max(2, proc)}%` }} />
    </span>
  );
}

export const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{children}</span>
);

export function NaglowekKarty({ id, tytul, children }: { id: string; tytul: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-[18px] py-4">
      <h2 id={id} className="font-display text-[17px] font-bold">
        {tytul}
      </h2>
      {children}
    </div>
  );
}

export const LinkKarty = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="ml-auto text-[13px] font-semibold text-data-hi hover:underline">
    {children}
  </Link>
);

export function Pigulka({ ton, children, className = "", kropka = true }: { ton: "ok" | "warn" | "crit" | "muted"; children: React.ReactNode; className?: string; kropka?: boolean }) {
  const kolor = {
    ok: "bg-data-soft text-data-hi",
    warn: "bg-warn-soft text-warn",
    crit: "bg-[color-mix(in_srgb,var(--crit)_14%,transparent)] text-crit",
    muted: "bg-raised text-muted-foreground",
  }[ton];
  return (
    <span className={`inline-flex shrink-0 items-center gap-[7px] whitespace-nowrap rounded-full px-[11px] py-1 text-[13px] font-semibold ${kolor} ${className}`}>
      {kropka ? <span className="h-[7px] w-[7px] rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** Rząd wskaźników w jednej karcie (makieta: 4 kolumny, na telefonie jedna pod drugą). */
export function RzadKpi({ etykieta, children }: { etykieta: string; children: React.ReactNode }) {
  return (
    <section className={`${KARTA} grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 [&>*+*]:border-line max-sm:[&>*+*]:border-t sm:[&>*+*]:border-l`} aria-label={etykieta}>
      {children}
    </section>
  );
}

export function Kpi({ etykieta, wartosc, jednostka, opis, children }: { etykieta: string; wartosc: React.ReactNode; jednostka?: React.ReactNode; opis?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 px-5 py-[18px]">
      <Eyebrow>{etykieta}</Eyebrow>
      <div>
        <span className="font-display text-[30px] font-bold tracking-[-0.02em]">{wartosc}</span>
        {jednostka ? <span className="ml-1.5 font-mono text-xs text-muted-foreground">{jednostka}</span> : null}
      </div>
      {children}
      {opis ? <span className="text-[13px] text-muted-foreground">{opis}</span> : null}
    </div>
  );
}

/** Zakładki sekcji strony (węzeł, karta klienta) — adresy z ?sekcja=, więc działają bez JS i dają się linkować. */
export function Zakladki({ etykieta, pozycje }: { etykieta: string; pozycje: { nazwa: string; href: string; on: boolean; licznik?: number }[] }) {
  return (
    <nav aria-label={etykieta} className="flex gap-1 overflow-x-auto border-b border-line">
      {pozycje.map((z) => (
        <Link
          key={z.href}
          href={z.href}
          aria-current={z.on ? "page" : undefined}
          className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${z.on ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          {z.nazwa}
          {z.licznik ? (
            <Pigulka ton="warn" kropka={false} className="!px-[7px] !py-px !text-[11px]">
              {z.licznik}
            </Pigulka>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
