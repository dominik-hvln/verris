"use client";

import { useEffect, useState } from "react";
import { Megaphone, Wrench, X } from "lucide-react";
import { fetchMyNotices, type UserNotices } from "./incident-banner-actions";

const DISMISS_KEY = "verris.dismissed-announcements";

function loadDismissed(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/**
 * N-11 — prace serwisowe (nie da się ich zamknąć: dotyczą usług klienta) i ogłoszenia
 * (klient może je schować u siebie). Dane: GET /me/status/notices.
 */
export function NoticesBanner() {
  const [data, setData] = useState<UserNotices | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    setDismissed(loadDismissed());
    void fetchMyNotices().then(setData);
  }, []);

  if (!data) return null;
  const announcements = data.announcements.filter((a) => !dismissed.includes(a.id));
  if (data.maintenance.length === 0 && announcements.length === 0) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-50)));
    } catch {
      /* brak pamięci przeglądarki — schowane tylko do odświeżenia */
    }
  };

  return (
    <div className="border-b border-line bg-raised">
      <ul className="mx-auto max-w-screen-2xl space-y-2 px-4 py-2.5 text-sm">
        {data.maintenance.map((w) => (
          <li key={w.id} className="flex items-start gap-3">
            <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
            <div className="min-w-0">
              <p className="font-semibold">
                {w.status === "IN_PROGRESS" ? "Trwają prace serwisowe" : "Planowane prace serwisowe"}: {w.title}
              </p>
              <p className="text-muted-foreground">
                {fmt(w.scheduledStart)} – {fmt(w.scheduledEnd)} · {w.serverName ?? "cała platforma"}
                {w.publicMessage ? ` · ${w.publicMessage}` : ""}
              </p>
            </div>
          </li>
        ))}
        {announcements.map((a) => (
          <li key={a.id} className="flex items-start gap-3">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-data-hi" aria-hidden />
            <details className="min-w-0 flex-1">
              <summary className="cursor-pointer font-semibold">{a.title}</summary>
              <p className="mt-1 whitespace-pre-line text-muted-foreground">{a.bodyMarkdown}</p>
            </details>
            <button
              type="button"
              onClick={() => dismiss(a.id)}
              className="rounded-md p-1 text-muted-foreground hover:bg-card hover:text-foreground"
              aria-label={`Schowaj ogłoszenie: ${a.title}`}
              title="Schowaj"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
