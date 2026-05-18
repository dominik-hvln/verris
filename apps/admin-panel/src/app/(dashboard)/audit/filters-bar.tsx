"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Filter, RotateCcw, Search } from "lucide-react";

interface Defaults {
  action: string;
  userId: string;
  actorUserId: string;
  search: string;
  from: string;
  to: string;
  category: string;
}

const CATEGORIES: { value: string; label: string }[] = [
  { value: "", label: "— wszystkie —" },
  { value: "ADMIN_OPS", label: "Operacje admina (plany / klienci / faktury / węzły)" },
  { value: "RODO", label: "RODO (zgody, eksport, usunięcie konta)" },
  { value: "SECURITY", label: "Bezpieczeństwo (logowania, hasła, 2FA)" },
  { value: "IMPERSONATION", label: "Impersonacja" },
];

export function AuditFiltersBar({ defaults }: { defaults: Defaults }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [action, setAction] = useState(defaults.action);
  const [userId, setUserId] = useState(defaults.userId);
  const [actorUserId, setActorUserId] = useState(defaults.actorUserId);
  const [search, setSearch] = useState(defaults.search);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [category, setCategory] = useState(defaults.category);

  const apply = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (action) next.set("action", action);
    if (userId) next.set("userId", userId);
    if (actorUserId) next.set("actorUserId", actorUserId);
    if (search) next.set("search", search);
    if (from) next.set("from", from);
    if (to) next.set("to", to);
    if (category) next.set("category", category);
    startTransition(() => {
      router.push(`/audit?${next.toString()}`);
    });
  };

  const reset = () => {
    setAction("");
    setUserId("");
    setActorUserId("");
    setSearch("");
    setFrom("");
    setTo("");
    setCategory("");
    startTransition(() => {
      router.push("/audit");
    });
  };

  const hasFilters =
    action ||
    userId ||
    actorUserId ||
    search ||
    from ||
    to ||
    category ||
    params.toString().length > 0;

  return (
    <form
      onSubmit={apply}
      className="rounded-2xl border border-white/5 bg-black/40 p-5 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3"
    >
      <Field label="Kategoria" hint="szybkie pogrupowanie akcji">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputClass}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Akcja" hint="np. SUBSCRIPTION_CREATED">
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className={inputClass}
          placeholder="dokładna nazwa"
        />
      </Field>
      <Field label="Szukaj (zawiera)" hint="case‑insensitive po nazwie akcji">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClass}
          placeholder="np. autoscaling"
        />
      </Field>
      <Field label="User ID (cel)">
        <input
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className={inputClass}
          placeholder="UUID"
        />
      </Field>
      <Field label="Actor ID (kto wykonał)">
        <input
          value={actorUserId}
          onChange={(e) => setActorUserId(e.target.value)}
          className={inputClass}
          placeholder="UUID"
        />
      </Field>
      <Field label="Od (data)">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Do (data)">
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="md:col-span-3 xl:col-span-6 flex items-center justify-end gap-2 mt-1">
        {hasFilters && (
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Wyczyść
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] disabled:opacity-50"
        >
          {pending ? (
            <Filter className="h-3.5 w-3.5 animate-pulse" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Zastosuj filtry
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-md bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-indigo-400 focus:outline-none placeholder:text-neutral-600";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
        {label}
      </span>
      {children}
      {hint && <p className="mt-1 text-[10px] text-neutral-500">{hint}</p>}
    </label>
  );
}
