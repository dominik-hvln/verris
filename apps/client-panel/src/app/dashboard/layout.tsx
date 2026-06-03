"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "./actions";
import { fetchSidebarUser, type SidebarUser } from "./sidebar-actions";
import { ImpersonationBanner } from "./impersonation-banner";
import { getImpersonationContext } from "./impersonation-actions";
import { IncidentBanner } from "./incident-banner";
import { WalletBadge } from "./wallet-badge";
import { ReConsentModal } from "./reconsent-modal";
import { PlatformConfigLoader } from "@/components/platform-config-loader";
import { SpinBorder } from "@/components/spin-border";
import HostingAssistant from "@/components/assistant/HostingAssistant";
import {
  Menu,
  Globe,
  Database,
  Mail,
  ShieldCheck,
  HelpCircle,
  LogOut,
  Layers,
  Terminal,
  Clock,
  FolderOpen,
  Leaf,
  Users,
  UserPlus,
  Calculator,
  Settings,
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
      { name: "Menedżer plików", href: "/dashboard/file-manager", icon: FolderOpen },
      { name: "Bazy danych", href: "/dashboard/databases", icon: Database },
      { name: "Poczta e-mail", href: "/dashboard/email", icon: Mail },
      { name: "Certyfikaty SSL", href: "/dashboard/ssl", icon: ShieldCheck },
    ],
  },
  {
    label: "Zaawansowane",
    items: [
      { name: "Dostęp FTP", href: "/dashboard/ftp", icon: Terminal },
      { name: "Zadania Cron", href: "/dashboard/cron", icon: Clock },
      { name: "Migracje", href: "/dashboard/migrations", icon: Globe },
      { name: "Kalkulator", href: "/dashboard/calculator", icon: Calculator },
    ],
  },
  {
    label: "Pomoc & Konto",
    items: [
      ...(clientFeatures.eco
        ? [{ name: "Program EKO", href: "/dashboard/eco", icon: Leaf, accent: true as const }]
        : []),
      ...(clientFeatures.referral
        ? [{ name: "Program partnerski", href: "/dashboard/referral", icon: UserPlus }]
        : []),
      ...(clientFeatures.iam
        ? [{ name: "IAM i subkonta", href: "/dashboard/iam", icon: Users }]
        : []),
      { name: "Centrum Pomocy", href: "/dashboard/support", icon: HelpCircle },
      { name: "Ustawienia", href: "/dashboard/settings", icon: Settings },
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
      
      <div className={`relative flex flex-col items-center justify-center p-4 h-24 rounded-[calc(24px-1px)] bg-[#0a0a0a] z-10 transition-colors duration-300 ${isActive ? 'bg-[#0f0f0f]' : 'group-hover:bg-[#121212]'}`}>
        <div className={`p-2.5 rounded-xl border border-white/5 mb-2 transition-transform duration-300 ${isActive ? 'bg-white/10 scale-105' : 'bg-white/5 group-hover:scale-105'}`}>
          <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-neutral-400 group-hover:text-white transition-colors duration-300'}`} />
        </div>
        <span className={`text-[12px] font-medium tracking-wide transition-colors duration-300 ${isActive ? 'text-white' : 'text-neutral-400 group-hover:text-white'}`}>
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
  icon: any;
  children: React.ReactNode;
  accent?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;

  const accentIdle =
    "text-emerald-300/90 border-emerald-500/20 bg-emerald-500/[0.06] hover:bg-emerald-500/10 hover:text-emerald-200";
  const accentActive =
    "bg-emerald-500/15 text-emerald-100 font-medium border-emerald-400/30 shadow-[0_0_20px_rgba(16,185,129,0.08)]";

  return (
    <Link
      href={href}
      className={`
        group flex items-center gap-3 rounded-xl px-4 py-2.5 text-[13px] transition-all duration-300 border
        ${
          isActive
            ? accent
              ? accentActive
              : "bg-white/10 text-white font-medium border-transparent"
            : accent
              ? accentIdle
              : "text-neutral-400 hover:bg-white/5 hover:text-white border-transparent"
        }
      `}
    >
      <Icon
        className={`h-4 w-4 shrink-0 transition-colors duration-300 ${
          isActive
            ? accent
              ? "text-emerald-300"
              : "text-white"
            : accent
              ? "text-emerald-400/80 group-hover:text-emerald-300"
              : "text-neutral-500 group-hover:text-neutral-300"
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
    Promise.all([fetchSidebarUser(), getImpersonationContext()]).then(([u, imp]) => {
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
    return () => {
      cancelled = true;
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
    <div className="w-full max-w-[100vw] overflow-x-hidden bg-black font-sans text-neutral-300">
      <ImpersonationBanner />
      <IncidentBanner />
      <ReConsentModal />
      <PlatformConfigLoader />
      <div className="relative flex min-h-screen w-full max-w-full flex-col lg:flex-row">

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
        className={`fixed inset-y-0 left-0 z-[60] flex w-[300px] shrink-0 flex-col border-r border-white/5 bg-[#050505] transition-transform duration-300 max-lg:duration-300 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
          sidebarOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"
        }`}
        onClick={(e) => {
          if (window.innerWidth >= 1024) return;
          const target = e.target as HTMLElement;
          if (target.closest("a")) setSidebarOpen(false);
        }}
      >
        {/* Brand Header */}
        <div className="flex h-20 items-center gap-4 px-8 relative border-b border-white/5">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/10">
            <Layers className="text-white w-5 h-5" />
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-white">Verris</span>
            <span className="block text-[10px] text-neutral-500 font-medium tracking-[0.2em] uppercase mt-0.5">
              Client Panel
            </span>
          </div>
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
                <p className="mb-3 px-4 text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-500">
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
            <div className="relative flex items-center gap-3 rounded-[calc(24px-1px)] bg-[#0f0f0f] p-3 border border-white/5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-xs font-bold text-white border border-white/10">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{displayName}</p>
                <p className="text-[11px] text-neutral-400 truncate tracking-wide mt-0.5">
                  {user?.email || "Pro Member"}
                </p>
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded-lg p-2.5 text-neutral-400 hover:bg-white/10 hover:text-white transition-all duration-200"
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
      <div className="relative z-10 flex min-h-screen w-full min-w-0 max-w-full flex-1 flex-col">
        {/* Top Navbar — na mobile fixed (hamburger zawsze dostępny), na desktop sticky */}
        <header className="fixed inset-x-0 top-0 z-50 flex h-mobile-header min-h-14 min-w-0 items-center justify-between gap-2 border-b border-white/5 bg-black/95 px-3 backdrop-blur-xl sm:min-h-20 sm:gap-3 sm:px-6 lg:sticky lg:inset-x-auto lg:z-40 lg:h-20 lg:min-h-0 lg:bg-black/90 lg:px-8">
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
                  <HelpCircle className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Wsparcie 24/7</span>
                </div>
              </a>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="w-full min-w-0 max-w-full flex-1 overflow-x-hidden px-3 pb-4 pt-mobile-header sm:px-6 sm:pb-6 sm:pt-mobile-header lg:px-8 lg:py-8">
          {children}
        </main>

        {/* Compliance footer (Sprint 1, L-09) — minimal disclaimer because
            we use only essential cookies (auth, CSRF). No banner needed under
            ePrivacy. */}
        <footer className="mt-auto border-t border-white/5 bg-black/60 px-3 py-5 pb-safe sm:px-8 sm:py-6">
          <div className="flex flex-col gap-2 text-[11px] text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} Verris. Używamy wyłącznie niezbędnych plików
              cookies (sesja i bezpieczeństwo).
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
