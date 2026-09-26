"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { GrafanaOpsLink, canShowGrafanaLink, grafanaSsoHref } from "./grafana-ops-link";
import { CommandPalette } from "./command-palette";
import { VerrisMark } from "./verris-mark";
import { StaffNotificationBell } from "./staff-notification-bell";
import { ThemeToggle } from "./theme-toggle";
import type { StaffProfile } from "@/lib/staff-session";
import { staffLogout } from "@/lib/staff-auth-actions";

export interface LicznikiMenu {
  skrzynka: number;
  moje: number;
  czeka: number;
  poTerminie: number;
}

type Pozycja = { name: string; href: string; licznik?: number; ostrzezenie?: boolean };

/** Bieżąca pozycja menu: ścieżka + widok skrzynki (?widok=moje|czeka). */
function aktywna(href: string, pathname: string, widok: string | null): boolean {
  const [sciezka, zapytanie] = href.split("?");
  const hrefWidok = zapytanie ? new URLSearchParams(zapytanie).get("widok") : null;
  if (sciezka === "/") return (pathname === "/" || pathname.startsWith("/tickets/")) && pathname !== "/tickets/closed" && hrefWidok === widok;
  return pathname === sciezka || pathname.startsWith(`${sciezka}/`);
}

const TYTULY: [RegExp, string[]][] = [
  [/^\/tickets\/closed/, ["Zamknięte"]],
  [/^\/tickets\/([^/]+)/, ["Skrzynka", "#"]],
  [/^\/crm\/[^/]+\/subscriptions/, ["Klienci", "Karta klienta", "Usługa"]],
  [/^\/crm\/[^/]+/, ["Klienci", "Karta klienta"]],
  [/^\/crm/, ["Klienci"]],
  [/^\/migrations\/[^/]+/, ["Migracje", "Szczegóły"]],
  [/^\/migrations/, ["Migracje"]],
  [/^\/abuse\/[^/]+/, ["Nadużycia", "Zgłoszenie"]],
  [/^\/abuse/, ["Nadużycia"]],
  [/^\/referral-enrollments/, ["Program partnerski"]],
  [/^\/knowledge\/odpowiedzi/, ["Baza odpowiedzi"]],
  [/^\/knowledge/, ["Baza wiedzy"]],
  [/^\/settings/, ["Ustawienia"]],
];

function okruszki(pathname: string, widok: string | null): string[] {
  if (pathname === "/") return [widok === "moje" ? "Moje" : widok === "czeka" ? "Czeka na klienta" : "Skrzynka"];
  for (const [re, t] of TYTULY) {
    const m = re.exec(pathname);
    if (m) return t.map((x) => (x === "#" ? `#${(m[1] ?? "").slice(0, 8)}` : x));
  }
  return ["Panel obsługi"];
}

export function StaffShell({
  session,
  liczniki,
  children,
}: {
  session: StaffProfile;
  liczniki: LicznikiMenu | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const widok = useSearchParams().get("widok");
  const nazwa = [session.firstName, session.lastName].filter(Boolean).join(" ") || session.email;

  const grupy: { naglowek: string; pozycje: Pozycja[] }[] = [
    {
      naglowek: "Zgłoszenia",
      pozycje: [
        { name: "Skrzynka", href: "/", licznik: liczniki?.skrzynka, ostrzezenie: (liczniki?.poTerminie ?? 0) > 0 },
        { name: "Moje", href: "/?widok=moje", licznik: liczniki?.moje },
        { name: "Czeka na klienta", href: "/?widok=czeka", licznik: liczniki?.czeka },
        { name: "Zamknięte", href: "/tickets/closed" },
      ],
    },
    {
      naglowek: "Klienci",
      pozycje: [
        { name: "Klienci", href: "/crm" },
        { name: "Migracje", href: "/migrations" },
        { name: "Nadużycia", href: "/abuse" },
        { name: "Program partnerski", href: "/referral-enrollments" },
      ],
    },
    {
      naglowek: "Wiedza",
      pozycje: [
        { name: "Baza odpowiedzi", href: "/knowledge/odpowiedzi" },
        { name: "Baza wiedzy", href: "/knowledge" },
        { name: "Ustawienia", href: "/settings" },
      ],
    },
  ];

  const sciezka = okruszki(pathname, widok);
  // Aktywna jest najdłuższa pasująca pozycja (np. /knowledge/odpowiedzi, nie też /knowledge).
  const pasujace = grupy.flatMap((g) => g.pozycje.map((p) => p.href)).filter((h) => aktywna(h, pathname, widok));
  const wybrana = pasujace.sort((a, b) => b.length - a.length)[0];
  // Menu na telefonie zamyka się samo po przejściu na inną stronę (otwarte = dla tej ścieżki).
  const [otwarteDla, setOtwarteDla] = useState<string | null>(null);
  const tu = `${pathname}?${widok ?? ""}`;
  const otwarte = otwarteDla === tu;
  const setOtwarte = (o: boolean) => setOtwarteDla(o ? tu : null);

  const menu = (
    <>
        <div className="flex items-center gap-2.5 px-1.5">
        <VerrisMark className="h-[22px] w-[22px] text-verris-mint" />
        <span className="font-display text-[22px] font-extrabold tracking-[-0.02em]">verris</span>
        <span className="ml-auto rounded-[5px] border border-verris-mint/35 px-[7px] py-[2px] font-mono text-[10.5px] tracking-[0.1em] text-verris-mint">
          SUPPORT
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Menu obsługi">
        {grupy.map((g) => (
          <div key={g.naglowek} className="flex flex-col gap-0.5">
            <div className="px-3 pb-1.5 pt-2.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#7f8a83]">{g.naglowek}</div>
            {g.pozycje.map((p) => {
              const on = p.href === wybrana;
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                    on ? "bg-verris-card text-verris-paper shadow-[inset_3px_0_0_var(--verris-mint)]" : "text-verris-body hover:bg-verris-card/60 hover:text-verris-paper"
                  }`}
                >
                  {p.name}
                  {p.licznik ? (
                    <span className={`ml-auto font-mono text-[11px] ${p.ostrzezenie ? "text-[#f2b84b]" : "text-[#7f8a83]"}`}>{p.licznik}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
        {grafanaSsoHref() && canShowGrafanaLink(session) ? (
          <div className="flex flex-col gap-0.5">
            <div className="px-3 pb-1.5 pt-2.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#7f8a83]">Monitoring</div>
            <div className="px-1">
              <GrafanaOpsLink session={session} />
            </div>
          </div>
        ) : null}
      </nav>

      <div className="flex items-center gap-2.5 rounded-[10px] border border-verris-hairline p-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-verris-green text-[13px] font-bold">{inicjaly(session)}</span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{nazwa}</span>
          <span className="font-mono text-[11px] text-verris-stone">{session.role === "ADMIN" ? "administrator" : "obsługa"}</span>
        </div>
        <form action={staffLogout}>
          <button type="submit" aria-label="Wyloguj" className="flex h-8 w-8 items-center justify-center rounded-lg text-verris-stone hover:bg-verris-card hover:text-verris-paper">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  );

  return (
    <div className="grid min-h-screen grid-cols-1 bg-verris-pine lg:grid-cols-[252px_minmax(0,1fr)]">
      {/* WCAG 2.4.1 — skip link: pierwszy element fokusowalny, omija menu boczne. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black"
      >
        Przejdź do treści
      </a>

      <aside className="sticky top-0 hidden h-screen flex-col gap-[18px] border-r border-verris-hairline bg-verris-pine px-4 py-[22px] text-verris-paper lg:flex">
        {menu}
      </aside>

      {otwarte ? (
        <div className="fixed inset-0 z-[90] flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <aside className="flex h-full w-[min(300px,86vw)] flex-col gap-[18px] overflow-y-auto bg-verris-pine px-4 py-[22px] text-verris-paper">
            <button type="button" onClick={() => setOtwarte(false)} aria-label="Zamknij menu" className="flex h-10 w-10 items-center justify-center self-end rounded-lg text-verris-stone hover:bg-verris-card hover:text-verris-paper">
              <X className="h-5 w-5" />
            </button>
            {menu}
          </aside>
          <button type="button" aria-label="Zamknij menu" className="flex-1 bg-black/55" onClick={() => setOtwarte(false)} />
        </div>
      ) : null}

      <div className="v2-content v2-skin flex min-w-0 flex-col bg-background text-foreground">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3.5 border-b border-line bg-background px-4 lg:px-8">
          <button type="button" onClick={() => setOtwarte(true)} aria-label="Otwórz menu" className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-card lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <nav aria-label="Ścieżka" className="flex min-w-0 items-center gap-2 text-[15px]">
            {sciezka.map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                {i > 0 ? <span className="text-muted-foreground">/</span> : null}
                <span className={i === sciezka.length - 1 ? (s.startsWith("#") ? "font-mono font-semibold" : "font-semibold") : "text-muted-foreground"}>{s}</span>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3.5">
            <CommandPalette />
            <StaffNotificationBell />
            <ThemeToggle />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-[22px] outline-none lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function inicjaly(session: StaffProfile): string {
  const a = session.firstName?.[0] ?? "";
  const b = session.lastName?.[0] ?? "";
  if (a || b) return `${a}${b}`.toUpperCase();
  return session.email.slice(0, 2).toUpperCase();
}
