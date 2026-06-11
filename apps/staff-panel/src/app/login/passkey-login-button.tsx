"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { getStaffPasskeyLoginOptions, verifyStaffPasskeyLogin } from "./passkey-actions";

/** Logowanie passkey do panelu staff (discoverable credentials). */
export function StaffPasskeyLoginButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const supported =
    typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
  if (!supported) return null;

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const opt = await getStaffPasskeyLoginOptions();
      if (!opt.ok) {
        setError(opt.error);
        return;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const asseResp = await startAuthentication({ optionsJSON: opt.options as any });
        const res = await verifyStaffPasskeyLogin(asseResp);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.push("/");
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error && err.name === "NotAllowedError"
            ? "Anulowano logowanie passkey."
            : "Nie znaleziono passkey dla Verris na tym urządzeniu.",
        );
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="w-full rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Logowanie…" : "Zaloguj się passkey"}
      </button>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
