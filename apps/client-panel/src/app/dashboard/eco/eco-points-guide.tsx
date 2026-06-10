import { Leaf, Sparkles } from 'lucide-react';
import type { EcoPlatformConfig } from './eco-data';
import { buildEcoPointRules } from '@/lib/eco-point-rules';

export function EcoPointsGuide({ platform }: { platform: EcoPlatformConfig }) {
  const rules = buildEcoPointRules(platform).filter((r) => r.id !== 'EKO_REDEEM_WALLET');
  const redeemRule = buildEcoPointRules(platform).find((r) => r.id === 'EKO_REDEEM_WALLET');

  return (
    <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 md:p-8">
      <div className="mb-6 max-w-2xl">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Sparkles className="h-5 w-5 text-emerald-400" aria-hidden />
          Jak zdobywasz punkty
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          Poniżej pełna rozpiska — bez niespodzianek. Historia każdej transakcji jest też w sekcji
          „Historia punktów” na dole strony.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-white">{rule.title}</p>
              <span className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-300">
                {rule.points}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-neutral-500">{rule.description}</p>
          </li>
        ))}
      </ul>

      {redeemRule ? (
        <div className="mt-6 rounded-xl border border-white/10 bg-black/20 px-4 py-4">
          <div className="flex items-start gap-3">
            <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/80" aria-hidden />
            <div>
              <p className="text-sm font-medium text-neutral-200">Na co wymieniasz punkty</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                {redeemRule.description} Przelicznik wymiany:{' '}
                <span className="font-mono text-neutral-300">{redeemRule.points}</span>.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
