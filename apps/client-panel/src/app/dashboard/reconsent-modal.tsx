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
import { Checkbox } from '@/components/panel/checkbox';
import { renderLegalMarkdown } from "@/lib/markdown";

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
  // Konto bez żadnej akceptacji (np. założone przez resellera) — pierwsza zgoda, nie „aktualizacja”.
  const pierwsza = docs.every((d) => !d.userVersion);

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
      // .v2-content: tokeny motywu jasnego/ciemnego jak w treści panelu (okno leży poza kolumną treści).
      className="v2-content fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[rgba(4,10,7,0.7)] p-4 backdrop-blur-sm"
    >
      {/* Modal blokujący (wymagana akceptacja) — focus trap bez onEscape. */}
      <div
        ref={trapRef}
        tabIndex={-1}
        className="relative my-auto w-full max-w-xl rounded-xl border border-line-strong bg-card p-6 text-foreground shadow-2xl outline-none sm:p-8"
      >
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-warn-soft p-2.5">
            <AlertTriangle aria-hidden className="h-5 w-5 text-warn" />
          </div>
          <div className="flex-1">
            <h2 id="reconsent-title" className="text-xl font-bold text-foreground">
              {pierwsza ? "Zaakceptuj regulamin i politykę prywatności" : "Zaktualizowaliśmy ważne dokumenty prawne"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {pierwsza
                ? "Zanim przejdziesz do panelu, zapoznaj się z dokumentami i zaakceptuj je."
                : "Zanim przejdziesz do panelu, prosimy o zapoznanie się i ponowną akceptację."}
            </p>
          </div>
        </div>

        <ul className="mt-6 space-y-3">
          {docs.map((doc) => (
            <li
              key={doc.kind}
              className="flex items-start gap-3 rounded-lg border border-line bg-raised/50 p-4"
            >
              <FileText aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-data-hi" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {KIND_LABELS[doc.kind]} — wersja {doc.currentVersion}
                </p>
                {doc.userVersion && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Twoja zaakceptowana wersja: {doc.userVersion}
                  </p>
                )}
                {!pierwsza && doc.changelogMarkdown && (
                  <div className="mt-2 border-l-2 border-data pl-3">
                    {renderLegalMarkdown(doc.changelogMarkdown, {
                      className: "text-xs leading-relaxed text-verris-body [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1",
                    })}
                  </div>
                )}
                <a
                  href={LINK_BY_KIND[doc.kind]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center text-xs font-medium text-data-hi underline underline-offset-2 hover:text-foreground"
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
            className="mt-4 rounded-lg border border-crit/40 bg-crit/10 p-3 text-sm text-crit"
          >
            {error}
          </div>
        )}

        <label className="mt-6 flex items-start gap-3 cursor-pointer">
          <Checkbox
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-sm text-verris-body">
            {pierwsza
              ? "Akceptuję powyższe dokumenty i potwierdzam, że zapoznałem/am się z ich treścią."
              : "Akceptuję wszystkie powyższe zmiany i potwierdzam, że zapoznałem/am się z treścią zaktualizowanych dokumentów."}
          </span>
        </label>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full rounded-md border border-line-strong px-5 py-2.5 text-center text-sm font-medium text-foreground hover:bg-raised"
            >
              Wyloguj się
            </button>
          </form>
          <button
            type="button"
            disabled={!accepted || pending}
            onClick={onAccept}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Akceptuję i kontynuuję
          </button>
        </div>
      </div>
    </div>
  );
}
