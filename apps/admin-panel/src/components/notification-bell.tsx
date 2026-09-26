"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AdminNotification,
} from "@/lib/notifications-actions";

const POLL_MS = 45_000;

function dotColor(sev: string): string {
  if (sev === "critical") return "bg-rose-400";
  if (sev === "warning") return "bg-amber-400";
  return "bg-cyan-400";
}

export function NotificationBell() {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Stan ustawiany w `.then`, nie po `await` — lint React Compilera nie śledzi
  // `await` w useCallback i brałby to za synchroniczny setState w efekcie.
  const refresh = useCallback(
    () =>
      listNotifications().then((res) => {
        setItems(res.items);
        setUnread(res.unread);
      }),
    [],
  );

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  async function markAll() {
    await markAllNotificationsRead();
    await refresh();
  }

  async function onItemClick(n: AdminNotification) {
    if (!n.read) {
      await markNotificationRead(n.id);
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    setOpen(false);
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-[38px] w-[38px] items-center justify-center rounded-[9px] border border-line-strong bg-transparent text-foreground hover:border-primary"
        aria-label="Powiadomienia"
        title="Powiadomienia"
      >
        <Bell className="h-[17px] w-[17px]" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-crit px-1 text-[10px] font-bold text-verris-paper">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-[80] mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-popover shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <span className="text-xs font-semibold text-white">Powiadomienia</span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                className="text-[11px] text-cyan-300 hover:text-cyan-200"
              >
                Oznacz wszystkie
              </button>
            ) : null}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-neutral-500">Brak powiadomień.</p>
            ) : (
              items.map((n) => {
                const inner = (
                  <div
                    className={`flex gap-2.5 border-b border-white/5 px-4 py-3 ${
                      n.read ? "opacity-60" : "bg-white/[0.03]"
                    } hover:bg-white/[0.06]`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor(n.severity)}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white">{n.title}</p>
                      <p className="truncate text-xs text-neutral-400">{n.body}</p>
                      <p className="mt-0.5 text-[10px] text-neutral-600">
                        {new Date(n.createdAt).toLocaleString("pl-PL")}
                      </p>
                    </div>
                  </div>
                );
                return n.link ? (
                  <Link key={n.id} href={n.link} onClick={() => void onItemClick(n)} className="block">
                    {inner}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => void onItemClick(n)}
                    className="block w-full text-left"
                  >
                    {inner}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
