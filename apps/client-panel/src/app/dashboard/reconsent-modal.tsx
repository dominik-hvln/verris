"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import {
  acceptCurrentConsents,
  fetchReConsentStatus,
  type ReConsentRequiredDoc,
} from "./consent-actions";
import { logoutAction } from "./actions";

const KIND_LABELS = {
  TERMS: "Regulamin",
  PRIVACY: "Polityka prywatności",
} as const;

const LINK_BY_KIND = {
  TERMS: "/legal/terms",
  PRIVACY: "/legal/privacy",
} as const;

/**
 * Globalny modal blokujący panel klienta, gdy aktualna wersja regulaminu lub
 * polityki prywatności wymaga ponownej akceptacji (RODO Sprint 1 / L-04).
 *
 * Logika:
 *  1. Po mount fetchuje `/me/consent/status` przez server action.
 *  2. Jeśli `required === true`, renderuje fullscreen overlay z listą
 *     dokumentów + checkbox "Akceptuję wszystkie powyższe zmiany".
 *  3. Klik "Akceptuję" wywołuje `POST /me/consent/accept-current` i ukrywa
 *     modal (revalidatePath dashboard).
 *
 * Modal jest "blocking" wizualnie (pointer-events-auto, z-50, brak X) — user
 * musi akceptować lub wylogować się. Backend i tak będzie zwracał 403 na
 * próby wykonania innych akcji dopóki user nie zatwierdzi.
 */
export function ReConsentModal() {
  const [docs, setDocs] = useState<ReConsentRequiredDoc[] | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = !!docs && docs.length > 0;
  const trapRef = useFocusTrap<HTMLDivElement>(open); // brak onEscape — modal blokujący

  useEffect(() => {
    let cancelled = false;
    fetchReConsentStatus().then((status) => {
      if (cancelled) return;
      if (status.required && status.docs && status.docs.length > 0) {
        setDocs(status.docs);
      } else {
        setDocs(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!docs || docs.length === 0) return null;

  const onAccept = () => {
    if (!accepted) return;
    setError(null);
    startTransition(async () => {
      const result = await acceptCurrentConsents();
      if (result.ok) {
        setDocs(null);
      } else {
        setError(result.error ?? "Nie udało się zapisać akceptacji.");
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reconsent-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
    >
      {/* Modal blokujący (wymagana akceptacja) — focus trap bez onEscape. */}
      <div
        ref={trapRef}
        tabIndex={-1}
        className="relative w-full max-w-xl rounded-2xl border border-amber-500/30 bg-neutral-950 p-8 shadow-2xl outline-none"
      >
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-amber-500/10 p-3">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 id="reconsent-title" className="text-xl font-bold text-white">
              Zaktualizowaliśmy ważne dokumenty prawne
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              Zanim przejdziesz do panelu, prosimy o zapoznanie się i ponowną akceptację.
            </p>
          </div>
        </div>

        <ul className="mt-6 space-y-3">
          {docs.map((doc) => (
            <li
              key={doc.kind}
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-neutral-900/50 p-4"
            >
              <FileText className="mt-0.5 h-5 w-5 text-sky-400" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">
                  {KIND_LABELS[doc.kind]} — wersja {doc.currentVersion}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Twoja zaakceptowana wersja: {doc.userVersion ?? "brak (legacy)"}
                </p>
                {doc.changelogMarkdown && (
                  <p className="mt-2 text-xs text-neutral-300 whitespace-pre-line">
                    {doc.changelogMarkdown}
                  </p>
                )}
                <a
                  href={LINK_BY_KIND[doc.kind]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center text-xs text-sky-400 hover:text-sky-300 underline underline-offset-2"
                >
                  Otwórz pełną treść w nowej karcie →
                </a>
              </div>
            </li>
          ))}
        </ul>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300"
          >
            {error}
          </div>
        )}

        <label className="mt-6 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-white/20 bg-neutral-900 text-sky-500 focus:ring-2 focus:ring-sky-500/30 cursor-pointer"
          />
          <span className="text-sm text-neutral-300">
            Akceptuję wszystkie powyższe zmiany i potwierdzam, że zapoznałem/am się z treścią
            zaktualizowanych dokumentów.
          </span>
        </label>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full rounded-xl border border-white/10 px-5 py-2.5 text-center text-sm text-neutral-300 hover:bg-white/5"
            >
              Wyloguj się
            </button>
          </form>
          <button
            type="button"
            disabled={!accepted || pending}
            onClick={onAccept}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Akceptuję i kontynuuję
          </button>
        </div>
      </div>
    </div>
  );
}
