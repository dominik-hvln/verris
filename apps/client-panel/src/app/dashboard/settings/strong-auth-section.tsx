"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, Loader2, Lock } from "lucide-react";
import { Switch } from "@/components/panel/v2";
import { setStrongAuthRequirement } from "./actions";

interface Props {
  initialEnabled: boolean;
  hasFactor: boolean; // 2FA włączone LUB istnieje passkey
  showToast: (msg: string, type: "success" | "error") => void;
}

export function StrongAuthSection({ initialEnabled, hasFactor, showToast }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !enabled;
    if (next && !hasFactor) {
      showToast("Najpierw włącz 2FA lub dodaj passkey.", "error");
      return;
    }
    startTransition(async () => {
      const res = await setStrongAuthRequirement(next);
      if ("error" in res) {
        showToast(res.error!, "error");
      } else {
        setEnabled(next);
        showToast(
          next ? "Wymóg silnego logowania włączony." : "Wymóg silnego logowania wyłączony.",
          "success",
        );
      }
    });
  };

  return (
    <div className="space-y-4 border-t border-white/5 pt-8">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
          <Lock className="h-5 w-5" /> Wymóg silnego logowania
        </h3>
        <p className="mt-1 text-sm text-neutral-400">
          Gdy włączone, logowanie samym hasłem nie wystarczy — wymagany jest passkey lub kod 2FA.
          Najmocniejsza ochrona przed przejęciem konta.
        </p>
      </div>

      {!hasFactor ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Aby włączyć tę opcję, najpierw skonfiguruj 2FA lub dodaj passkey powyżej.
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#0a0a0a]/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className={`h-5 w-5 ${enabled ? "text-emerald-300" : "text-neutral-500"}`} />
          <span className="text-sm text-white">
            {enabled ? "Włączone — logowanie wymaga 2FA/passkey" : "Wyłączone"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden /> : null}
          <Switch
            checked={enabled}
            onChange={toggle}
            label="Wymóg silnego logowania"
            disabled={pending || (!enabled && !hasFactor)}
          />
        </div>
      </div>
    </div>
  );
}
