"use client";

import { useTransition } from "react";
import { potwierdz } from "@/components/potwierdz";
import { revokeInviteAction } from "./actions";

export function RevokeButton({ id, code }: { id: string; code: string }) {
  const [pending, start] = useTransition();
  const click = async () => {
    if (!(await potwierdz(`Wyłączyć kod ${code}? Nie da się go już zrealizować.`, { akcja: "Wyłącz", niebezpieczne: true }))) return;
    start(async () => {
      const r = await revokeInviteAction(id);
      if (!r.ok) await potwierdz(r.error, { akcja: "OK", tytul: "Nie udało się" });
    });
  };
  return (
    <button
      type="button"
      onClick={() => void click()}
      disabled={pending}
      className="rounded-lg border border-rose-500/30 px-2.5 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
    >
      Wyłącz kod
    </button>
  );
}
