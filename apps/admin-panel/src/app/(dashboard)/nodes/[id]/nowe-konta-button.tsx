"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PRZYCISK } from "@/components/v2";
import { potwierdz } from "@/components/potwierdz";
import { setNodeCapacityPolicy } from "../actions";

/** PB-34 — „Wstrzymaj nowe konta” z nagłówka węzła (ta sama flaga co w polityce pojemności). */
export function NoweKontaButton({ serverId, przyjmuje }: { serverId: string; przyjmuje: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [blad, setBlad] = useState<string | null>(null);
  const przelacz = async () => {
    if (przyjmuje && !(await potwierdz("Wstrzymać przydział nowych kont na tym węźle? Istniejące konta działają dalej.", { akcja: "Wstrzymaj" }))) return;
    start(async () => {
      const r = await setNodeCapacityPolicy(serverId, { acceptsNewAccounts: !przyjmuje });
      if ("error" in r && r.error) setBlad(r.error);
      else router.refresh();
    });
  };
  return (
    <button type="button" onClick={() => void przelacz()} disabled={pending} className={PRZYCISK} title={blad ?? undefined}>
      {blad ? "Błąd — spróbuj ponownie" : przyjmuje ? "Wstrzymaj nowe konta" : "Wznów nowe konta"}
    </button>
  );
}
