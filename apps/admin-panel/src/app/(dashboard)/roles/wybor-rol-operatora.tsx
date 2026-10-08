"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Checkbox } from "@/components/checkbox";
import { plForm } from "@/lib/pl";
import { setOperatorRoles, type OperatorRow, type RoleRow } from "./actions";

/** Role operatora: lista z API (PB-47), a dla starszego API — pojedyncze staffRoleId. */
export function roleOperatora(o: Pick<OperatorRow, "roleIds" | "staffRoleId">): string[] {
  if (o.roleIds) return o.roleIds;
  return o.staffRoleId ? [o.staffRoleId] : [];
}

export function przelaczRole(wybrane: string[], id: string): string[] {
  return wybrane.includes(id) ? wybrane.filter((x) => x !== id) : [...wybrane, id];
}

/**
 * PB-47 — operator może mieć kilka ról naraz (np. „L2 Specjalista techniczny” + „Finanse i księgowość”);
 * uprawnienia się sumują. Lista z opisami, żeby przy przypisaniu było widać, co rola daje.
 */
export function WyborRolOperatora({
  operator,
  role,
  zablokowane = false,
  onBlad,
}: {
  operator: OperatorRow;
  role: RoleRow[];
  zablokowane?: boolean;
  onBlad?: (tekst: string | null) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [otwarte, setOtwarte] = useState(false);
  const przypisane = roleOperatora(operator);
  const [wybrane, setWybrane] = useState<string[]>(przypisane);
  const nazwy = przypisane.map((id) => role.find((r) => r.id === id)?.name ?? "rola usunięta");

  const zapisz = () => {
    onBlad?.(null);
    start(async () => {
      const res = await setOperatorRoles(operator.id, wybrane);
      if (!res.ok) {
        onBlad?.(res.error);
        return;
      }
      setOtwarte(false);
      router.refresh();
    });
  };

  return (
    <div className="min-w-0 sm:w-[340px]" data-role-operatora>
      <div className="flex flex-wrap items-center gap-1.5">
        {nazwy.length === 0 ? (
          <span className="rounded bg-amber-500/15 px-2 py-1 text-[11px] text-amber-200">brak ról (brak dostępu)</span>
        ) : (
          nazwy.map((n) => (
            <span key={n} className="rounded bg-indigo-500/15 px-2 py-1 text-[11px] text-indigo-200">
              {n}
            </span>
          ))
        )}
        <button
          type="button"
          onClick={() => {
            setWybrane(przypisane);
            setOtwarte((v) => !v);
          }}
          disabled={zablokowane || pending}
          className="rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50"
        >
          {otwarte ? "Zamknij" : "Zmień role"}
        </button>
      </div>
      {otwarte ? (
        <div className="mt-2 space-y-1.5 rounded-lg border border-white/10 bg-black/40 p-2">
          <div className="max-h-[320px] space-y-1.5 overflow-auto pr-1">
            {role.map((r) => (
              <label key={r.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-200 hover:bg-white/[0.03]">
                <Checkbox
                  checked={wybrane.includes(r.id)}
                  disabled={pending}
                  onChange={() => setWybrane((w) => przelaczRole(w, r.id))}
                  aria-label={`Rola ${r.name}`}
                  className="mt-0.5 h-4 w-4"
                />
                <span className="min-w-0">
                  <span className="text-white">{r.name}</span>
                  {r.isSystem ? <span className="ml-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-400">systemowa</span> : null}
                  {r.description ? <span className="block text-[11px] text-neutral-500">{r.description}</span> : null}
                </span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-2">
            <span className="text-[11px] text-neutral-500">
              {wybrane.length} {plForm(wybrane.length, "rola", "role", "ról")} — uprawnienia się sumują
            </span>
            <button
              type="button"
              onClick={zapisz}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Zapisz role
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
