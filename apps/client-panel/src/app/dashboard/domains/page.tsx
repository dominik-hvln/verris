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
import { MoreVertical, Plus, RefreshCw, Info, Trash2, ShoppingCart } from 'lucide-react';
import { Kpi, KpiStrip, SectionHead } from '@/components/panel/v2';
import { isExpiringSoon } from '@/lib/domain-expiry';
import { PageHeaderRow, PanelModal } from '@/components/panel';
import { fetchUserDomains, addDomain, deleteDomain, fetchRegistrarStatus } from './actions';
import { DomainDto } from '@verris/contracts';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { toast } from 'sonner';

const TH = 'whitespace-nowrap px-3 pb-2.5 pt-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground';
const TD = 'border-t border-line px-3 py-[11px] align-middle';

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
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
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

      <KpiStrip>
        <Kpi label="Domeny" value={loading ? '…' : domains.length} foot={<span>na koncie</span>} />
        <Kpi label="Aktywne" value={loading ? '…' : domains.filter((d) => d.status === 'ACTIVE').length} foot={<span>działają</span>} />
        <Kpi
          label="Czekają na DNS"
          value={loading ? '…' : domains.filter((d) => d.status === 'PENDING').length}
          foot={<span>propagacja do 24 h</span>}
        />
        <Kpi
          label="Do odnowienia"
          value={loading ? '…' : domains.filter((d) => isExpiringSoon(d.expiresAt) || d.status === 'EXPIRED').length}
          foot={<span>koniec rejestracji w 30 dni</span>}
        />
      </KpiStrip>

      <section>
        <SectionHead title="Twoje domeny" desc="Domena na hostingu prowadzi do widoku strony: DNS, SSL, pliki, poczta i PHP." />
        {loading ? (
          <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-[22px] text-sm text-muted-foreground">Wczytywanie domen…</p>
        ) : domains.length === 0 ? (
          <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-[22px] text-sm text-muted-foreground">Brak podpiętych domen.</p>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
            <table className="v2-stack w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={TH}>Domena</th>
                  <th className={TH}>Stan</th>
                  <th className={TH}>Wygasa</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {domains.map((domain) => {
                  const href =
                    domain.kind === 'HOSTING' && domain.serviceId
                      ? `/dashboard/services/${domain.serviceId}/sites/${encodeURIComponent(domain.name)}`
                      : `/dashboard/domains/${domain.id}`;
                  return (
                    <tr
                      key={domain.id}
                      tabIndex={0}
                      aria-label={`Otwórz ${domain.name}`}
                      className="group cursor-pointer hover:bg-raised/40"
                      onClick={() => router.push(href)}
                      onKeyDown={(e) => e.key === 'Enter' && router.push(href)}
                    >
                      <td className={TD} data-label="Domena">
                        <b className="block font-semibold text-foreground">{domain.name}</b>
                        <span className="text-[12.5px] text-muted-foreground">{domain.kind === 'HOSTING' ? 'na hostingu' : 'zarejestrowana'}</span>
                      </td>
                      <td className={TD} data-label="Stan">
                        <span
                          className={`inline-flex items-center gap-[7px] whitespace-nowrap text-[12.5px] font-semibold ${
                            domain.status === 'ACTIVE' ? 'text-data-hi' : 'text-warn'
                          }`}
                        >
                          <span className={`h-[7px] w-[7px] rounded-full bg-current ${domain.status === 'ACTIVE' ? 'v2-breathe' : 'v2-breathe v2-breathe-warn'}`} />
                          {domain.status === 'ACTIVE' ? 'działa' : domain.status === 'PENDING' ? 'czeka na DNS' : 'wygasła'}
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap font-mono text-xs`} data-label="Wygasa">
                        {domain.expiresAt ? (
                          <span className={isExpiringSoon(domain.expiresAt) ? 'font-semibold text-warn' : 'text-muted-foreground'}>
                            {format(new Date(domain.expiresAt), 'd MMM yyyy', { locale: pl })}
                            {domain.autoRenew ? <span className="ml-1.5 text-muted-foreground">odnawia się sama</span> : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{domain.kind === 'HOSTING' ? 'przy usłudze' : '—'}</span>
                        )}
                      </td>
                      <td data-label="Akcje" className={`${TD} w-10 text-right`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" aria-label={`Akcje: ${domain.name}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-raised hover:text-foreground">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="border-line-strong bg-card text-foreground">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => router.push(href)}>
                              Zarządzaj
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => loadDomains()}>
                              <RefreshCw className="mr-2 h-4 w-4" /> Odśwież stan
                            </DropdownMenuItem>
                            {domain.kind !== 'HOSTING' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="cursor-pointer text-crit" onClick={() => handleDeleteDomain(domain.id, domain.name)}>
                                  <Trash2 className="mr-2 h-4 w-4" /> Usuń domenę
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

