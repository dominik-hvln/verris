"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ComponentType } from "react";
import { logoutAction } from "./actions";
import { fetchSidebarUser, type SidebarUser } from "./sidebar-actions";
import { pushUserData } from "@/lib/analytics-events";
import { ImpersonationBanner } from "./impersonation-banner";
import { getImpersonationContext } from "./impersonation-actions";
import { IncidentBanner } from "./incident-banner";
import { WalletBadge } from "./wallet-badge";
import { NotificationBell } from "./notification-bell";
import { ReConsentModal } from "./reconsent-modal";
import { PlatformConfigLoader } from "@/components/platform-config-loader";
import { CookiePreferencesButton } from "@/components/cookie-consent";
import { VerrisLockup } from "@/components/logo";
import {
  VerrisEkoIcon,
  VerrisProgramPartnerskiIcon,
  VerrisSupportIcon,
  VerrisUstawieniaIcon,
} from "@/components/icons";
import HostingAssistant from "@/components/assistant/HostingAssistant";
import { TipLayer } from "@/components/panel/v2";
import { ServiceNav } from "@/components/panel/service-nav";
import { ThemeToggle } from "@/components/panel/theme-toggle";
import { CommandPalette, type PaletteItem } from "@/components/panel/command-palette";
import { fetchRailDataAction, type RailData } from "./rail-actions";
import {
  Menu,
  Globe,
  LogOut,
  Users,
  Calculator,
  Server as ServerIcon,
  BookOpen,
  KeyRound,
  Megaphone,
  BarChart3,
  X,
  Plus,
  Shield,
  Bell,
  ChevronUp,
} from "lucide-react";
import { sidebarTilesFromLinks } from "@/lib/sidebar-tiles";
import { clientFeatures } from "@/lib/client-features";
import {
  canAccessDashboardRoute,
  canShowWalletBalance,
  clientNavContextFromSidebar,
} from "@/lib/client-nav-access";

// Menu boczne zawiera wyłącznie elementy GLOBALNE (konto/usługi/płatności).
// Narzędzia per-usługa (pliki, bazy, poczta, SSL, PHP, aplikacje, FTP, cron,
// kopie) żyją wewnątrz konkretnej usługi: Usługi → wybierz usługę → zakładki.
const secondaryItems = [
  {
    label: "Usługi i zasoby",
    items: [
      { name: "Migracje", href: "/dashboard/migrations", icon: Globe },
      { name: "Dodatki", href: "/dashboard/addons", icon: Calculator },
      { name: "VPS / Cloud", href: "/dashboard/vps", icon: ServerIcon },
      { name: "Reseller (white-label)", href: "/dashboard/reseller", icon: Users },
      { name: "Kalkulator", href: "/dashboard/calculator", icon: Calculator },
    ],
  },
  {
    label: "Pomoc & Konto",
    items: [
      ...(clientFeatures.eco
        ? [{ name: "Program EKO", href: "/dashboard/eco", icon: VerrisEkoIcon, accent: true as const }]
        : []),
      ...(clientFeatures.referral
        ? [{ name: "Program partnerski", href: "/dashboard/referral", icon: VerrisProgramPartnerskiIcon }]
        : []),
      ...(clientFeatures.iam
        ? [{ name: "IAM i subkonta", href: "/dashboard/iam", icon: Users }]
        : []),
      { name: "Email marketing", href: "/dashboard/email-marketing", icon: Megaphone },
      { name: "Analityka stron", href: "/dashboard/analytics", icon: BarChart3 },
      { name: "API i integracje", href: "/dashboard/api-tokens", icon: KeyRound },
      { name: "Baza wiedzy", href: "/dashboard/knowledge", icon: BookOpen },
      { name: "Ustawienia", href: "/dashboard/settings", icon: VerrisUstawieniaIcon },
    ],
  },
];

/** Wiersz menu bocznego (PB-15): aktywny = miętowa kreska po lewej. */
function NavRow({
  href,
  icon: Icon,
  children,
  count,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  children: React.ReactNode;
  count?: string | null;
}) {
  const pathname = usePathname();
  const active = href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-[5px] px-2 py-[7px] text-sm transition-colors ${
        active
          ? "bg-verris-mint/[0.08] text-verris-paper shadow-[inset_2px_0_0_var(--verris-mint)]"
          : "text-sidebar-foreground hover:bg-white/[0.04] hover:text-verris-paper"
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-verris-mint" : "opacity-70"}`} />
      {children}
      {count ? <em className="ml-auto font-mono text-[11.5px] not-italic text-verris-stone">{count}</em> : null}
    </Link>
  );
}

/** Tryb Prosty/Pełny — ten sam klucz, który czyta widok usługi (GUIDE-4). */
const SIMPLE_MODE_KEY = "verris-simple-mode";

/** Ustawia widok Prosty/Pełny i powiadamia widoki (menu użytkownika, sekcja usługi, strona usługi). */
function setPanelMode(simple: boolean) {
  try {
    localStorage.setItem(SIMPLE_MODE_KEY, simple ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("verris-mode"));
}

function UserMenu({ displayName, email, initials }: { displayName: string; email: string; initials: string }) {
  const [open, setOpen] = useState(false);
  const [simple, setSimple] = useState(false);
  useEffect(() => {
    try {
      setSimple(localStorage.getItem(SIMPLE_MODE_KEY) === "1");
    } catch {
      /* brak localStorage — pełny */
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.("[data-user-menu]")) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  useEffect(() => {
    const sync = () => {
      try {
        setSimple(localStorage.getItem(SIMPLE_MODE_KEY) === "1");
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("verris-mode", sync);
    return () => window.removeEventListener("verris-mode", sync);
  }, []);
  const setMode = (next: boolean) => {
    setSimple(next);
    setPanelMode(next);
  };
  const item = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-left text-[13.5px] text-sidebar-foreground hover:bg-white/5 hover:text-verris-paper";
  return (
    <div className="relative" data-user-menu>
      {open ? (
        <div role="menu" className="absolute inset-x-0 bottom-[calc(100%+6px)] z-10 rounded-[10px] border border-white/10 bg-[#10241b] p-1.5 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.7)]">
          <div className="flex items-center justify-between gap-2 px-2.5 pb-0.5 pt-1.5 text-[13px] text-verris-paper">
            Widok panelu
            <div className="inline-flex rounded-md border border-white/10 bg-white/[0.04] p-0.5" role="group" aria-label="Widok panelu">
              {([
                ["Prosty", true],
                ["Pełny", false],
              ] as const).map(([label, v]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={simple === v}
                  onClick={() => setMode(v)}
                  className={`rounded px-2.5 py-1 text-[12.5px] ${simple === v ? "bg-verris-mint/15 font-semibold text-verris-paper" : "text-verris-stone"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="px-2.5 pb-1 text-[11.5px] leading-snug text-verris-stone">
            {simple ? "Pokazujemy to, co najważniejsze, bez żargonu." : "Pokazujemy wszystkie narzędzia i szczegóły techniczne."}
          </p>
          <hr className="my-1 border-white/10" />
          <Link href="/dashboard/settings" className={item} role="menuitem" onClick={() => setOpen(false)}>
            <VerrisUstawieniaIcon className="h-4 w-4 opacity-70" /> Ustawienia konta
          </Link>
          <Link href="/dashboard/settings?tab=security" className={item} role="menuitem" onClick={() => setOpen(false)}>
            <Shield className="h-4 w-4 opacity-70" /> Bezpieczeństwo i logowanie
          </Link>
          {clientFeatures.iam ? (
            <Link href="/dashboard/iam" className={item} role="menuitem" onClick={() => setOpen(false)}>
              <Users className="h-4 w-4 opacity-70" /> Zespół i dostęp
            </Link>
          ) : null}
          <Link href="/dashboard/settings?tab=notifications" className={item} role="menuitem" onClick={() => setOpen(false)}>
            <Bell className="h-4 w-4 opacity-70" /> Powiadomienia
          </Link>
          <CookiePreferencesButton className={item} />
          <hr className="my-1 border-white/10" />
          <form action={logoutAction}>
            <button type="submit" className={`${item} text-rose-300 hover:text-rose-200`} role="menuitem">
              <LogOut className="h-4 w-4" /> Wyloguj
            </button>
          </form>
        </div>
      ) : null}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="v2-comet v2-comet-soft flex w-full items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-left hover:border-verris-mint/30"
        style={{ ["--v2-k" as string]: "v2-comet-a", ["--v2-d" as string]: "11s", ["--v2-dl" as string]: "-8s", ["--v2-o" as string]: 0.5 }}
      >
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-gradient-to-br from-verris-green to-verris-mint font-display text-xs font-extrabold text-verris-pine">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[13.5px] font-semibold text-verris-paper">{displayName}</b>
          <small className="block truncate font-mono text-[11.5px] text-verris-stone">
            {email ? `${email} · ` : ""}widok {simple ? "prosty" : "pełny"}
          </small>
        </span>
        <ChevronUp className={`h-4 w-4 flex-none text-verris-stone transition-transform ${open ? "" : "rotate-180"}`} />
      </button>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SidebarUser | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navCtx = clientNavContextFromSidebar(user);
  const canAccess = (href: string) =>
    navCtx ? canAccessDashboardRoute(href, navCtx) : false;
  const mainGridItems = sidebarTilesFromLinks(user?.sidebarQuickLinks, navCtx);
  const mainGridHrefs = new Set<string>(mainGridItems.map((i) => i.href));
  const navSecondaryItems = secondaryItems
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => canAccess(item.href) && !mainGridHrefs.has(item.href),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const showWallet =
    !navCtx ||
    canShowWalletBalance(navCtx);
  const showSupportLink = canAccess("/dashboard/support");

  useEffect(() => {
    let cancelled = false;
    const loadUser = () => {
      void Promise.all([fetchSidebarUser(), getImpersonationContext()]).then(([u, imp]) => {
        if (cancelled) return;
        setImpersonating(Boolean(imp?.isImpersonating));
        setUserLoading(false);
        if (!u) {
          void logoutAction();
          return;
        }
        setUser(u);
        // Enhanced Conversions / Advanced Matching: ustawiamy zahaszowany e-mail RAZ,
        // po zalogowaniu, żeby był w dataLayer zanim odpali się jakakolwiek konwersja
        // (purchase/sign_up/lead). pushUserData samo sprawdza zgodę marketingową i hashuje
        // SHA-256 — bez zgody jest no-opem, a przy jej wycofaniu applyConsent czyści user_data.
        if (u?.email) void pushUserData(u.email);
        const root = document.documentElement;
        if (u?.isEcoProgramParticipant) root.classList.add("eco-tint");
        else root.classList.remove("eco-tint");
      });
    };
    loadUser();
    // Pozwala odświeżyć saldo/usera bez nawigacji (np. po zakupie dodatku):
    // dowolny komponent woła window.dispatchEvent(new Event("wallet:refresh")).
    window.addEventListener("wallet:refresh", loadUser);
    return () => {
      cancelled = true;
      window.removeEventListener("wallet:refresh", loadUser);
    };
  }, [pathname]);

  useEffect(() => {
    if (!navCtx || !pathname.startsWith("/dashboard")) return;
    if (!canAccessDashboardRoute(pathname, navCtx)) {
      router.replace("/dashboard");
    }
  }, [navCtx, pathname, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Liczniki w menu i lista usług do wyszukiwarki — błąd = brak licznika (nie zero).
  const [rail, setRail] = useState<RailData | null>(null);
  useEffect(() => {
    void fetchRailDataAction().then(setRail).catch(() => undefined);
  }, []);
  const railCount = (href: string): string | null => {
    if (!rail) return null;
    if (href === "/dashboard/services") return rail.services ? String(rail.services.length) : null;
    if (href === "/dashboard/domains")
      return rail.domainsExpiring ? `${rail.domainsExpiring} wygasa` : rail.domains != null ? String(rail.domains) : null;
    if (href === "/dashboard/support") return rail.openTickets ? `${rail.openTickets} otwarte` : null;
    return null;
  };
  const serviceId = /^\/dashboard\/services\/([0-9a-f-]{36})(?:\/|$)/.exec(pathname)?.[1] ?? null;
  const paletteItems: PaletteItem[] = [
    ...mainGridItems.map((i) => ({ label: i.name, hint: "strona", href: i.href })),
    ...navSecondaryItems.flatMap((g) => g.items).map((i) => ({ label: i.name, hint: "strona", href: i.href })),
    ...(rail?.services ?? []).map((sv) => ({
      label: sv.domain ? `${sv.name} · ${sv.domain}` : sv.name,
      hint: "usługa",
      href: `/dashboard/services/${sv.id}?kind=${sv.kind}`,
    })),
    { label: "Zamów nową usługę", hint: "akcja", href: "/dashboard/services/new" },
    { label: "Kup domenę", hint: "akcja", href: "/dashboard/domains/buy" },
    { label: "Doładuj portfel", hint: "płatności", href: "/dashboard/billing" },
    { label: "Faktury", hint: "płatności", href: "/dashboard/billing/invoices" },
    { label: "Nowe zgłoszenie do pomocy", hint: "pomoc", href: "/dashboard/support/new" },
    { label: "Przenieś stronę od innego hostingu", hint: "migracja", href: "/dashboard/migrations" },
    { label: "Ustawienia konta", hint: "konto", href: "/dashboard/settings" },
    { label: "Bezpieczeństwo i logowanie", hint: "konto", href: "/dashboard/settings?tab=security" },
    { label: "Widok prosty", hint: "widok", run: () => setPanelMode(true) },
    { label: "Widok pełny (szczegóły techniczne)", hint: "widok", run: () => setPanelMode(false) },
  ];

  const displayName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.email || "Użytkownik";

  const initials =
    user?.firstName && user?.lastName
      ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
      : user?.email?.[0]?.toUpperCase() || "A";

  return (
    <div className="w-full max-w-[100vw] bg-background font-sans text-sidebar-foreground">
      <ImpersonationBanner />
      <IncidentBanner />
      <ReConsentModal />
      <PlatformConfigLoader />
      <div className="relative flex min-h-screen w-full max-w-full flex-col lg:flex-row lg:items-start">

      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Zamknij menu"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* Sidebar: drawer na mobile, stały panel na desktop (lg+) */}
      <aside
        className={`max-lg:fixed max-lg:inset-y-0 max-lg:left-0 z-[60] flex w-[300px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 max-lg:duration-300 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:max-h-screen lg:self-start lg:translate-x-0 ${
          sidebarOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"
        }`}
        onClick={(e) => {
          if (window.innerWidth >= 1024) return;
          const target = e.target as HTMLElement;
          if (target.closest("a")) setSidebarOpen(false);
        }}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center px-5">
          <Link href="/dashboard" aria-label="Pulpit">
            <VerrisLockup size="sm" />
          </Link>
          <button
            type="button"
            className="ml-auto rounded-md border border-white/10 p-2 text-neutral-300 hover:bg-white/10 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Zamknij menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nawigacja — przewija się, box użytkownika zostaje przypięty na dole */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 [mask-image:linear-gradient(#000_calc(100%-18px),transparent)]">
          <nav className="flex flex-col gap-px" aria-label="Główne">
            {mainGridItems.map((item) => (
              <NavRow key={item.href} href={item.href} icon={item.icon} count={railCount(item.href)}>
                {item.name}
              </NavRow>
            ))}
            {showSupportLink && !mainGridHrefs.has("/dashboard/support") ? (
              <NavRow href="/dashboard/support" icon={VerrisSupportIcon} count={railCount("/dashboard/support")}>
                Centrum pomocy
              </NavRow>
            ) : null}
            <NotificationBell variant="row" />
          </nav>

          {serviceId ? (
            <Suspense fallback={null}>
              <ServiceNav serviceId={serviceId} name={rail?.services?.find((x) => x.id === serviceId)?.name} />
            </Suspense>
          ) : null}

          {navSecondaryItems.length > 0 ? (
            <details className="group/more mt-5" open={navSecondaryItems.some((g) => g.items.some((i) => pathname.startsWith(i.href)))}>
              <summary className="flex cursor-pointer list-none items-center justify-between px-2 pb-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-verris-stone [&::-webkit-details-marker]:hidden">
                Więcej
                <Plus className="h-3 w-3 transition-transform group-open/more:rotate-45" />
              </summary>
              <nav className="flex flex-col gap-px" aria-label="Więcej">
                {navSecondaryItems.flatMap((group) => group.items).map((item) => (
                  <NavRow key={item.href} href={item.href} icon={item.icon}>
                    {item.name}
                  </NavRow>
                ))}
              </nav>
            </details>
          ) : null}
        </div>

        {/* Box użytkownika — zawsze widoczny */}
        <div className="shrink-0 border-t border-sidebar-border p-3">
          <UserMenu displayName={displayName} email={user?.email ?? ""} initials={initials} />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="v2-content v2-skin relative z-10 flex bg-background text-foreground min-h-screen w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
        {/* Top Navbar — na mobile fixed (hamburger zawsze dostępny), na desktop sticky */}
        <header className="z-50 flex min-h-14 min-w-0 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-xl max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:h-mobile-header sm:gap-3 sm:px-6 lg:sticky lg:top-0 lg:z-40 lg:h-[61px] lg:bg-background/90 lg:px-7 lg:py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              className="inline-flex rounded-md border border-line p-2 text-muted-foreground hover:bg-raised lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Otwórz menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="ml-auto flex min-w-0 items-center">
              <CommandPalette items={paletteItems} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            {showWallet && (
              <WalletBadge
                balance={user?.walletBalance ?? null}
                loading={userLoading && user === null}
                impersonating={impersonating}
              />
            )}
          </div>
        </header>

        {/* Page Content */}
        <main
          id="main"
          className="w-full min-w-0 max-w-full flex-1 overflow-x-hidden px-3 pb-4 max-lg:pt-mobile-header sm:px-6 sm:pb-6 lg:px-10 lg:pb-12 lg:pt-10"
        >
          {children}
        </main>

        {/* Compliance footer (L-09) — cookie consent managed by
            CookieConsentManager (root layout); the button below reopens
            the preferences modal, as required by Polityka cookies §3. */}
        <footer className="mt-auto border-t border-white/5 bg-black/60 px-3 py-5 pb-safe sm:px-8 sm:py-6">
          <div className="flex flex-col gap-2 text-[11px] text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Verris — hosting, który liczy realne zużycie.</p>
            <nav className="flex flex-wrap gap-x-4 gap-y-1">
              <a href="/legal/terms" className="hover:text-neutral-300">
                Regulamin
              </a>
              <a href="/legal/privacy" className="hover:text-neutral-300">
                Polityka prywatności
              </a>
              <a href="/legal/cookies" className="hover:text-neutral-300">
                Cookies
              </a>
              <a href="/legal/dpa" className="hover:text-neutral-300">
                DPA
              </a>
              <CookiePreferencesButton className="hover:text-neutral-300" />
              <a href="mailto:rodo@verris.pl" className="hover:text-neutral-300">
                rodo@verris.pl
              </a>
            </nav>
          </div>
        </footer>
        {/* Dymki w kolumnie treści — dziedziczą motyw (jasny: ciemny dymek, jak we wzorcu). */}
        <TipLayer />
      </div>
      </div>
      <HostingAssistant />
    </div>
  );
}
