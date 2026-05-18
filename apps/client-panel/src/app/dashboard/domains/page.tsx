'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle,
  Button,
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow,
  Badge,
  Input,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@verris/ui';
import { Globe, MoreVertical, Plus, RefreshCw, AlertCircle, Info, Trash2, CheckCircle2, ShoppingCart } from 'lucide-react';
import { HostingTabs } from '../components/hosting-tabs';
import { fetchUserDomains, addDomain, deleteDomain } from './actions';
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
  }, []);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainName) return;

    setAdding(true);
    try {
      await addDomain(newDomainName.trim().toLowerCase());
      toast.success('Domena dodana subskrybcji');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Domeny</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">Zarządzaj domenami podpiętymi do Twojego hostingu.</p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => router.push('/dashboard/domains/registrar')}>
            <ShoppingCart className="h-4 w-4" /> Rejestrator
          </Button>
          <Button className="gap-2" onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4" /> Dodaj domenę
          </Button>
        </div>

        {isAddOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <div 
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
              onClick={() => setIsAddOpen(false)}
            />
            <div className="relative z-50 w-full max-w-lg rounded-xl border border-border/50 bg-background p-6 shadow-2xl animate-in zoom-in-95 fade-in-0 duration-200">
              <div className="flex flex-col gap-2 mb-6">
                <h2 className="text-xl font-semibold tracking-tight">Dodaj nową domenę</h2>
                <p className="text-sm text-muted-foreground">
                  Wprowadź nazwę domeny, którą chcesz podpiąć pod środowisko Verris.
                </p>
              </div>

              <form onSubmit={handleAddDomain} className="space-y-4">
                <div className="space-y-2">
                  <Input 
                    placeholder="np. mojadomena.pl" 
                    value={newDomainName}
                    onChange={(e) => setNewDomainName(e.target.value)}
                    disabled={adding}
                    autoFocus
                  />
                </div>
                <div className="rounded-lg p-4 bg-primary/5 text-primary border border-primary/20">
                  <div className="flex items-center gap-2 font-medium mb-1">
                    <Info className="h-4 w-4" />
                    Instrukcja DNS
                  </div>
                  <div className="text-sm">
                    Po dodaniu domeny, upewnij się że jej rekordy NS wskazują na nasze NameServery:
                    <ul className="list-disc ml-5 mt-2 font-mono">
                      <li>ns1.verris.pl</li>
                      <li>ns2.verris.pl</li>
                    </ul>
                    Propagacja zmian DNS może potrwać od 1 do 24 godzin. Status się zmieni po pełnym rozgłoszeniu.
                  </div>
                </div>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6">
                  <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} disabled={adding}>
                    Anuluj
                  </Button>
                  <Button type="submit" disabled={adding || !newDomainName}>
                    {adding ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                    Dodaj domenę
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <HostingTabs currentTab="domains" />

      <div className="relative rounded-[32px] p-px overflow-hidden group">
        <div className="absolute -inset-full animate-[spin_1.5s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_70%,#ffffff_100%)] opacity-20 pointer-events-none transition-opacity duration-1500 pointer-events-none" />
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
            ) : (
              <div className="rounded-xl border border-white/5 bg-[#050505] overflow-x-auto shadow-inner">
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
                                  onClick={() => router.push(`/dashboard/domains/${domain.id}`)}
                                >
                                  Zarządzaj
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-white/10" />
                                <DropdownMenuItem className="cursor-pointer hover:bg-white/10 focus:bg-white/10 focus:text-white" onClick={() => loadDomains()}>
                                  <RefreshCw className="w-4 h-4 mr-2" /> Odśwież status
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-white/10" />
                                <DropdownMenuItem 
                                  className="cursor-pointer text-red-400 hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-400"
                                  onClick={() => handleDeleteDomain(domain.id, domain.name)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" /> Usuń domenę
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

