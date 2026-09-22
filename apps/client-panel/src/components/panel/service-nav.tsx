'use client';

/**
 * PB-15 — sekcja usługi w menu bocznym (wzorzec: docs/design/wzorzec-panelu.html):
 * nazwa usługi, Przegląd + drzewo domen, pogrupowane sekcje, rozliczenie.
 * Zakładka jest w adresie (?tab=), więc linki działają też z nowej karty.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowRightLeft, Gauge, Plus, Server } from 'lucide-react';
import { fetchServiceKindAction } from '@/app/dashboard/services/[id]/hosting-service-actions';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import { NAV_GROUPS, SIMPLE_MODE_KEY, TABS, isTabId, visibleTabIds } from '@/app/dashboard/services/[id]/tabs';

const ROW = 'flex w-full items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-left text-sm transition-colors';
const ROW_ON = 'bg-verris-mint/[0.08] text-verris-paper shadow-[inset_2px_0_0_var(--verris-mint)]';
const ROW_OFF = 'text-sidebar-foreground hover:bg-white/[0.04] hover:text-verris-paper';

export function ServiceNav({ serviceId, name, domainsCount }: { serviceId: string; name?: string; domainsCount?: number }) {
  const sp = useSearchParams();
  const kindHint = sp.get('kind');
  const [kind, setKind] = useState<string | null>(kindHint);
  const [domains, setDomains] = useState<string[]>([]);
  const [simple, setSimple] = useState(false);
  const pathname = usePathname();
  const base = `/dashboard/services/${serviceId}`;
  const siteOpen = pathname.startsWith(`${base}/sites/`) ? decodeURIComponent(pathname.slice(base.length + 7)) : null;
  // Na podstronach (strona/domena, plan, autoskalowanie) żadna zakładka nie jest aktywna.
  const tab = pathname !== base ? null : isTabId(sp.get('tab')) ? sp.get('tab') : 'overview';

  useEffect(() => {
    let off = false;
    fetchServiceKindAction(serviceId)
      .then((s) => !off && setKind(s?.productKind ?? 'HOSTING'))
      .catch(() => !off && setKind((k) => k ?? 'HOSTING'));
    return () => {
      off = true;
    };
  }, [serviceId]);

  useEffect(() => {
    if (kind !== 'HOSTING') return;
    let off = false;
    fetchHostingDomainsAction(serviceId)
      // Gdy węzeł nie odpowiada, lista bywa pusta — domena główna i tak jest znana z bazy.
      .then((r) => !off && setDomains(r.domains.length ? r.domains.map((d) => d.name) : r.primaryDomain ? [r.primaryDomain] : []))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [kind, serviceId]);

  useEffect(() => {
    const sync = () => {
      try {
        setSimple(localStorage.getItem(SIMPLE_MODE_KEY) === '1');
      } catch {
        /* pełny */
      }
    };
    sync();
    window.addEventListener('verris-mode', sync);
    return () => window.removeEventListener('verris-mode', sync);
  }, []);

  const email = kind === 'EMAIL';
  const visible = visibleTabIds({ email, kindResolved: kind != null, simple });
  const href = (t: string) => `/dashboard/services/${serviceId}?tab=${t}${kind ? `&kind=${kind}` : ''}`;

  return (
    <div className="mt-4 rounded-[10px] border border-white/[0.06] bg-verris-mint/[0.025] px-1.5 py-2">
      <div className="mb-1.5 flex items-center gap-2 border-b border-white/[0.06] px-1.5 pb-2">
        <Server className="h-[15px] w-[15px] text-verris-stone" />
        <b className="min-w-0 truncate font-display text-sm font-bold text-verris-paper">{name ?? (email ? 'Poczta' : 'Hosting')}</b>
        {!email && (domainsCount ?? domains.length) > 0 ? (
          <small className="ml-auto shrink-0 font-mono text-[11px] text-verris-stone">
            {domainsCount ?? domains.length} {(domainsCount ?? domains.length) === 1 ? 'domena' : 'domen'}
          </small>
        ) : null}
      </div>
      <nav aria-label="Sekcje usługi" className="flex flex-col gap-px">
        {NAV_GROUPS.map((g, gi) => {
          const items = g.ids.filter((id) => visible.includes(id)).map((id) => TABS.find((t) => t.id === id)!);
          if (items.length === 0) return null;
          return (
            <div key={g.label}>
              {gi > 0 ? (
                <div className="px-2 pb-1 pt-2.5 font-mono text-[10.5px] uppercase leading-none tracking-[0.08em] text-verris-stone">{g.label}</div>
              ) : null}
              {items.map((t) => (
                <div key={t.id}>
                  <Link href={href(t.id)} scroll={false} aria-current={tab === t.id ? 'page' : undefined} className={`${ROW} ${tab === t.id ? ROW_ON : ROW_OFF}`}>
                    <t.icon className="h-4 w-4 shrink-0 opacity-70" />
                    {t.label}
                  </Link>
                  {t.id === 'overview' && !email ? (
                    <div className="mb-1.5 ml-3.5 mt-0.5 border-l border-white/[0.06] pl-1.5">
                      {domains.map((d, i) => (
                        <Link key={d} href={`${base}/sites/${encodeURIComponent(d)}`} title={d} aria-current={siteOpen === d ? 'page' : undefined} className={`${ROW} ${siteOpen === d ? ROW_ON : ROW_OFF} py-[5px] text-[13.5px]`}>
                          <span className="v2-breathe h-1.5 w-1.5 flex-none rounded-full bg-verris-mint" style={{ ['--v2-i' as string]: i }} />
                          <span className="truncate">{d}</span>
                        </Link>
                      ))}
                      <Link href={href('domains')} scroll={false} className={`${ROW} ${ROW_OFF} py-[5px] text-[13.5px]`}>
                        <Plus className="h-3.5 w-3.5 opacity-70" />
                        <span className="text-verris-stone">Dodaj domenę</span>
                      </Link>
                    </div>
                  ) : null}
                </div>
              ))}
              {g.label === 'Rozliczenie' ? (
                <>
                  {!email ? (
                    <Link href={`/dashboard/services/${serviceId}/autoscaling`} className={`${ROW} ${ROW_OFF}`}>
                      <Gauge className="h-4 w-4 shrink-0 opacity-70" />
                      Autoskalowanie i EKO
                    </Link>
                  ) : null}
                  <Link href={`/dashboard/services/${serviceId}/plan`} className={`${ROW} ${ROW_OFF}`}>
                    <ArrowRightLeft className="h-4 w-4 shrink-0 opacity-70" />
                    Zmiana planu
                  </Link>
                </>
              ) : null}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
