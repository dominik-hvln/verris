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
  Lock,
} from "lucide-react";
import { GrafanaOpsLink } from "./grafana-ops-link";

const adminNavItems = [
  {
    label: "Zarządzanie Corem",
    items: [
      { name: "Pulpit", href: "/", icon: LayoutDashboard },
      { name: "Węzły & serwery", href: "/nodes", icon: Server },
      { name: "Plany produktowe", href: "/plans", icon: Box },
      { name: "Subskrypcje i usługi", href: "/subscriptions", icon: Activity },
      { name: "Kolejka provisioningu", href: "/provisioning-queue", icon: ListChecks },
      { name: "Product Ops / NOC", href: "/product-ops", icon: Rocket },
      { name: "Baza wiedzy AI", href: "/ai-knowledge", icon: Brain },
    ],
  },
  {
    label: "Status Page",
    items: [
      { name: "Probes (Monitory)", href: "/status/probes", icon: Radio },
      { name: "Historia Incydentów", href: "/status/incidents", icon: Siren },
    ],
  },
  {
    label: "Operacje",
    items: [
      { name: "Klienci", href: "/customers", icon: Users },
      { name: "Program partnerski", href: "/referral-enrollments", icon: UserPlus },
      { name: "Operatorzy", href: "/operators", icon: ShieldAlert },
      { name: "Tickety", href: "/tickets", icon: Ticket },
      { name: "Faktury", href: "/invoices", icon: DollarSign },
      { name: "Rozliczenia (CSV)", href: "/billing", icon: DollarSign },
      { name: "Kody promocyjne", href: "/promo-codes", icon: Tag },
      { name: "Compliance (RODO)", href: "/compliance", icon: Scale },
      { name: "Cennik autoskalowania", href: "/autoscaling", icon: Gauge },
      { name: "Logi bezpieczeństwa", href: "/audit", icon: ShieldAlert },
      { name: "VPN (dostęp paneli)", href: "/vpn", icon: Lock },
    ],
  },
  {
    label: "Monitoring",
    items: [{ name: "Grafana (storage & backupy)", href: "__grafana__", icon: Activity }],
  },
  {
    label: "Konto",
    items: [
      { name: "Ustawienia", href: "/settings", icon: Settings },
      { name: "Ustawienia platformy", href: "/settings/platform", icon: Gauge },
      { name: "Poczta (SMTP)", href: "/settings/mail", icon: Mail },
      { name: "Poczta zespołu", href: "/settings/team-mail", icon: Mail },
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
}

export function AdminSidebar({ userInitials, userLabel, logoutButton }: AdminSidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/5 bg-black/40 backdrop-blur-3xl shadow-2xl">
      <div className="flex h-20 items-center gap-3 border-b border-white/5 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 border border-white/10 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
          <ShieldAlert className="h-5 w-5 text-white" />
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
        {adminNavItems.map((group) => (
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
              Superadmin
            </p>
          </div>
          {logoutButton}
        </div>
      </div>
    </aside>
  );
}
