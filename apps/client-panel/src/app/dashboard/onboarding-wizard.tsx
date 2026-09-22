'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
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
  provisioning: <Loader2 className="h-4 w-4 animate-spin text-warn" />,
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
  if (stan === 'zrobione') return <CheckCircle2 className="h-4 w-4 text-data-hi" />;
  if (stan === 'niezrobione') return <Circle className="h-4 w-4 text-muted-foreground" />;
  return (
    <span
      className="block h-4 w-4 rounded-full border border-dashed border-line-strong"
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

  // PB-15 — wygląd jak we wzorcu: box „Pierwsze kroki", licznik, pasek postępu, lista.
  if (!snapshot.hasService) {
    return (
      <Box title="Pierwsze kroki" onDismiss={dismiss}>
        <p className="px-4 pt-1.5 text-[13.5px] text-muted-foreground">Uruchom pierwszą usługę — zajmie chwilę.</p>
        <div className="px-4 pb-4 pt-3">
          <Link href="/dashboard/services/new" className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
            <Rocket className="h-4 w-4" /> Zamów hosting lub pocztę
          </Link>
        </div>
      </Box>
    );
  }

  const kroki = zbudujKroki(snapshot);
  const p = podsumujKroki(kroki);
  const pct = p.sprawdzane > 0 ? Math.round((p.zrobione / p.sprawdzane) * 100) : 0;

  return (
    <Box title="Pierwsze kroki" counter={p.sprawdzane > 0 ? `${p.zrobione} z ${p.sprawdzane}` : undefined} onDismiss={dismiss}>
      {p.sprawdzane > 0 ? (
        <div className="px-4 pt-2" data-tip={`${pct}% gotowe\n${podtytulKrokow(p)}`}>
          <span className="block h-[5px] overflow-hidden rounded-[3px] bg-raised">
            <i className="block h-full bg-data" style={{ width: `${pct}%` }} />
          </span>
        </div>
      ) : null}
      <ul className="m-0 mt-1 list-none p-0">
        {kroki.map((k) => (
          <li key={k.klucz} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5 border-t border-line px-4 py-2.5 first:border-t-0">
            <span className="text-muted-foreground">{IKONY[k.klucz]}</span>
            <span className="min-w-0">
              <b className={`block text-sm ${k.stan === 'zrobione' ? 'font-medium text-muted-foreground line-through' : 'font-semibold text-foreground'}`}>{k.tytul}</b>
              {k.stan !== 'zrobione' ? <small className="block text-[12.5px] text-muted-foreground">{k.opis}</small> : null}
            </span>
            <span className="flex items-center gap-2">
              {znacznik(k.stan)}
              {k.stan === 'zrobione' ? (
                <span className="text-[12.5px] font-semibold text-data-hi">zrobione</span>
              ) : (
                <Link href={k.href} className="whitespace-nowrap text-[12.5px] font-semibold text-primary underline underline-offset-[3px]">
                  {k.cta}
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
      {p.nieznane > 0 ? (
        <p className="m-0 flex items-center gap-2 border-t border-line px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
          <span className="block h-3 w-3 flex-none rounded-full border border-dashed border-line-strong" />
          {p.nieznane === 1 ? 'tego kroku nie sprawdzamy automatycznie, licznik go pomija' : `${p.nieznane} kroków nie sprawdzamy automatycznie, licznik je pomija`}
        </p>
      ) : null}
    </Box>
  );
}

function Box({ title, counter, onDismiss, children }: { title: string; counter?: string; onDismiss: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] border border-line bg-card pb-1">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <h3 className="m-0 font-display text-[15px] font-bold text-foreground">{title}</h3>
        <span className="flex items-center gap-2">
          {counter ? <span className="font-mono text-xs text-muted-foreground">{counter}</span> : null}
          <button type="button" onClick={onDismiss} className="rounded p-1 text-muted-foreground hover:bg-raised hover:text-foreground" aria-label="Ukryj pierwsze kroki" data-tip="Ukryj">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      {children}
    </section>
  );
}
