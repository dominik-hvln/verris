"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown, Globe } from "lucide-react";
import type { AuditLogRow } from "./types";

interface Props {
  rows: AuditLogRow[];
  page: number;
  totalPages: number;
  totalRows: number;
  limit: number;
}

export function AuditTable({ rows, page, totalPages, totalRows, limit }: Props) {
  const params = useSearchParams();

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
        <p className="text-base font-semibold text-white">Brak zdarzeń</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Nie znaleziono żadnych logów dla tych filtrów. Spróbuj poszerzyć zakres lub
          wyczyść kryteria.
        </p>
      </div>
    );
  }

  const buildPageHref = (target: number) => {
    const next = new URLSearchParams(params.toString());
    if (target <= 1) next.delete("page");
    else next.set("page", String(target));
    const qs = next.toString();
    return qs ? `/audit?${qs}` : "/audit";
  };

  const startRow = (page - 1) * limit + 1;
  const endRow = Math.min(totalRows, page * limit);

  return (
    <div>
      <div className="flex justify-between items-center text-xs text-muted-foreground mb-3">
        <span>
          Pokazuję {startRow}–{endRow} z {totalRows.toLocaleString("pl-PL")}
        </span>
        <span>
          Strona {page} / {totalPages}
        </span>
      </div>

      <div className="rounded-2xl border border-white/5 bg-black/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/5 bg-white/[0.02]">
            <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <th className="px-5 py-3">Data UTC</th>
              <th className="px-5 py-3">Akcja</th>
              <th className="px-5 py-3">Cel (user)</th>
              <th className="px-5 py-3">Aktor</th>
              <th className="px-5 py-3">Kontekst</th>
              <th className="px-5 py-3 text-right">Szczegóły</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 mt-4">
        <PageLink href={buildPageHref(page - 1)} disabled={page <= 1} label="Poprzednia">
          <ChevronLeft className="h-3.5 w-3.5" />
        </PageLink>
        <PageLink href={buildPageHref(page + 1)} disabled={page >= totalPages} label="Następna">
          <ChevronRight className="h-3.5 w-3.5" />
        </PageLink>
      </div>
    </div>
  );
}

function Row({ row }: { row: AuditLogRow }) {
  const [open, setOpen] = useState(false);
  const tone = pickTone(row.action);

  return (
    <>
      <tr className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
        <td className="px-5 py-3 align-top whitespace-nowrap text-muted-foreground text-xs">
          {new Date(row.createdAt).toISOString().replace("T", " ").slice(0, 19)}
        </td>
        <td className="px-5 py-3 align-top">
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${tone}`}
          >
            {row.action}
          </span>
        </td>
        <td className="px-5 py-3 align-top text-xs">
          {row.user ? (
            <div>
              <div className="text-white">{row.user.email}</div>
              <div className="text-neutral-600 font-mono text-[10px]">
                {row.user.id.slice(0, 8)}…
              </div>
            </div>
          ) : (
            <span className="text-neutral-600">—</span>
          )}
        </td>
        <td className="px-5 py-3 align-top text-xs">
          {row.actor ? (
            <div>
              <div className="text-white">{row.actor.email}</div>
              <div className="text-neutral-600 font-mono text-[10px]">
                {row.actor.id.slice(0, 8)}…
              </div>
            </div>
          ) : row.actorUserId ? (
            <span className="font-mono text-neutral-500 text-[10px]">
              {row.actorUserId.slice(0, 8)}…
            </span>
          ) : (
            <span className="text-neutral-600">system</span>
          )}
          {row.impersonatedBy && (
            <div className="mt-1 inline-flex items-center gap-1 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-200">
              impersonated by {row.impersonatedBy.slice(0, 8)}
            </div>
          )}
        </td>
        <td className="px-5 py-3 align-top text-xs">
          {row.ipAddress && (
            <div className="flex items-center gap-1 text-neutral-300">
              <Globe className="h-3 w-3 text-neutral-500" />
              <span className="font-mono">{row.ipAddress}</span>
            </div>
          )}
          {row.userAgent && (
            <div
              className="text-[10px] text-neutral-600 truncate max-w-[180px]"
              title={row.userAgent}
            >
              {row.userAgent}
            </div>
          )}
        </td>
        <td className="px-5 py-3 align-top text-right">
          {row.details ? (
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white hover:bg-white/10"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
              />
              {open ? "Zwiń" : "Rozwiń"}
            </button>
          ) : (
            <span className="text-neutral-600 text-[11px]">brak</span>
          )}
        </td>
      </tr>
      {open && row.details ? (
        <tr className="border-b border-white/5 last:border-0">
          <td colSpan={6} className="px-5 py-3 bg-black/60">
            <pre className="text-[11px] text-neutral-300 whitespace-pre-wrap break-all font-mono">
              {JSON.stringify(row.details, null, 2)}
            </pre>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-label={label}
        className="inline-flex items-center gap-1 rounded-md border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs text-neutral-600 cursor-not-allowed"
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10"
    >
      {children}
    </Link>
  );
}

function pickTone(action: string): string {
  if (
    action.includes("FAILED") ||
    action.includes("ERROR") ||
    action.includes("DELETED") ||
    action.includes("SUSPENDED")
  ) {
    return "border-rose-400/40 bg-rose-400/10 text-rose-200";
  }
  if (
    action.includes("DISABLED") ||
    action.includes("CAP_REACHED") ||
    action.includes("WALLET_EMPTY")
  ) {
    return "border-amber-400/40 bg-amber-400/10 text-amber-200";
  }
  if (action.startsWith("AUTOSCALING_") || action.startsWith("SUBSCRIPTION_")) {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  }
  if (action.startsWith("SERVER_") || action.startsWith("BOOTSTRAP_")) {
    return "border-sky-400/40 bg-sky-400/10 text-sky-200";
  }
  if (action.startsWith("WALLET_") || action.startsWith("STRIPE_")) {
    return "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200";
  }
  return "border-white/15 bg-white/5 text-neutral-200";
}
