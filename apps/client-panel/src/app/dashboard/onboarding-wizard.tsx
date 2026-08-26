'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Globe,
  Loader2,
  Mail,
  Rocket,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { OnboardingSnapshot } from './onboarding-data';
import {
  podsumujKroki,
  podtytulKrokow,
  zbudujKroki,
  type StanKroku,
} from './onboarding-kroki';

const DISMISS_KEY = 'verris_onboarding_dismissed_v1';

// PANEL-01: kroki są danymi (`onboarding-kroki.ts`), tutaj zostaje wyłącznie
// warstwa wizualna. Ikona jest cechą prezentacji, nie stanu konfiguracji.
const IKONY: Record<string, React.ReactNode> = {
  provisioning: <Loader2 className="h-4 w-4 animate-spin text-amber-300" />,
  site: <Sparkles className="h-4 w-4" />,
  dns: <Globe className="h-4 w-4" />,
  ssl: <ShieldCheck className="h-4 w-4" />,
  mail: <Mail className="h-4 w-4" />,
};

/**
 * Trzy stany, trzy różne znaczniki. `nieznane` NIE dostaje pustego kółka —
 * puste kółko czyta się jak „nie zrobiłeś", a my po prostu nie wiemy.
 */
function znacznik(stan: StanKroku) {
  if (stan === 'zrobione') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (stan === 'niezrobione') return <Circle className="h-4 w-4 text-neutral-500" />;
  return (
    <span
      className="block h-4 w-4 rounded-full border border-dashed border-neutral-600"
      title="Tego kroku nie sprawdzamy automatycznie"
      aria-label="Nie sprawdzamy automatycznie"
    />
  );
}

export function OnboardingWizard({ snapshot }: { snapshot: OnboardingSnapshot }) {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    setReady(true);
  }, []);

  if (!ready || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  // No service yet → single welcome CTA.
  if (!snapshot.hasService) {
    return (
      <Banner onDismiss={dismiss} title="Witaj w Verris! Zacznijmy 🚀" subtitle="Uruchom pierwszą usługę — zajmie chwilę.">
        <Link
          href="/dashboard/services/new"
          className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-black hover:bg-neutral-200"
        >
          <Rocket className="h-4 w-4" /> Zamów hosting lub pocztę
        </Link>
      </Banner>
    );
  }

  const kroki = zbudujKroki(snapshot);
  const podsumowanie = podsumujKroki(kroki);

  return (
    <Banner onDismiss={dismiss} title="Pierwsze kroki" subtitle={podtytulKrokow(podsumowanie)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
        {kroki.map((k) => (
          <Link
            key={k.klucz}
            href={k.href}
            className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
              k.stan === 'zrobione'
                ? 'border-emerald-400/25 bg-emerald-400/[0.05]'
                : 'border-white/10 bg-white/[0.02] hover:border-white/30'
            }`}
          >
            <span className="shrink-0">{znacznik(k.stan)}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-white">
                {IKONY[k.klucz]}
                {k.tytul}
              </span>
              <span className="block text-xs text-neutral-400">{k.opis}</span>
            </span>
            {k.stan !== 'zrobione' ? (
              <span className="shrink-0 inline-flex items-center gap-1 text-xs text-neutral-300 group-hover:text-white">
                {k.cta} <ArrowRight className="h-3 w-3" />
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </Banner>
  );
}

function Banner({
  title,
  subtitle,
  onDismiss,
  children,
}: {
  title: string;
  subtitle: string;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="relative rounded-2xl border border-indigo-400/20 bg-linear-to-br from-indigo-500/10 to-violet-500/5 p-5">
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-3 top-3 rounded-md p-1 text-neutral-400 hover:bg-white/10 hover:text-white"
        title="Ukryj"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="mb-3">
        <h2 className="text-base font-bold text-white">{title}</h2>
        <p className="text-sm text-neutral-300">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}
