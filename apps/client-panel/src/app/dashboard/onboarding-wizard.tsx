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

const DISMISS_KEY = 'verris_onboarding_dismissed_v1';

interface Step {
  key: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  done: boolean;
  href: string;
  cta: string;
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

  const sid = snapshot.serviceId;
  const q = sid ? `?serviceId=${sid}` : '';

  const steps: Step[] = snapshot.provisioning
    ? [
        {
          key: 'provisioning',
          title: 'Trwa zakładanie konta',
          body: 'Konfigurujemy Twoje konto na serwerze — to zwykle minuta. Odśwież stronę usługi.',
          icon: <Loader2 className="h-4 w-4 animate-spin text-amber-300" />,
          done: false,
          href: sid ? `/dashboard/services/${sid}` : '/dashboard/services',
          cta: 'Zobacz status',
        },
      ]
    : snapshot.isEmailProduct
      ? [
          step('mail', 'Utwórz skrzynki e-mail', 'Dodaj skrzynki na swojej domenie i zaloguj się do webmaila.', <Mail className="h-4 w-4" />, false, `/dashboard/email${q}`, 'Skrzynki'),
          step('dns', 'Skieruj rekordy MX/DNS', 'Upewnij się, że domena kieruje pocztę na nasz serwer.', <Globe className="h-4 w-4" />, snapshot.dnsOk === true, `/dashboard/dns${q}`, 'DNS'),
        ]
      : [
          step('site', 'Postaw stronę', 'Przenieś stronę od konkurencji albo zainstaluj WordPress / aplikację 1-click.', <Sparkles className="h-4 w-4" />, false, `/dashboard/apps${q}`, 'Aplikacje 1-click'),
          step('dns', 'Skieruj domenę', 'Wskaż domenę na nasz serwer (rekordy A/NS).', <Globe className="h-4 w-4" />, snapshot.dnsOk === true, `/dashboard/dns${q}`, 'DNS'),
          step('ssl', 'Włącz SSL', 'Darmowy certyfikat Let’s Encrypt dla bezpiecznego HTTPS.', <ShieldCheck className="h-4 w-4" />, snapshot.tlsOk === true, `/dashboard/ssl${q}`, 'SSL'),
          step('mail', 'Skonfiguruj pocztę', 'Utwórz skrzynki e-mail na swojej domenie.', <Mail className="h-4 w-4" />, false, `/dashboard/email${q}`, 'Poczta'),
        ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Banner
      onDismiss={dismiss}
      title="Pierwsze kroki"
      subtitle={`Skonfiguruj usługę w kilka chwil (${doneCount}/${steps.length} gotowe).`}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
        {steps.map((s) => (
          <Link
            key={s.key}
            href={s.href}
            className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
              s.done ? 'border-emerald-400/25 bg-emerald-400/[0.05]' : 'border-white/10 bg-white/[0.02] hover:border-white/30'
            }`}
          >
            <span className="shrink-0">
              {s.done ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 text-neutral-500" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-white">{s.icon}{s.title}</span>
              <span className="block text-xs text-neutral-400">{s.body}</span>
            </span>
            {!s.done ? (
              <span className="shrink-0 inline-flex items-center gap-1 text-xs text-neutral-300 group-hover:text-white">
                {s.cta} <ArrowRight className="h-3 w-3" />
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </Banner>
  );
}

function step(
  key: string,
  title: string,
  body: string,
  icon: React.ReactNode,
  done: boolean,
  href: string,
  cta: string,
): Step {
  return { key, title, body, icon, done, href, cta };
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
