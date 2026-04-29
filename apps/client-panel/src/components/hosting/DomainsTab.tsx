'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Globe,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button } from '@ekohost/ui';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';

interface Props {
  serviceId: string;
}

export default function DomainsTab({ serviceId }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domains, setDomains] = useState<{ name: string }[]>([]);
  const [daUser, setDaUser] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [primaryDomain, setPrimaryDomain] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchHostingDomainsAction(serviceId);
      setDomains(res.domains);
      setDaUser(res.daUsername);
      setFetchError(res.fetchError);
      setPrimaryDomain(res.primaryDomain);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać domen.');
      setDomains([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-neutral-400">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
        Wczytywanie domen z DirectAdmin…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="relative rounded-[32px] p-px overflow-hidden group">
        <div className="relative rounded-[calc(32px-1px)] bg-[#0a0a0a] p-6 lg:p-8 flex flex-col z-10 transition-colors duration-300 border border-white/10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4 border-b border-white/5 pb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-white/5 text-white border border-white/10 shadow-inner">
                <Globe className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-wide">Domeny (DirectAdmin)</h2>
                <p className="text-sm text-neutral-400 mt-1 max-w-xl">
                  Lista synchronizowana na żywo z kontem hostingowym (
                  {daUser ? (
                    <span className="font-mono text-neutral-200">{daUser}</span>
                  ) : (
                    'brak konta'
                  )}
                  ). Dodawanie i strefy DNS zarządzasz bezpośrednio w DirectAdmin lub przez nasz support.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={onRefresh}
              className="gap-2 border-white/15 bg-white/[0.04] text-white hover:bg-white/10"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Odśwież
            </Button>
          </div>

          {error ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              {error}
            </div>
          ) : null}

          {fetchError ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>
                Odczyt z DirectAdmin nie powiódł się: {fetchError}. Sprawdź połączenie z węzłem lub skontaktuj
                się z supportem — konto lub hasło mogło ulec zmianie.
              </span>
            </div>
          ) : null}

          <div className="rounded-xl border border-white/5 bg-[#050505] overflow-x-auto shadow-inner">
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-white/5 text-left">
                <tr>
                  <th className="py-4 px-4 text-neutral-300 font-semibold">Domena</th>
                  <th className="px-4 text-neutral-300 font-semibold">Rola</th>
                  <th className="px-4 text-neutral-300 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {domains.length === 0 && !fetchError ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-neutral-500">
                      Brak wpisów domen w DirectAdmin dla tego konta (lub konto jeszcze nie provisionowane).
                    </td>
                  </tr>
                ) : null}
                {domains.map((d) => {
                  const primary =
                    primaryDomain && d.name.toLowerCase() === primaryDomain.toLowerCase();
                  return (
                    <tr key={d.name} className="border-b border-white/5 hover:bg-white/5 group/row transition-colors">
                      <td className="font-bold py-4 px-4 text-white">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-white border border-white/10 shrink-0">
                            <Globe className="h-4 w-4" />
                          </div>
                          <span className="truncate">{d.name}</span>
                        </div>
                      </td>
                      <td className="px-4 text-neutral-400">
                        {primary ? (
                          <span className="text-xs bg-cyan-500/15 text-cyan-200 px-2 py-0.5 rounded border border-cyan-500/30">
                            Konto główne
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-500">Dodatkowa / alias</span>
                        )}
                      </td>
                      <td className="px-4">
                        <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-white/5 text-white border-white/20">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Na serwerze DA
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
