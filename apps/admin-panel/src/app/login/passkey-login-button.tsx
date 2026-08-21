"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { fetchPasskeyLoginOptions, verifyPasskeyLoginClient } from "@/lib/passkey-client";
import { getAdminPasskeyAvailability, setAdminPasskeyAuthCookie } from "./passkey-actions";

/** Logowanie passkey do panelu admina (discoverable credentials). */
export function AdminPasskeyLoginButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [isPending, setIsPending] = useState(false);
  // Render dopiero po montażu — inaczej hydration mismatch (React #418).
  const [mounted, setMounted] = useState(false);
  const prefetchedOptions = useRef<unknown | null>(null);
  const supported =
    typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";

  useEffect(() => {
    setMounted(true);
    void getAdminPasskeyAvailability().then(setAvailable);
  }, []);

  if (!mounted || !supported || available === false) return null;

  const onPointerDown = () => {
    void fetchPasskeyLoginOptions()
      .then((options) => {
        prefetchedOptions.current = options;
      })
      .catch(() => {
        prefetchedOptions.current = null;
      });
  };

  const onClick = async () => {
    setError(null);
    setIsPending(true);
    try {
      const options = prefetchedOptions.current ?? (await fetchPasskeyLoginOptions());
      prefetchedOptions.current = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asseResp = await startAuthentication({ optionsJSON: options as any });
      const { access_token, user } = await verifyPasskeyLoginClient(asseResp);
      if (user?.role !== "ADMIN") {
        setError("To konto nie ma uprawnień administratora Verris Core.");
        return;
      }
      await setAdminPasskeyAuthCookie(access_token);
      router.push("/");
      router.refresh();
    } catch (err) {
      prefetchedOptions.current = null;
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "AbortError") {
        setError("Logowanie passkey anulowane lub przerwane. Spróbuj ponownie.");
      } else if (name === "InvalidStateError") {
        setError("Passkey jest w użyciu. Odśwież stronę i spróbuj ponownie.");
      } else {
        setError(
          err instanceof Error && err.message
            ? err.message
            : "Nie znaleziono passkey dla Verris na tym urządzeniu.",
        );
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onPointerDown={onPointerDown}
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
