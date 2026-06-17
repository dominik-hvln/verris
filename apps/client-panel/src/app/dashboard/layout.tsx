"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { logoutAction } from "./actions";
import { fetchSidebarUser, type SidebarUser } from "./sidebar-actions";
import { ImpersonationBanner } from "./impersonation-banner";
import { getImpersonationContext } from "./impersonation-actions";
import { IncidentBanner } from "./incident-banner";
import { WalletBadge } from "./wallet-badge";
import { ReConsentModal } from "./reconsent-modal";
import { PlatformConfigLoader } from "@/components/platform-config-loader";
import { SpinBorder } from "@/components/spin-border";
import { VerrisLockup, VerrisMark } from "@/components/logo";
import {
  VerrisBazyDanychIcon,
  VerrisCronIcon,
  VerrisDomenyIcon,
  VerrisEkoIcon,
  VerrisFtpIcon,
  VerrisManagerPlikowIcon,
  VerrisPocztaIcon,
  VerrisProgramPartnerskiIcon,
  VerrisSslIcon,
  VerrisSupportIcon,
  VerrisUstawieniaIcon,
} from "@/components/icons";
import HostingAssistant from "@/components/assistant/HostingAssistant";
import {
  Menu,
  Globe,
  LogOut,
  Users,
  Calculator,
  Server as ServerIcon,
  X,
} from "lucide-react";
import { sidebarTilesFromLinks, type SidebarTileDef } from "@/lib/sidebar-tiles";
import { clientFeatures } from "@/lib/client-features";
import {
  canAccessDashboardRoute,
  canShowWalletBalance,
  clientNavContextFromSidebar,
} from "@/lib/client-nav-access";

const secondaryItems = [
  {
    label: "Zarządzanie",
    items: [
      { name: "Menedżer plików", href: "/dashboard/file-manager", icon: VerrisManagerPlikowIcon },
      { name: "Bazy danych", href: "/dashboard/databases", icon: VerrisBazyDanychIcon },
      { name: "Poczta e-mail", href: "/dashboard/email", icon: VerrisPocztaIcon },
      { name: "Certyfikaty SSL", href: "/dashboard/ssl", icon: VerrisSslIcon },
      { name: "Wersja PHP", href: "/dashboard/php", icon: ServerIcon },
      { name: "Aplikacje 1-click", href: "/dashboard/apps", icon: ServerIcon },
    ],
  },
  {
    label: "Zaawansowane",
    items: [
      { name: "Dostęp FTP", href: "/dashboard/ftp", icon: VerrisFtpIcon },
      { name: "Zadania Cron", href: "/dashboard/cron", icon: VerrisCronIcon },
      { name: "Migracje", href: "/dashboard/migrations", icon: Globe },
      { name: "Dodatki", href: "/dashboard/addons", icon: Calculator },
      { name: "VPS / Cloud", href: "/dashboard/vps", icon: ServerIcon },
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
      { name: "Centrum Pomocy", href: "/dashboard/support", icon: VerrisSupportIcon },
      { name: "Ustawienia", href: "/dashboard/settings", icon: VerrisUstawieniaIcon },
    ],
  },
];

function GridLink({ item }: { item: SidebarTileDef }) {
  const pathname = usePathname();
  const isActive = pathname === item.href;
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className="relative block rounded-[24px] p-px overflow-hidden group hover:-translate-y-0.5 transition-transform duration-300"
    >
      <SpinBorder
        className={`opacity-0 transition-opacity duration-[1500ms] ${isActive ? "opacity-35" : "group-hover:opacity-25"}`}
      />
      
      <div className={`relative z-10 flex h-24 flex-col items-center justify-center rounded-[calc(24px-1px)] bg-verris-page p-4 transition-colors duration-300 ${isActive ? "bg-verris-card" : "group-hover:bg-verris-pine"}`}>
        <div className={`mb-2 rounded-xl border border-verris-hairline p-2.5 transition-transform duration-300 ${isActive ? "scale-105 bg-verris-mint/10" : "bg-verris-pine/40 group-hover:scale-105"}`}>
          <Icon className={`h-5 w-5 transition-colors duration-300 ${isActive ? "text-verris-mint" : "text-verris-stone group-hover:text-verris-paper"}`} />
        </div>
        <span className={`text-[12px] font-medium tracking-wide transition-colors duration-300 ${isActive ? "text-verris-paper" : "text-verris-stone group-hover:text-verris-paper"}`}>
          {item.name}
        </span>
      </div>
    </Link>
  );
}

function ListLink({
  href,
  icon: Icon,
  children,
  accent = false,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  children: React.ReactNode;
  accent?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;

  const accentIdle =
    "border-eko/40 bg-eko-bg/60 text-eko-foreground hover:bg-eko-bg hover:border-eko";
  const accentActive =
    "border-l-2 border-l-accent bg-sidebar-accent font-medium text-sidebar-accent-foreground border-eko/30";

  return (
    <Link
      href={href}
      className={`
        group flex items-center gap-3 rounded-xl border border-transparent px-4 py-2.5 text-[13px] transition-all duration-300
        ${
          isActive
            ? accent
              ? accentActive
              : "border-l-2 border-l-accent bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : accent
              ? accentIdle
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        }
      `}
    >
      <Icon
        className={`h-4 w-4 shrink-0 transition-colors duration-300 ${
          isActive ? "text-accent" : accent ? "text-eko-foreground" : "text-muted-foreground group-hover:text-sidebar-accent-foreground"
        }`}
      />
      {children}
    </Link>
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
        {/* Brand Header */}
        <div className="relative flex h-[5.5rem] shrink-0 items-center border-b border-sidebar-border px-6">
          <VerrisLockup size="sm" />
          <button
            type="button"
            className="ml-auto rounded-lg border border-white/10 p-2 text-neutral-300 hover:bg-white/10 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Zamknij menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 overflow-y-auto px-5 py-6 scrollbar-none">
          {/* Tiled Grid Navigation */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            {mainGridItems.map((item) => (
              <GridLink key={item.href} item={item} />
            ))}
          </div>

          {/* Secondary Classic List */}
          <nav className="space-y-8">
            {navSecondaryItems.map((group) => (
              <div key={group.label}>
                <p className="mb-3 px-4 text-[10px] font-bold uppercase tracking-[0.15em] text-verris-stone">
                  {group.label}
                </p>
                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <ListLink
                      key={item.href}
                      href={item.href}
                      icon={item.icon}
                      accent={"accent" in item && item.accent === true}
                    >
                      {item.name}
                    </ListLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Premium Floating User Card */}
        <div className="p-5">
          <div className="relative rounded-[24px] p-px overflow-hidden group">
            <SpinBorder variant="white" className="opacity-20" />
            <div className="relative flex items-center gap-3 rounded-[calc(24px-1px)] border border-verris-hairline bg-verris-card p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-verris-hairline bg-verris-pine text-xs font-bold text-verris-paper">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-verris-paper">{displayName}</p>
                <p className="mt-0.5 truncate text-[11px] tracking-wide text-verris-stone">
                  {user?.email || "Pro Member"}
                </p>
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded-lg p-2.5 text-verris-stone transition-all duration-200 hover:bg-verris-pine/60 hover:text-verris-paper"
                  title="Wyloguj się"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="relative z-10 flex min-h-screen w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
        {/* Top Navbar — na mobile fixed (hamburger zawsze dostępny), na desktop sticky */}
        <header className="z-50 flex min-h-14 min-w-0 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-xl max-lg:fixed max-lg:inset-x-0 max-lg:top-0 max-lg:h-mobile-header sm:min-h-[5rem] sm:gap-4 sm:px-6 lg:sticky lg:top-0 lg:z-40 lg:h-dashboard-topbar lg:bg-background/90 lg:px-10 lg:py-5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              className="inline-flex rounded-lg border border-white/10 p-2 text-neutral-300 hover:bg-white/10 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Otwórz menu"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {showWallet && (
              <WalletBadge
                balance={user?.walletBalance ?? null}
                loading={userLoading && user === null}
                impersonating={impersonating}
              />
            )}
            {showSupportLink && (
              <a
                href="/dashboard/support"
                title="Wsparcie 24/7"
                className="group relative inline-flex overflow-hidden rounded-[24px] p-px"
              >
                <SpinBorder variant="white" className="opacity-40 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative flex items-center gap-2 rounded-[calc(24px-1px)] bg-[#0a0a0a] px-2.5 py-2 text-xs font-medium text-neutral-300 transition-colors hover:text-white sm:px-5">
                  <VerrisSupportIcon className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Wsparcie 24/7</span>
                </div>
              </a>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="w-full min-w-0 max-w-full flex-1 overflow-x-hidden px-3 pb-4 max-lg:pt-mobile-header sm:px-6 sm:pb-6 lg:px-10 lg:pb-12 lg:pt-10">
          {children}
        </main>

        {/* Compliance footer (Sprint 1, L-09) — minimal disclaimer because
            we use only essential cookies (auth, CSRF). No banner needed under
            ePrivacy. */}
        <footer className="mt-auto border-t border-white/5 bg-black/60 px-3 py-5 pb-safe sm:px-8 sm:py-6">
          <div className="flex flex-col gap-2 text-[11px] text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} Verris — hosting, który liczy realne zużycie.
              Używamy wyłącznie niezbędnych plików cookies (sesja i bezpieczeństwo).
            </p>
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
              <a href="mailto:rodo@verris.pl" className="hover:text-neutral-300">
                rodo@verris.pl
              </a>
            </nav>
          </div>
        </footer>
      </div>
      </div>
      <HostingAssistant />
    </div>
  );
}
