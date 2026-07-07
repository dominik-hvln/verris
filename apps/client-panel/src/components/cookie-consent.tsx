"use client";

import { useCallback, useEffect, useState } from "react";
import {
  availableCategories,
  OPEN_PREFERENCES_EVENT,
  readConsent,
  writeConsent,
  type CookieConsent,
} from "@/lib/cookie-consent";

/**
 * Cookie banner + preferences modal (art. 399–402 PKE, art. 7 ust. 3 RODO).
 *
 * UX rules (must stay in sync with Polityka cookies §3):
 *  - "Akceptuj wszystkie" and "Tylko niezbędne" are equally prominent —
 *    refusing takes exactly as many clicks as accepting.
 *  - Optional categories default to OFF in the preferences view.
 *  - Withdrawal is as easy as consent: after a decision is saved, a
 *    persistent floating trigger (bottom-left, every page — also auth and
 *    /legal pages without the dashboard footer) reopens the preferences
 *    modal at any time. The footer "Preferencje cookies" link does the same.
 */
export function CookieConsentManager() {
  const [decided, setDecided] = useState(true); // pesymistycznie: bez flasha banera
  const [bannerOpen, setBannerOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [functional, setFunctional] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const cats = availableCategories();

  useEffect(() => {
    const existing = readConsent();
    if (!existing) {
      setDecided(false);
      setBannerOpen(true);
    } else {
      setDecided(true);
      setFunctional(existing.functional);
      setAnalytics(existing.analytics);
      setMarketing(existing.marketing);
    }
    const openPrefs = () => {
      const current = readConsent();
      if (current) {
        setFunctional(current.functional);
        setAnalytics(current.analytics);
        setMarketing(current.marketing);
      }
      setPrefsOpen(true);
      setBannerOpen(false);
    };
    window.addEventListener(OPEN_PREFERENCES_EVENT, openPrefs);
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, openPrefs);
  }, []);

  const persist = useCallback(
    (choice: Pick<CookieConsent, "functional" | "analytics" | "marketing">) => {
      writeConsent(choice);
      setFunctional(choice.functional);
      setAnalytics(choice.analytics);
      setMarketing(choice.marketing);
      setDecided(true);
      setBannerOpen(false);
      setPrefsOpen(false);
    },
    [],
  );

  const acceptAll = () =>
    persist({ functional: true, analytics: cats.analytics, marketing: cats.marketing });
  const necessaryOnly = () => persist({ functional: false, analytics: false, marketing: false });
  const saveSelection = () =>
    persist({
      functional,
      analytics: cats.analytics && analytics,
      marketing: cats.marketing && marketing,
    });

  if (!bannerOpen && !prefsOpen) {
    // Decyzja zapadła → stały, dyskretny trigger do zmiany zgody (art. 7 ust. 3
    // RODO — wycofanie równie łatwe jak wyrażenie), obecny także na stronach
    // bez stopki panelu (login, rejestracja, /legal/*).
    if (!decided) return null;
    return (
      <button
        type="button"
        aria-label="Preferencje cookies"
        title="Preferencje cookies"
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_PREFERENCES_EVENT))}
        className="fixed bottom-4 left-4 z-[90] flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-[#0d0d0d]/90 text-base shadow-lg backdrop-blur transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <CookieIcon className="h-5 w-5 text-neutral-300" />
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal={prefsOpen}
      aria-label="Ustawienia plików cookies"
      className={
        prefsOpen
          ? "fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-3 sm:items-center"
          : "fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4"
      }
    >
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d0d0d] p-4 shadow-2xl sm:p-6">
        {!prefsOpen ? (
          <>
            <h2 className="text-sm font-semibold text-white">Pliki cookies</h2>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400">
              Używamy cookies niezbędnych do działania panelu (logowanie, bezpieczeństwo).
              Za Twoją zgodą użyjemy także cookies opcjonalnych
              {cats.analytics || cats.marketing
                ? " — funkcjonalnych, analitycznych i marketingowych"
                : " — funkcjonalnych (zapamiętywanie udogodnień)"}
              . Zgodę możesz w każdej chwili zmienić lub wycofać — przycisk „Preferencje
              cookies" jest stale dostępny w rogu ekranu i w stopce. Szczegóły:{" "}
              <a href="/legal/cookies" className="underline hover:text-neutral-200">
                Polityka cookies
              </a>
              .
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={acceptAll}
                className="flex-1 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-black transition-colors hover:bg-neutral-200"
              >
                Akceptuj wszystkie
              </button>
              <button
                type="button"
                onClick={necessaryOnly}
                className="flex-1 rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/5"
              >
                Tylko niezbędne
              </button>
              <button
                type="button"
                onClick={() => setPrefsOpen(true)}
                className="flex-1 rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-neutral-300 transition-colors hover:bg-white/5"
              >
                Personalizuj
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">Preferencje cookies</h2>
              <button
                type="button"
                aria-label="Zamknij"
                onClick={() => (decided ? setPrefsOpen(false) : undefined)}
                className={
                  decided
                    ? "rounded-md px-2 text-neutral-400 hover:text-white"
                    : "hidden"
                }
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <ConsentRow
                label="Niezbędne"
                description="Sesja logowania, ochrona CSRF, zapis Twojej decyzji. Zawsze aktywne — bez nich panel nie działa."
                checked
                disabled
              />
              <ConsentRow
                label="Funkcjonalne"
                description="Zapamiętują udogodnienia, np. układ pulpitu i wersje robocze zgłoszeń."
                checked={functional}
                onChange={setFunctional}
              />
              {cats.analytics && (
                <ConsentRow
                  label="Analityczne"
                  description="Pomiar korzystania z serwisu (np. Google Analytics przez Google Tag Manager)."
                  checked={analytics}
                  onChange={setAnalytics}
                />
              )}
              {cats.marketing && (
                <ConsentRow
                  label="Marketingowe"
                  description="Dopasowanie i pomiar skuteczności reklam (np. Meta Pixel, tagi reklamowe Google)."
                  checked={marketing}
                  onChange={setMarketing}
                />
              )}
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={saveSelection}
                className="flex-1 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-black transition-colors hover:bg-neutral-200"
              >
                Zapisz wybór
              </button>
              <button
                type="button"
                onClick={necessaryOnly}
                className="flex-1 rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/5"
              >
                Tylko niezbędne
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="flex-1 rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-neutral-300 transition-colors hover:bg-white/5"
              >
                Akceptuj wszystkie
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Wiersz kategorii z przełącznikiem (switch, nie checkbox). */
function ConsentRow(props: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}) {
  const { label, description, checked, disabled, onChange } = props;
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div>
        <p className="text-xs font-semibold text-white">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={[
          "relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
          checked ? "border-emerald-400/60 bg-emerald-500/80" : "border-white/15 bg-white/10",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-6" : "translate-x-1",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

function CookieIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-9.5-8.98 3.5 3.5 0 0 0 4.2 4.2A3.5 3.5 0 0 0 21 12Z" />
      <circle cx="9" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="15.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Footer trigger: reopens the preferences modal (Polityka cookies §3.2). */
export function CookiePreferencesButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_PREFERENCES_EVENT))}
    >
      Preferencje cookies
    </button>
  );
}
