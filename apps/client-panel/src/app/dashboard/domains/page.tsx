'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Input,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@verris/ui';
import { Globe, MoreVertical, Plus, RefreshCw, AlertCircle, Info, Trash2, CheckCircle2, ShoppingCart } from 'lucide-react';
import { HostingTabs } from '../components/hosting-tabs';
import { SpinBorder } from '@/components/spin-border';
import { PageHeaderRow, PanelModal } from '@/components/panel';
import { fetchUserDomains, addDomain, deleteDomain, fetchRegistrarStatus } from './actions';
import { DomainDto } from '@verris/contracts';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { toast } from 'sonner';

export default function DomainsPage() {
  const router = useRouter();
  const [domains, setDomains] = useState<DomainDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');
  const [adding, setAdding] = useState(false);
  const [registrarConfigured, setRegistrarConfigured] = useState(false);

  const loadDomains = () => {
    setLoading(true);
    fetchUserDomains().then((data) => {
      setDomains(data || []);
      setLoading(false);
    }).catch((err) => {
      console.error(err);
      toast.error('Błąd podczas ładowania domen');
      setLoading(false);
    });
  };

  useEffect(() => {
    loadDomains();
    fetchRegistrarStatus()
      .then((status) => setRegistrarConfigured(status.configured))
      .catch(() => setRegistrarConfigured(false));
  }, []);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainName) return;

    setAdding(true);
    try {
      await addDomain(newDomainName.trim().toLowerCase());
      toast.success('Domena dodana do konta');
      setIsAddOpen(false);
      setNewDomainName('');
      loadDomains();
    } catch (err: any) {
      toast.error(err.message || 'Nie udało się dodać domeny');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteDomain = async (id: string, name: string) => {
    if (!confirm(`Czy na pewno chcesz usunąć domenę ${name}?`)) return;
    try {
      await deleteDomain(id);
      toast.success(`Domena ${name} usunięta pomyślnie`);
      loadDomains();
    } catch (err: any) {
      toast.error(err.message || 'Błąd przy usuwaniu domeny');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeaderRow
        title="Domeny"
        description="Zarządzaj domenami podpiętymi do Twojego hostingu."
        actions={
          <>
            {registrarConfigured ? (
              <Button
                variant="outline"
                className="w-full gap-2 sm:w-auto"
                onClick={() => router.push('/dashboard/domains/buy')}
              >
                <ShoppingCart className="h-4 w-4" /> Kup domenę
              </Button>
            ) : null}
            <Button className="w-full gap-2 sm:w-auto" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-4 w-4" /> Dodaj domenę
            </Button>
          </>
        }
      />

      <PanelModal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Dodaj nową domenę"
        description="Wprowadź nazwę domeny podpiętej do hostingu Verris."
      >
        <form onSubmit={handleAddDomain} className="space-y-4">
          <Input
            placeholder="np. mojadomena.pl"
            value={newDomainName}
            onChange={(e) => setNewDomainName(e.target.value)}
            disabled={adding}
            autoFocus
          />
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-primary">
            <p className="mb-1 flex items-center gap-2 font-medium">
              <Info className="h-4 w-4" /> Instrukcja DNS
            </p>
            <p className="text-sm">
              Ustaw NS: <span className="font-mono">ns1.verris.pl</span>,{' '}
              <span className="font-mono">ns2.verris.pl</span> (propagacja do 24 h).
            </p>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} disabled={adding}>
              Anuluj
            </Button>
            <Button type="submit" disabled={adding || !newDomainName}>
              {adding ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
              Dodaj domenę
            </Button>
          </div>
        </form>
      </PanelModal>

      <HostingTabs currentTab="domains" />

      <div className="relative rounded-[32px] p-px overflow-hidden group">
        <SpinBorder variant="white" className="opacity-20 transition-opacity duration-[1500ms]" />
        <div className="relative rounded-[calc(32px-1px)] bg-[#0a0a0a] p-6 lg:p-8 flex flex-col z-10 transition-colors duration-300">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4 border-b border-white/5 pb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-white/5 text-white border border-white/10 shadow-inner">
                <Globe className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white tracking-wide">Twoje domeny</h2>
                <p className="text-sm text-neutral-400 mt-1">Lista wszystkich domen powiązanych z tym kontem hostingowym.</p>
              </div>
            </div>
            {loading && <RefreshCw className="h-4 w-4 animate-spin text-white" />}
          </div>
          <div>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 w-full bg-white/5 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : domains.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-[#050505] p-8 text-muted-foreground">
                <AlertCircle className="h-8 w-8 opacity-20" />
                <p>Brak podpiętych domen.</p>
              </div>
            ) : (
              <>
              <div className="space-y-3 md:hidden">
                {domains.map((domain) => (
                  <article key={domain.id} className="rounded-xl border border-white/10 bg-[#050505] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-bold text-white">{domain.name}</p>
                          {domain.kind === 'HOSTING' && (
                            <span className="shrink-0 rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                              Hosting
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-neutral-500">
                          {domain.createdAt
                            ? format(new Date(domain.createdAt), 'dd.MM.yyyy HH:mm', { locale: pl })
                            : 'Brak danych'}
                        </p>
                      </div>
                      <div
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          domain.status === 'ACTIVE'
                            ? 'border-white/20 text-white'
                            : domain.status === 'PENDING'
                              ? 'border-white/10 text-neutral-300'
                              : 'border-red-500/20 text-red-400'
                        }`}
                      >
                        {domain.status === 'ACTIVE' ? 'Aktywna' : domain.status === 'PENDING' ? 'DNS' : 'Wygasła'}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          router.push(
                            domain.kind === 'HOSTING' && domain.serviceId
                              ? `/dashboard/services/${domain.serviceId}`
                              : `/dashboard/domains/${domain.id}`,
                          )
                        }
                      >
                        Zarządzaj
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => loadDomains()}>
                        Odśwież
                      </Button>
                      {domain.kind !== 'HOSTING' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400"
                          onClick={() => handleDeleteDomain(domain.id, domain.name)}
                        >
                          Usuń
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden md:block rounded-xl border border-white/5 bg-[#050505] overflow-x-auto shadow-inner">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 border-b border-white/5 text-left">
                    <tr>
                      <th className="py-4 px-4 text-neutral-300 font-semibold">Domena</th>
                      <th className="px-4 text-neutral-300 font-semibold">Status</th>
                      <th className="px-4 text-neutral-300 font-semibold">Data dodania</th>
                      <th className="px-4 text-right text-neutral-300 font-semibold">Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="h-32 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground p-8">
                            <AlertCircle className="h-8 w-8 opacity-20" />
                            <p>Brak podpiętych domen.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      domains.map((domain) => (
                        <tr key={domain.id} className="border-b border-white/5 hover:bg-white/5 group/row transition-colors">
                          <td className="font-bold py-4 px-4 text-white">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-white border border-white/10 group-hover/row:scale-110 group-hover/row:bg-white/10 transition-all shadow-inner">
                                <Globe className="h-4 w-4" />
                              </div>
                              {domain.name}
                              {domain.kind === 'HOSTING' && (
                                <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                                  Hosting
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4">
                            <div className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                              domain.status === 'ACTIVE' 
                              ? "bg-white/5 text-white border-white/20"
                              : domain.status === 'PENDING'
                              ? "bg-[#121212] text-neutral-300 border-white/10"
                              : "bg-red-950/30 text-red-400 border-red-500/20"
                            }`}>
                              {domain.status === 'ACTIVE' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                              {domain.status === 'PENDING' && <RefreshCw className="w-3 h-3 mr-1 animate-spin" />}
                              {domain.status === 'ACTIVE' ? 'Aktywna' : domain.status === 'PENDING' ? 'Oczekująca (DNS)' : 'Wygasła'}
                            </div>
                          </td>
                          <td className="px-4 text-neutral-400">
                            {domain.createdAt ? format(new Date(domain.createdAt), 'dd.MM.yyyy HH:mm', { locale: pl }) : 'Brak danych'}
                          </td>
                          <td className="px-4 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-neutral-400 hover:bg-white/10 hover:text-white transition-colors border border-transparent hover:border-white/5">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-[#121212] border-white/10 text-white">
                                <DropdownMenuItem
                                  className="cursor-pointer font-medium hover:bg-white/10 focus:bg-white/10 focus:text-white"
                                  onClick={() =>
                                    router.push(
                                      domain.kind === 'HOSTING' && domain.serviceId
                                        ? `/dashboard/services/${domain.serviceId}`
                                        : `/dashboard/domains/${domain.id}`,
                                    )
                                  }
                                >
                                  Zarządzaj
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-white/10" />
                                <DropdownMenuItem className="cursor-pointer hover:bg-white/10 focus:bg-white/10 focus:text-white" onClick={() => loadDomains()}>
                                  <RefreshCw className="w-4 h-4 mr-2" /> Odśwież status
                                </DropdownMenuItem>
                                {domain.kind !== 'HOSTING' && (
                                  <>
                                    <DropdownMenuSeparator className="bg-white/10" />
                                    <DropdownMenuItem
                                      className="cursor-pointer text-red-400 hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-400"
                                      onClick={() => handleDeleteDomain(domain.id, domain.name)}
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" /> Usuń domenę
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

