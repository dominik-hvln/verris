'use client';

import { useEffect, useState } from 'react';
import { Globe, Server, ShieldCheck } from 'lucide-react';
import { fetchPublicStats, type PublicStats } from './trust-stats-action';

function fmt(n: number): string {
  return new Intl.NumberFormat('pl-PL').format(n);
}

/**
 * O-5 — trust signals (social proof) for the login/register pages. Renders only
 * once meaningful real numbers are available; stays invisible on a fresh/empty
 * install so we never show "0 stron hostowanych".
 */
export function TrustStats({ className }: { className?: string }) {
  const [stats, setStats] = useState<PublicStats | null>(null);

  useEffect(() => {
    void fetchPublicStats().then(setStats);
  }, []);

  if (!stats || stats.hostedAccounts < 1) return null;

  const items = [
    { icon: <Globe className="h-4 w-4" />, value: stats.hostedAccounts, label: 'stron hostowanych' },
    { icon: <ShieldCheck className="h-4 w-4" />, value: stats.domains, label: 'domen pod opieką' },
    { icon: <Server className="h-4 w-4" />, value: stats.activeNodes, label: 'serwerów w chmurze' },
  ].filter((i) => i.value > 0);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {items.map((i) => (
          <span key={i.label} className="inline-flex items-center gap-1.5">
            <span className="text-primary">{i.icon}</span>
            <strong className="text-foreground">{fmt(i.value)}</strong> {i.label}
          </span>
        ))}
      </div>
    </div>
  );
}
