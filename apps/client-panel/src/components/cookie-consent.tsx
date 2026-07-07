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
 * Cookie banner + preferences modal (art. 399–402 PKE).
 *
 * UX rules (must stay in sync with Polityka cookies §3):
 *  - "Akceptuj wszystkie" and "Tylko niezbędne" are equally prominent —
 *    refusing takes exactly as many clicks as accepting.
 *  - Optional categories default to OFF in the preferences view.
 *  - The banner never blocks access to legal pages.
 *  - Footer "Preferencje cookies" reopens the modal at any time via
 *    the OPEN_PREFERENCES_EVENT custom event.
 */
export function CookieConsentManager() {
  const [bannerOpen, setBannerOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [functional, setFunctional] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const cats = availableCategories();

  useEffect(() => {
    const existing = readConsent();
    if (!existing) {
      setBannerOpen(true);
    } else {
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

  if (!bannerOpen && !prefsOpen) return null;

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
              . Zgodę możesz w każdej chwili wycofać w stopce („Preferencje cookies").
              Szczegóły:{" "}
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
            <h2 className="text-sm font-semibold text-white">Preferencje cookies</h2>
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

function ConsentRow(props: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <span>
        <span className="block text-xs font-semibold text-white">{props.label}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-neutral-400">
          {props.description}
        </span>
      </span>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-white disabled:opacity-50"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange?.(e.target.checked)}
      />
    </label>
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
