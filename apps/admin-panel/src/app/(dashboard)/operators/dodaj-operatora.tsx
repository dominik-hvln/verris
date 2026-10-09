"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Select } from "@/components/select";
import { createOperator, type RoleRow } from "../roles/actions";

/** Nowy operator (STAFF) — przeniesione z /roles (10.10): tam zostaje sama definicja ról. */
export function DodajOperatora({ role }: { role: RoleRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [blad, setBlad] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [imie, setImie] = useState("");
  const [nazwisko, setNazwisko] = useState("");
  const [roleId, setRoleId] = useState("");

  const dodaj = () => {
    if (!email.trim()) return setBlad("Podaj e-mail operatora.");
    setBlad(null);
    start(async () => {
      const r = await createOperator({ email: email.trim(), firstName: imie.trim() || undefined, lastName: nazwisko.trim() || undefined, roleId: roleId || null });
      if (!r.ok) return setBlad(r.error);
      setEmail("");
      setImie("");
      setNazwisko("");
      setRoleId("");
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
        <input value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-mail operatora" placeholder="e-mail operatora" className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
        <input value={imie} onChange={(e) => setImie(e.target.value)} aria-label="Imię operatora" placeholder="imię" className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
        <input value={nazwisko} onChange={(e) => setNazwisko(e.target.value)} aria-label="Nazwisko operatora" placeholder="nazwisko" className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
        <Select
          aria-label="Rola operatora"
          value={roleId}
          onChange={setRoleId}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          options={[{ value: "", label: "— rola —" }, ...role.map((r) => ({ value: r.id, label: r.name }))]}
        />
        <button type="button" onClick={dodaj} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-40">
          <Plus className="h-4 w-4" /> Dodaj
        </button>
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">Operator dostanie e-mail z hasłem tymczasowym; przy pierwszym logowaniu ustawi passkey.</p>
      {blad ? (
        <p role="alert" className="mt-2 text-sm text-rose-300">
          {blad}
        </p>
      ) : null}
    </div>
  );
}
