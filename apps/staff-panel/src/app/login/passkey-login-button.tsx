"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { fetchPasskeyLoginOptions, verifyPasskeyLoginClient } from "@/lib/passkey-client";
import { setStaffPasskeyAuthCookie } from "./passkey-actions";

/** Logowanie passkey do panelu staff (discoverable credentials). */
export function StaffPasskeyLoginButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const prefetchedOptions = useRef<unknown | null>(null);
  // Render dopiero po montażu — inaczej hydration mismatch (React #418).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Safari wymaga, by startAuthentication() ruszyło SYNCHRONICZNIE w geście
  // użytkownika. Dlatego prefetchujemy opcje (świeży challenge) zawczasu:
  // na montażu oraz na focus/hover — wtedy onClick wywoła startAuthentication
  // bez żadnego await przed nim (Safari nie blokuje).
  const prefetch = useCallback(() => {
    void fetchPasskeyLoginOptions()
      .then((options) => {
        prefetchedOptions.current = options;
      })
      .catch(() => {
        prefetchedOptions.current = null;
      });
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined") {
      prefetch();
    }
  }, [prefetch]);

  const supported =
    typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
  if (!mounted || !supported) return null;

  const onClick = async () => {
    setError(null);
    setIsPending(true);
    try {
      const options = prefetchedOptions.current ?? (await fetchPasskeyLoginOptions());
      prefetchedOptions.current = null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asseResp = await startAuthentication({ optionsJSON: options as any });
      const { access_token, user } = await verifyPasskeyLoginClient(asseResp);
      if (user?.role !== "STAFF" && user?.role !== "ADMIN") {
        setError("To konto nie ma uprawnień do panelu Support (wymagana rola STAFF lub ADMIN).");
        return;
      }
      await setStaffPasskeyAuthCookie(access_token);
      router.push("/");
      router.refresh();
    } catch (err) {
      prefetchedOptions.current = null;
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "AbortError") {
        setError("Anulowano logowanie passkey.");
      } else {
        setError(
          err instanceof Error && err.message
            ? err.message
            : "Nie znaleziono passkey dla Verris na tym urządzeniu.",
        );
      }
    } finally {
      setIsPending(false);
      // Odśwież challenge na ewentualną kolejną próbę (zachowuje ścieżkę synchroniczną).
      prefetch();
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onPointerEnter={prefetch}
        onFocus={prefetch}
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
