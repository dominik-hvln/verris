'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import {
  applyConsent,
  availableCategories,
  OPEN_PREFERENCES_EVENT,
  readConsent,
  writeConsent,
  type CookieConsent as Consent,
} from '@/lib/cookie-consent';

/**
 * Baner + modal preferencji cookie (art. 399–402 PKE, art. 7 ust. 3 RODO).
 *
 * Zasady UX (spójne z Polityką cookies §3 i banerem panelu):
 *  - „Akceptuj wszystkie" i „Tylko niezbędne" są równorzędne — odmowa kosztuje tyle
 *    samo kliknięć co zgoda.
 *  - Kategorie opcjonalne domyślnie WYŁĄCZONE w widoku preferencji.
 *  - Wycofanie równie łatwe jak zgoda: po decyzji stały trigger (róg ekranu) oraz
 *    link „Preferencje cookies" w stopce ponownie otwierają modal.
 */
export function CookieConsent() {
  const [decided, setDecided] = useState(true);
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
      applyConsent(existing);
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

  useEffect(() => {
    if (!prefsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && decided) setPrefsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prefsOpen, decided]);

  const persist = useCallback(
    (choice: Pick<Consent, 'functional' | 'analytics' | 'marketing'>) => {
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
    if (!decided) return null;
    return (
      <button
        type="button"
        className="cc-trigger"
        aria-label="Preferencje cookies"
        title="Preferencje cookies"
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_PREFERENCES_EVENT))}
      >
        <Cookie />
      </button>
    );
  }

  const banner = (
    <div className="cc-card">
      <h2>Pliki cookies</h2>
      <p className="cc-text">
        Używamy plików cookie niezbędnych do działania serwisu (bezpieczeństwo, zapis Twojej
        decyzji). Za Twoją zgodą użyjemy też cookies opcjonalnych
        {cats.analytics || cats.marketing
          ? ' — funkcjonalnych, analitycznych i marketingowych'
          : ' — funkcjonalnych (zapamiętywanie udogodnień)'}
        . Zgodę możesz w każdej chwili zmienić lub wycofać — przycisk „Preferencje cookies" jest
        stale dostępny w rogu ekranu i w stopce. Szczegóły:{' '}
        <a href="https://panel.verris.pl/legal">Polityka cookies</a>.
      </p>
      <div className="cc-actions">
        <button type="button" className="btn btn-primary" onClick={acceptAll}>
          Akceptuj wszystkie
        </button>
        <button type="button" className="btn btn-ghost" onClick={necessaryOnly}>
          Tylko niezbędne
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setPrefsOpen(true)}>
          Personalizuj
        </button>
      </div>
    </div>
  );

  const prefs = (
    <div className="cc-card" role="dialog" aria-modal="true" aria-label="Ustawienia plików cookies">
      <div className="cc-head">
        <h2>Preferencje cookies</h2>
        {decided ? (
          <button type="button" className="cc-close" aria-label="Zamknij" onClick={() => setPrefsOpen(false)}>
            ✕
          </button>
        ) : null}
      </div>
      <div className="cc-rows">
        <Row
          label="Niezbędne"
          desc="Bezpieczeństwo, poprawne działanie serwisu i zapis Twojej decyzji. Zawsze aktywne."
          checked
          disabled
        />
        <Row
          label="Funkcjonalne"
          desc="Zapamiętują udogodnienia i preferencje interfejsu."
          checked={functional}
          onChange={setFunctional}
        />
        {cats.analytics && (
          <Row
            label="Analityczne"
            desc="Pomiar korzystania z serwisu (np. Google Analytics przez Google Tag Manager)."
            checked={analytics}
            onChange={setAnalytics}
          />
        )}
        {cats.marketing && (
          <Row
            label="Marketingowe"
            desc="Dopasowanie i pomiar skuteczności reklam (np. Meta Pixel, tagi reklamowe Google)."
            checked={marketing}
            onChange={setMarketing}
          />
        )}
      </div>
      <div className="cc-actions">
        <button type="button" className="btn btn-primary" onClick={saveSelection}>
          Zapisz wybór
        </button>
        <button type="button" className="btn btn-ghost" onClick={necessaryOnly}>
          Tylko niezbędne
        </button>
        <button type="button" className="btn btn-ghost" onClick={acceptAll}>
          Akceptuj wszystkie
        </button>
      </div>
    </div>
  );

  if (prefsOpen) {
    return <div className="cc-overlay">{prefs}</div>;
  }
  return <div className="cc-bar">{banner}</div>;
}

function Row(props: {
  label: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const { label, desc, checked, disabled, onChange } = props;
  return (
    <div className="cc-row">
      <div>
        <h3>{label}</h3>
        <p>{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className="cc-sw"
        onClick={() => onChange?.(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

export function CookiePreferencesButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className || 'cc-prefslink'}
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_PREFERENCES_EVENT))}
    >
      Preferencje cookies
    </button>
  );
}
