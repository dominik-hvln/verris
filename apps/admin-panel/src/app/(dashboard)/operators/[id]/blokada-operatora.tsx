"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { potwierdz } from "@/components/potwierdz";
import { PRZYCISK } from "@/components/v2";
import { setOperatorActive } from "../../roles/actions";

/** Wyłączenie / aktywacja konta operatora (przeniesione z /roles, 10.10). Wyłączenie — z potwierdzeniem. */
export function BlokadaOperatora({ userId, email, zablokowany }: { userId: string; email: string; zablokowany: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [blad, setBlad] = useState<string | null>(null);

  const przelacz = async () => {
    if (!zablokowany && !(await potwierdz(`Wyłączyć konto ${email}? Operator nie zaloguje się do paneli.`, { akcja: "Wyłącz", niebezpieczne: true }))) return;
    setBlad(null);
    start(async () => {
      const r = await setOperatorActive(userId, zablokowany);
      if (!r.ok) return setBlad(r.error);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={PRZYCISK} disabled={pending} onClick={() => void przelacz()}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {zablokowany ? "Aktywuj" : "Wyłącz"}
      </button>
      {blad ? (
        <span role="alert" className="text-xs text-crit">
          {blad}
        </span>
      ) : null}
    </div>
  );
}
