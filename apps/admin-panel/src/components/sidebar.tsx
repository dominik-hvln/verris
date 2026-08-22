"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Server,
  DollarSign,
  Activity,
  ShieldAlert,
  Gauge,
  Radio,
  Siren,
  Ticket,
  Tag,
  UserPlus,
  Scale,
  Box,
  ListChecks,
  Settings,
  Rocket,
  Mail,
  Brain,
  BookOpen,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { GrafanaOpsLink } from "./grafana-ops-link";
import { VerrisMark } from "./verris-mark";

type NavItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }>; perm?: string };
type NavGroup = { label: string; items: NavItem[] };

const adminNavItems: NavGroup[] = [
  {
    label: "Zarządzanie Corem",
    items: [
      { name: "Pulpit", href: "/", icon: LayoutDashboard, perm: "DASHBOARD_VIEW" },
      { name: "Metryki biznesowe", href: "/metrics", icon: Gauge, perm: "DASHBOARD_VIEW" },
      { name: "Węzły & serwery", href: "/nodes", icon: Server, perm: "NODES_VIEW" },
      { name: "Pojemność floty", href: "/nodes/capacity", icon: Gauge, perm: "NODES_VIEW" },
      { name: "Plany produktowe", href: "/plans", icon: Box, perm: "PLANS_MANAGE" },
      { name: "VPS / Cloud", href: "/vps", icon: Server, perm: "PLANS_MANAGE" },
      { name: "Subskrypcje i usługi", href: "/subscriptions", icon: Activity, perm: "SUBSCRIPTIONS_MANAGE" },
      { name: "Kolejka provisioningu", href: "/provisioning-queue", icon: ListChecks, perm: "PROVISIONING_MANAGE" },
      { name: "Migracje (cockpit)", href: "/migrations", icon: ListChecks, perm: "MIGRATIONS_MANAGE" },
      { name: "Product Ops / NOC", href: "/product-ops", icon: Rocket, perm: "NODES_VIEW" },
      { name: "Baza wiedzy AI", href: "/ai-knowledge", icon: Brain, perm: "DASHBOARD_VIEW" },
      { name: "Baza wiedzy (CMS)", href: "/knowledge-base", icon: BookOpen, perm: "DASHBOARD_VIEW" },
    ],
  },
  {
    label: "Status Page",
    items: [
      { name: "Probes (Monitory)", href: "/status/probes", icon: Radio, perm: "NODES_VIEW" },
      { name: "Historia Incydentów", href: "/status/incidents", icon: Siren, perm: "NODES_VIEW" },
    ],
  },
  {
    label: "Operacje",
    items: [
      { name: "Klienci", href: "/customers", icon: Users, perm: "CUSTOMERS_VIEW" },
      { name: "Program partnerski", href: "/referral-enrollments", icon: UserPlus, perm: "PROMO_MANAGE" },
      { name: "Prowizje partnerów", href: "/partners", icon: DollarSign, perm: "BILLING_VIEW" },
      { name: "Resellerzy (white-label)", href: "/resellers", icon: Users, perm: "CUSTOMERS_MANAGE" },
      { name: "Operatorzy", href: "/operators", icon: ShieldAlert, perm: "STAFF_MANAGE" },
      { name: "Role i uprawnienia", href: "/roles", icon: ShieldCheck, perm: "STAFF_MANAGE" },
      { name: "Tickety", href: "/tickets", icon: Ticket, perm: "TICKETS_VIEW" },
      { name: "Faktury", href: "/invoices", icon: DollarSign, perm: "BILLING_VIEW" },
      { name: "Rozliczenia (CSV)", href: "/billing", icon: DollarSign, perm: "BILLING_VIEW" },
      // Z-05 — zdarzenia płatności, których handler nie obsłużył. Bez tego
      // wpisu strona istniałaby, ale trafiłby na nią tylko ten, kto zna adres —
      // czyli w praktyce nikt o drugiej w nocy.
      { name: "Webhooki Stripe", href: "/billing/webhooki", icon: DollarSign, perm: "BILLING_MANAGE" },
      { name: "Kody promocyjne", href: "/promo-codes", icon: Tag, perm: "PROMO_MANAGE" },
      { name: "Newsletter / mailing", href: "/marketing", icon: Mail, perm: "PROMO_MANAGE" },
      { name: "Compliance (RODO)", href: "/compliance", icon: Scale, perm: "COMPLIANCE_MANAGE" },
      { name: "Cennik autoskalowania", href: "/autoscaling", icon: Gauge, perm: "PLANS_MANAGE" },
      { name: "Logi bezpieczeństwa", href: "/audit", icon: ShieldAlert, perm: "AUDIT_VIEW" },
      { name: "VPN (dostęp paneli)", href: "/vpn", icon: Lock, perm: "SETTINGS_MANAGE" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { name: "Grafana (storage & backupy)", href: "__grafana__", icon: Activity, perm: "NODES_VIEW" },
      { name: "Błędy runtime", href: "/observability/errors", icon: Siren, perm: "NODES_VIEW" },
    ],
  },
  {
    label: "Konto",
    items: [
      { name: "Ustawienia", href: "/settings", icon: Settings },
      { name: "Ustawienia platformy", href: "/settings/platform", icon: Gauge, perm: "SETTINGS_MANAGE" },
      { name: "Poczta (SMTP)", href: "/settings/mail", icon: Mail, perm: "SETTINGS_MANAGE" },
      { name: "Dziennik poczty", href: "/settings/mail/log", icon: Mail, perm: "SETTINGS_MANAGE" },
      { name: "Poczta zespołu", href: "/settings/team-mail", icon: Mail, perm: "SETTINGS_MANAGE" },
    ],
  },
];

function NavLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || (pathname.startsWith(href) && href !== "/");

  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-300 ${
        isActive
          ? "bg-indigo-500/15 text-indigo-400 font-medium border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]"
          : "text-muted-foreground hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon
        className={`h-4 w-4 shrink-0 transition-colors ${
          isActive
            ? "text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]"
            : "text-muted-foreground group-hover:text-white"
        }`}
      />
      {children}
    </Link>
  );
}

interface AdminSidebarProps {
  userInitials: string;
  userLabel: string;
  logoutButton: React.ReactNode;
  isAdmin?: boolean;
  permissions?: string[];
  roleName?: string | null;
}

export function AdminSidebar({ userInitials, userLabel, logoutButton, isAdmin = true, permissions = [], roleName = null }: AdminSidebarProps) {
  const allowed = (perm?: string) => isAdmin || !perm || permissions.includes(perm);
  const groups = adminNavItems
    .map((g) => ({ ...g, items: g.items.filter((i) => allowed(i.perm)) }))
    .filter((g) => g.items.length > 0);
  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/5 bg-black/40 backdrop-blur-3xl shadow-2xl">
      <div className="flex h-20 items-center gap-3 border-b border-white/5 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0c1a14] border border-[#34e5a0]/30 shadow-[0_0_20px_rgba(52,229,160,0.25)]">
          <VerrisMark className="h-6 w-6 text-[#f4f4ee]" />
        </div>
        <div>
          <span className="text-sm font-bold tracking-tight text-white drop-shadow-md">
            Verris <span className="text-indigo-400">Core</span>
          </span>
          <span className="block text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
            Centrala Dowodzenia
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-8">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-[#71717A]">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) =>
                item.href === "__grafana__" ? (
                  <div key={item.name} className="px-1">
                    <GrafanaOpsLink />
                  </div>
                ) : (
                  <NavLink key={item.href} href={item.href} icon={item.icon}>
                    {item.name}
                  </NavLink>
                ),
              )}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 p-4 bg-black/20">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2 bg-white/5 border border-white/5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-xs font-bold text-indigo-400">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{userLabel}</p>
            <p className="text-[11px] text-indigo-400 truncate flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" />
              {isAdmin ? "Administrator" : roleName || "Operator"}
            </p>
          </div>
          {logoutButton}
        </div>
      </div>
    </aside>
  );
}
