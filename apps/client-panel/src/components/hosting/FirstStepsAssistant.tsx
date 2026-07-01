'use client';

import { Check, ChevronRight, Globe, ShieldCheck, LayoutTemplate, Mail, Sparkles } from 'lucide-react';
import type { ServiceHealthSummaryDto } from '@verris/contracts';

/**
 * UX-2 — „Asystent startu". Zamienia surowe checki zdrowia w prowadzące za rękę,
 * klikalne kroki dla świeżo założonej usługi. Pokazuje się, dopóki podstawy
 * (domena + SSL) nie są gotowe — potem znika, by nie zaśmiecać ustawionej strony.
 *
 * Ton: uspokajający, „przeprowadzimy Cię" — klient nie boi się działać sam.
 */
export function FirstStepsAssistant({
  health,
  productKind = 'HOSTING',
  onNavigate,
}: {
  health: ServiceHealthSummaryDto | null;
  productKind?: 'HOSTING' | 'EMAIL' | 'EMAIL_MARKETING';
  onNavigate: (tab: string) => void;
}) {
  const dnsOk = health?.checks.dnsOk === true;
  const tlsOk = health?.checks.tlsOk === true;
  const mailOk = health?.checks.mailOk === true;
  const isEmail = productKind === 'EMAIL';

  type Step = {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    desc: string;
    done: boolean;
    cta: string;
    tab: string;
  };

  // #26 — kroki dopasowane do produktu (hosting vs poczta).
  const baseDone = isEmail
    ? (dnsOk ? 1 : 0) + (mailOk ? 1 : 0)
    : (dnsOk ? 1 : 0) + (tlsOk ? 1 : 0);

  // Podstawy gotowe → nie pokazujemy asystenta (usługa skonfigurowana).
  if (baseDone === 2) return null;

  const emailSteps: Step[] = [
    {
      icon: Globe,
      title: 'Skonfiguruj DNS poczty (MX, SPF, DKIM)',
      desc: 'Wskaż domenę na nasze serwery poczty — pokażemy dokładne rekordy do wpisania.',
      done: dnsOk,
      cta: dnsOk ? 'Gotowe' : 'Przejdź do Domen & DNS',
      tab: 'domains',
    },
    {
      icon: Mail,
      title: 'Załóż skrzynki e-mail',
      desc: 'Utwórz adresy w swojej domenie, np. kontakt@twojadomena.pl, i ustaw hasła.',
      done: false,
      cta: 'Przejdź do Poczty',
      tab: 'mail',
    },
    {
      icon: ShieldCheck,
      title: 'Sprawdź dostarczalność',
      desc: 'Potwierdź, że serwer poczty odpowiada i wiadomości nie trafiają do spamu.',
      done: mailOk,
      cta: mailOk ? 'Gotowe' : 'Sprawdź pocztę',
      tab: 'mail',
    },
  ];

  const hostingSteps: Step[] = [
    {
      icon: Globe,
      title: 'Skieruj domenę na hosting',
      desc: 'Ustaw nameservery lub rekord A — pokażemy dokładnie co i gdzie wpisać.',
      done: dnsOk,
      cta: dnsOk ? 'Gotowe' : 'Przejdź do Domen',
      tab: 'domains',
    },
    {
      icon: ShieldCheck,
      title: 'Włącz certyfikat SSL (kłódka, HTTPS)',
      desc: 'Darmowy certyfikat Let’s Encrypt jednym kliknięciem — gdy domena już wskazuje na nas.',
      done: tlsOk,
      cta: tlsOk ? 'Gotowe' : 'Przejdź do SSL',
      tab: 'ssl',
    },
    {
      icon: LayoutTemplate,
      title: 'Postaw swoją stronę',
      desc: 'Zainstaluj WordPressa lub inną aplikację jednym kliknięciem — bez konfiguracji.',
      done: false,
      cta: 'Zainstaluj aplikację',
      tab: 'apps',
    },
    {
      icon: Mail,
      title: 'Załóż firmową pocztę (opcjonalnie)',
      desc: 'Adres w Twojej domenie, np. kontakt@twojadomena.pl.',
      done: false,
      cta: 'Przejdź do Poczty',
      tab: 'mail',
    },
  ];

  const steps = isEmail ? emailSteps : hostingSteps;

  return (
    <div className="rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.08] to-transparent p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="rounded-xl border border-violet-400/30 bg-violet-500/15 p-2 text-violet-200">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white sm:text-base">
            {isEmail ? 'Uruchom pocztę — przeprowadzimy Cię za rękę' : 'Uruchom stronę — przeprowadzimy Cię za rękę'}
          </h3>
          <p className="text-xs text-neutral-400">
            Podstawy: <span className="text-white">{baseDone}/2</span> gotowe. Spokojnie — nic nie zepsujesz,
            a my podpowiadamy na każdym kroku.
          </p>
        </div>
        <span className="shrink-0 text-xs font-bold text-violet-200">{Math.round((baseDone / 2) * 100)}%</span>
      </div>

      {/* Pasek postępu podstaw (domena + SSL / domena + poczta). */}
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-400 transition-all duration-500"
          style={{ width: `${(baseDone / 2) * 100}%` }}
        />
      </div>

      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.tab}>
            <button
              type="button"
              onClick={() => onNavigate(s.tab)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                s.done
                  ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  s.done
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-white/10 text-neutral-300'
                }`}
              >
                {s.done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <s.icon className="hidden h-4 w-4 shrink-0 text-violet-300 sm:block" />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${s.done ? 'text-emerald-100' : 'text-white'}`}>
                  {s.title}
                </span>
                <span className="block text-[11px] text-neutral-400">{s.desc}</span>
              </span>
              <span
                className={`inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium ${
                  s.done ? 'text-emerald-300' : 'text-violet-200'
                }`}
              >
                {s.cta}
                {s.done ? null : <ChevronRight className="h-3.5 w-3.5" />}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
