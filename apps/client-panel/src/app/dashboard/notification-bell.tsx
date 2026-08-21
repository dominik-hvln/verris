'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Check, Loader2 } from 'lucide-react';
import {
  fetchNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  type NotificationItem,
} from './notifications-actions';

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-400',
  warning: 'bg-amber-400',
  info: 'bg-cyan-400',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'przed chwilą';
  if (m < 60) return `${m} min temu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} godz. temu`;
  const d = Math.floor(h / 24);
  return `${d} dni temu`;
}

/** NTF-2 — dzwonek powiadomień w nagłówku panelu klienta. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchNotificationsAction();
      setItems(res.items);
      setUnread(res.unread);
    } finally {
      setLoading(false);
    }
  }, []);

  // Pierwszy odczyt + odświeżanie licznika co 60 s.
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Klik poza zamyka panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onToggle = () => {
    setOpen((v) => !v);
    if (!open) void load();
  };

  const onMarkAll = async () => {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await markAllNotificationsReadAction();
  };

  const onItemClick = async (n: NotificationItem) => {
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      await markNotificationReadAction(n.id);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Powiadomienia"
        className="relative inline-flex items-center justify-center rounded-xl border border-white/10 bg-[#0a0a0a] p-2.5 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl shadow-black/60">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <p className="text-sm font-bold text-white">Powiadomienia</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void onMarkAll()}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300"
              >
                <Check className="h-3 w-3" /> Oznacz wszystkie
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-neutral-500">
                Brak powiadomień. Damy znać, gdy coś będzie wymagać uwagi.
              </p>
            ) : (
              items.map((n) => {
                const inner = (
                  <div
                    className={`flex gap-3 border-b border-white/5 px-4 py-3 transition-colors hover:bg-white/[0.03] ${
                      n.read ? 'opacity-70' : ''
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[n.severity] ?? 'bg-neutral-500'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{n.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">{n.body}</p>
                      <p className="mt-1 text-[10px] text-neutral-600">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.read ? <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /> : null}
                  </div>
                );
                return n.link ? (
                  <Link key={n.id} href={n.link} onClick={() => void onItemClick(n)} className="block">
                    {inner}
                  </Link>
                ) : (
                  <button key={n.id} type="button" onClick={() => void onItemClick(n)} className="block w-full text-left">
                    {inner}
                  </button>
                );
              })
            )}
          </div>

          <Link
            href="/dashboard/settings?tab=notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-white/5 px-4 py-2.5 text-center text-[11px] font-medium text-neutral-400 hover:text-white"
          >
            Ustawienia powiadomień
          </Link>
        </div>
      ) : null}
    </div>
  );
}
