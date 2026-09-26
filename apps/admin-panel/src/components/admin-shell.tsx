"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { CommandPalette } from "./command-palette";
import { VerrisMark } from "./verris-mark";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";
import { LogoutButton } from "./logout-button";
import { grafanaSsoHref } from "./grafana-ops-link";
import { Pigulka } from "./v2";

/** Odpowiedź `GET /admin/dashboard/menu` (null = API niedostępne — menu działa, bez liczb). */
export interface LicznikiMenu {
  wezlyUwaga: number;
  zakladane: number;
  migracje: number;
  zgloszenia: number;
  zgloszeniaPoTerminie: number;
  flota: { razem: number; dziala: number };
}

type Pod = { name: string; href: string; perm?: string };
type Pozycja = { name: string; ikona: keyof typeof IKONY; pod: Pod[]; licznik?: string; ostrzezenie?: boolean };
type Grupa = { naglowek?: string; pozycje: Pozycja[] };

/** Ikony z makiety (Main.dc.html) — 16 px, obrys. */
const IKONY = {
  pulpit: <path d="M3 11l9-7 9 7v9H3z" />,
  wezly: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
    </>
  ),
  pojemnosc: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  stos: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" />,
  kolejka: <path d="M4 6h16M4 12h10M4 18h7" />,
  migracje: <path d="M5 12h14M13 6l6 6-6 6" />,
  monitoring: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  klienci: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21c0-4 3-7 7-7s7 3 7 7" />
    </>
  ),
  uslugi: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  partnerzy: <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />,
  zgloszenia: <path d="M4 5h16v14H4zM8 9h8M8 13h5" />,
  faktury: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />,
  cenniki: <path d="M20 12l-8 8-9-9V3h8z" />,
  dziennik: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  ustawienia: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  operatorzy: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M17 11l2 2 4-4" />
    </>
  ),
};

function Ikona({ nazwa }: { nazwa: keyof typeof IKONY }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" aria-hidden="true">
      {IKONY[nazwa]}
    </svg>
  );
}

/**
 * Menu 1:1 z makiety. Strony spoza makiety nie znikają: siedzą jako zakładki pod pozycją, do której
 * należą tematycznie (np. „Kody i cenniki” = kody, plany, VPS, autoskalowanie) — widoczne nad treścią.
 */
function grupy(l: LicznikiMenu | null): Grupa[] {
  return [
    {
      pozycje: [
        {
          name: "Pulpit",
          ikona: "pulpit",
          pod: [{ name: "Pulpit", href: "/", perm: "DASHBOARD_VIEW" }],
        },
      ],
    },
    {
      naglowek: "Flota",
      pozycje: [
        {
          name: "Węzły",
          ikona: "wezly",
          licznik: l?.wezlyUwaga ? `${l.wezlyUwaga} uwaga` : undefined,
          ostrzezenie: true,
          pod: [
            { name: "Węzły", href: "/nodes", perm: "NODES_VIEW" },
            { name: "Product Ops / NOC", href: "/product-ops", perm: "NODES_VIEW" },
          ],
        },
        { name: "Pojemność floty", ikona: "pojemnosc", pod: [{ name: "Pojemność floty", href: "/nodes/capacity", perm: "NODES_VIEW" }] },
        { name: "Wersje stosu floty", ikona: "stos", pod: [{ name: "Wersje stosu floty", href: "/nodes/stack", perm: "PLANS_MANAGE" }] },
        {
          name: "Kolejka zakładania",
          ikona: "kolejka",
          licznik: l?.zakladane ? String(l.zakladane) : undefined,
          pod: [{ name: "Kolejka zakładania", href: "/provisioning-queue", perm: "PROVISIONING_MANAGE" }],
        },
        {
          name: "Migracje",
          ikona: "migracje",
          licznik: l?.migracje ? String(l.migracje) : undefined,
          pod: [{ name: "Migracje", href: "/migrations", perm: "MIGRATIONS_MANAGE" }],
        },
        {
          name: "Monitoring",
          ikona: "monitoring",
          pod: [
            { name: "Monitory (status)", href: "/status/probes", perm: "NODES_VIEW" },
            { name: "Historia incydentów", href: "/status/incidents", perm: "NODES_VIEW" },
            { name: "Błędy runtime", href: "/observability/errors", perm: "NODES_VIEW" },
          ],
        },
      ],
    },
    {
      naglowek: "Klienci i usługi",
      pozycje: [
        {
          name: "Klienci",
          ikona: "klienci",
          pod: [
            { name: "Klienci", href: "/customers", perm: "CUSTOMERS_VIEW" },
            { name: "Blokady wysyłki poczty", href: "/deliverability", perm: "CUSTOMERS_MANAGE" },
            { name: "Testy (beta)", href: "/beta", perm: "PROMO_MANAGE" },
            { name: "Newsletter / mailing", href: "/marketing", perm: "PROMO_MANAGE" },
          ],
        },
        { name: "Usługi", ikona: "uslugi", pod: [{ name: "Usługi", href: "/subscriptions", perm: "SUBSCRIPTIONS_MANAGE" }] },
        {
          name: "Resellerzy i partnerzy",
          ikona: "partnerzy",
          pod: [
            { name: "Resellerzy", href: "/resellers", perm: "CUSTOMERS_MANAGE" },
            { name: "Prowizje partnerów", href: "/partners", perm: "BILLING_VIEW" },
            { name: "Program partnerski", href: "/referral-enrollments", perm: "PROMO_MANAGE" },
          ],
        },
        {
          name: "Zgłoszenia",
          ikona: "zgloszenia",
          licznik: l?.zgloszenia ? String(l.zgloszenia) : undefined,
          ostrzezenie: (l?.zgloszeniaPoTerminie ?? 0) > 0,
          pod: [
            { name: "Zgłoszenia", href: "/tickets", perm: "TICKETS_VIEW" },
            { name: "Baza wiedzy", href: "/knowledge-base", perm: "DASHBOARD_VIEW" },
            { name: "Baza wiedzy AI", href: "/ai-knowledge", perm: "DASHBOARD_VIEW" },
          ],
        },
      ],
    },
    {
      naglowek: "Finanse",
      pozycje: [
        {
          name: "Faktury i rozliczenia",
          ikona: "faktury",
          pod: [
            { name: "Faktury", href: "/invoices", perm: "BILLING_VIEW" },
            { name: "Rozliczenia (CSV)", href: "/billing", perm: "BILLING_VIEW" },
            { name: "Metryki biznesowe", href: "/metrics", perm: "DASHBOARD_VIEW" },
            // Z-05 — zdarzenia płatności, których handler nie obsłużył.
            { name: "Webhooki Stripe", href: "/billing/webhooki", perm: "BILLING_MANAGE" },
          ],
        },
        {
          name: "Kody i cenniki",
          ikona: "cenniki",
          pod: [
            { name: "Kody promocyjne", href: "/promo-codes", perm: "PROMO_MANAGE" },
            { name: "Plany produktowe", href: "/plans", perm: "PLANS_MANAGE" },
            { name: "VPS / Cloud", href: "/vps", perm: "PLANS_MANAGE" },
            { name: "Cennik autoskalowania", href: "/autoscaling", perm: "PLANS_MANAGE" },
          ],
        },
      ],
    },
    {
      naglowek: "Bezpieczeństwo i platforma",
      pozycje: [
        {
          name: "Dziennik bezpieczeństwa",
          ikona: "dziennik",
          pod: [
            { name: "Dziennik", href: "/audit", perm: "AUDIT_VIEW" },
            { name: "Compliance (RODO)", href: "/compliance", perm: "COMPLIANCE_MANAGE" },
            { name: "VPN (dostęp paneli)", href: "/vpn", perm: "SETTINGS_MANAGE" },
          ],
        },
        {
          name: "Ustawienia platformy",
          ikona: "ustawienia",
          pod: [
            { name: "Platforma", href: "/settings/platform", perm: "SETTINGS_MANAGE" },
            { name: "Dane firmy", href: "/settings/company", perm: "SETTINGS_MANAGE" },
            { name: "Gotowość do startu", href: "/settings/live-readiness", perm: "SETTINGS_MANAGE" },
            { name: "Asystent AI", href: "/settings/ai", perm: "SETTINGS_MANAGE" },
            { name: "Opieka nad zgłoszeniami", href: "/settings/support", perm: "SETTINGS_MANAGE" },
            { name: "Szablony odpowiedzi", href: "/settings/canned-responses", perm: "SETTINGS_MANAGE" },
            { name: "Poczta (SMTP)", href: "/settings/mail", perm: "SETTINGS_MANAGE" },
            { name: "Dziennik poczty", href: "/settings/mail/log", perm: "SETTINGS_MANAGE" },
            { name: "Poczta zespołu", href: "/settings/team-mail", perm: "SETTINGS_MANAGE" },
          ],
        },
        {
          name: "Operatorzy i role",
          ikona: "operatorzy",
          pod: [
            { name: "Operatorzy", href: "/operators", perm: "STAFF_MANAGE" },
            { name: "Role i uprawnienia", href: "/roles", perm: "STAFF_MANAGE" },
          ],
        },
      ],
    },
  ];
}

/** Nazwa szczegółu w ścieżce (np. „Węzły / node-pl-01”) — ustawia ją strona komponentem <Okruszek>. */
type Szczegol = { tekst: string; mono?: boolean; dla: string } | null;
const OkruszekKontekst = createContext<(s: Szczegol) => void>(() => {});

export function Okruszek({ tekst, mono }: { tekst: string; mono?: boolean }) {
  const ustaw = useContext(OkruszekKontekst);
  const pathname = usePathname();
  useEffect(() => {
    ustaw({ tekst, mono, dla: pathname });
    return () => ustaw(null);
  }, [ustaw, tekst, mono, pathname]);
  return null;
}

/** Konto operatora (bez uprawnień) — z karty użytkownika w stopce menu. */
const KONTO: Pod[] = [
  { name: "Twoje konto", href: "/settings" },
  { name: "Bezpieczeństwo logowania", href: "/settings/security" },
];

const pasuje = (href: string, pathname: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

export function AdminShell({
  uzytkownik,
  inicjaly,
  rola,
  isAdmin,
  permissions,
  liczniki,
  children,
}: {
  uzytkownik: string;
  inicjaly: string;
  rola: string;
  isAdmin: boolean;
  permissions: string[];
  liczniki: LicznikiMenu | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const wolno = (perm?: string) => isAdmin || !perm || permissions.includes(perm);
  const menuGrupy = grupy(liczniki)
    .map((g) => ({
      ...g,
      pozycje: g.pozycje.map((p) => ({ ...p, pod: p.pod.filter((x) => wolno(x.perm)) })).filter((p) => p.pod.length > 0),
    }))
    .filter((g) => g.pozycje.length > 0);

  // Aktywna podstrona = najdłuższy pasujący adres (np. /nodes/capacity, nie /nodes; /billing/webhooki, nie /billing).
  const wszystkie = [
    ...menuGrupy.flatMap((g) => g.pozycje.flatMap((p) => p.pod.map((x) => ({ p, x })))),
    ...KONTO.map((x) => ({ p: { name: "Konto", ikona: "ustawienia" as const, pod: KONTO }, x })),
  ];
  const trafienie = wszystkie.filter((w) => pasuje(w.x.href, pathname)).sort((a, b) => b.x.href.length - a.x.href.length)[0];
  const aktywna = trafienie?.p;
  const podAktywna = trafienie?.x;

  // Pierwsza zakładka to sama pozycja menu („Węzły / node-pl-01”, nie „Węzły / Węzły / …”).
  const okruszki = [aktywna?.name ?? "Panel", ...(podAktywna && podAktywna !== aktywna?.pod[0] ? [podAktywna.name] : [])];
  const [szczegol, setSzczegol] = useState<Szczegol>(null);
  const nazwaSzczegolu = szczegol?.dla === pathname ? szczegol : null;
  if (podAktywna && pathname !== podAktywna.href) okruszki.push(nazwaSzczegolu?.tekst ?? "Szczegóły");

  const [otwarteDla, setOtwarteDla] = useState<string | null>(null);
  const otwarte = otwarteDla === pathname;
  const setOtwarte = (o: boolean) => setOtwarteDla(o ? pathname : null);
  const grafana = grafanaSsoHref();

  const menu = (
    <>
      <div className="flex items-center gap-2.5 px-1.5">
        <VerrisMark className="h-[22px] w-[22px] text-verris-mint" />
        <span className="font-display text-[22px] font-extrabold tracking-[-0.02em]">verris</span>
        <span className="ml-auto rounded-[5px] border border-verris-mint/35 px-[7px] py-[2px] font-mono text-[10.5px] tracking-[0.1em] text-verris-mint">
          CORE
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Menu panelu admina">
        {menuGrupy.map((g) => (
          <div key={g.naglowek ?? "start"} className="flex flex-col gap-0.5">
            {g.naglowek ? (
              <div className="px-3 pb-1.5 pt-2.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#7f8a83]">{g.naglowek}</div>
            ) : null}
            {g.pozycje.map((p) => {
              const on = p === aktywna;
              return (
                <Link
                  key={p.name}
                  href={p.pod[0]!.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                    on ? "bg-verris-card text-verris-paper shadow-[inset_3px_0_0_var(--verris-mint)]" : "text-verris-body hover:bg-verris-card/60 hover:text-verris-paper"
                  }`}
                >
                  <Ikona nazwa={p.ikona} />
                  {p.name}
                  {p.licznik ? (
                    <span className={`ml-auto font-mono text-[11px] ${p.ostrzezenie ? "text-[#f2b84b]" : "text-[#7f8a83]"}`}>{p.licznik}</span>
                  ) : null}
                </Link>
              );
            })}
            {g.naglowek === "Flota" && grafana && wolno("NODES_VIEW") ? (
              <a href={grafana} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-verris-body hover:bg-verris-card/60 hover:text-verris-paper">
                <Ikona nazwa="pojemnosc" />
                Grafana
                <span className="ml-auto font-mono text-[11px] text-[#7f8a83]">↗</span>
              </a>
            ) : null}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2.5 rounded-[10px] border border-verris-hairline p-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-verris-green text-[13px] font-bold">{inicjaly}</span>
        <Link href="/settings" className="flex min-w-0 flex-1 flex-col hover:text-verris-mint" title="Twoje konto">
          <span className="truncate text-sm font-semibold">{uzytkownik}</span>
          <span className="font-mono text-[11px] text-verris-stone">{rola}</span>
        </Link>
        <LogoutButton />
      </div>
    </>
  );

  // Na stronie szczegółu (np. węzła) zakładki sekcji menu chowamy — szczegół ma własne (makieta).
  const zakladki = aktywna && aktywna.pod.length > 1 && podAktywna && pathname === podAktywna.href ? aktywna.pod : null;

  return (
    <div className="grid min-h-screen grid-cols-1 bg-verris-page lg:grid-cols-[252px_minmax(0,1fr)]">
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
            {okruszki.map((s, i) => (
              <span key={`${s}-${i}`} className={`flex items-center gap-2 whitespace-nowrap ${i < okruszki.length - 1 ? "max-sm:hidden" : ""}`}>
                {i > 0 ? <span className="text-muted-foreground max-sm:hidden">/</span> : null}
                <span className={i === okruszki.length - 1 ? `font-semibold ${nazwaSzczegolu?.mono && s === nazwaSzczegolu.tekst ? "font-mono" : ""}` : "text-muted-foreground"}>{s}</span>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3.5">
            <CommandPalette />
            <span className="hidden sm:contents">
              <StatusFloty l={liczniki} />
            </span>
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>
        {zakladki ? (
          <nav aria-label={aktywna!.name} className="flex gap-1 overflow-x-auto border-b border-line px-4 lg:px-8">
            {zakladki.map((z) => {
              const on = z === podAktywna;
              return (
                <Link
                  key={z.href}
                  href={z.href}
                  aria-current={on ? "page" : undefined}
                  className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${on ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {z.name}
                </Link>
              );
            })}
          </nav>
        ) : null}
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-[26px] outline-none lg:px-8">
          <OkruszekKontekst.Provider value={setSzczegol}>{children}</OkruszekKontekst.Provider>
        </main>
      </div>
    </div>
  );
}

/** „Flota działa · 5/5” — z tych samych reguł co pulpit (sygnał, onboard, status). */
function StatusFloty({ l }: { l: LicznikiMenu | null }) {
  if (!l) return <Pigulka ton="muted">Status floty niedostępny</Pigulka>;
  const { razem, dziala } = l.flota;
  if (razem === 0) return <Pigulka ton="muted">Brak węzłów</Pigulka>;
  if (dziala === razem) return <Pigulka ton="ok">Flota działa · {dziala}/{razem}</Pigulka>;
  return <Pigulka ton={dziala === 0 ? "crit" : "warn"}>Flota · {dziala}/{razem} działa</Pigulka>;
}

