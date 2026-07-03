"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Inbox,
  LogOut,
  Users,
  UserPlus,
  BookOpen,
  Settings,
  Archive,
} from "lucide-react";
import { GrafanaOpsLink, grafanaSsoHref } from "./grafana-ops-link";
import { CommandPalette } from "./command-palette";
import { VerrisMark } from "./verris-mark";
import type { StaffProfile } from "@/lib/staff-session";
import { staffLogout } from "@/lib/staff-auth-actions";

const navItems = [
  { name: "Skrzynka", href: "/", icon: Inbox },
  { name: "Aktywne", href: "/tickets/active", icon: MessageSquare },
  { name: "Zamknięte", href: "/tickets/closed", icon: Archive },
  { name: "Klienci", href: "/crm", icon: Users },
  { name: "Program partnerski", href: "/referral-enrollments", icon: UserPlus },
  { name: "Knowledge", href: "/knowledge", icon: BookOpen },
  { name: "Ustawienia", href: "/settings", icon: Settings },
];

export function StaffShell({
  session,
  children,
}: {
  session: StaffProfile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const initials = getInitials(session);

  return (
    <div className="relative z-10 flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/5 bg-black/40 backdrop-blur-3xl shadow-2xl">
        <div className="flex h-20 items-center border-b border-white/5 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0c1a14] border border-[#34e5a0]/30 shadow-[0_0_20px_rgba(52,229,160,0.25)]">
              <VerrisMark className="h-6 w-6 text-[#f4f4ee]" />
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-white">Verris </span>
              <span className="text-sm font-bold tracking-tight text-cyan-400">Support</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                  active
                    ? "bg-cyan-500/15 font-medium text-cyan-400 border border-cyan-500/25"
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.name}
              </Link>
            );
          })}
          {grafanaSsoHref() && (
            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Monitoring
              </p>
              <div className="px-1">
                <GrafanaOpsLink session={session} />
              </div>
            </div>
          )}
        </nav>

        <div className="border-t border-white/5 p-4 bg-black/20 space-y-2">
          <form action={staffLogout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-muted-foreground hover:bg-white/[0.08] hover:text-white"
            >
              <LogOut className="h-4 w-4" /> Wyloguj
            </button>
          </form>
          <div className="flex items-center gap-3 rounded-xl px-1 py-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/25 text-xs font-bold text-cyan-300">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {[session.firstName, session.lastName].filter(Boolean).join(" ") || session.email}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{session.role}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="relative flex flex-1 flex-col pl-72">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-white/5 bg-black/30 px-8 backdrop-blur-md">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Panel BOK</p>
          <div className="ml-auto">
            <CommandPalette />
          </div>
        </header>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}

function getInitials(session: StaffProfile): string {
  const a = session.firstName?.[0] ?? "";
  const b = session.lastName?.[0] ?? "";
  if (a || b) return `${a}${b}`.toUpperCase();
  return session.email.slice(0, 2).toUpperCase();
}
