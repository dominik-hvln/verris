'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe2,
  Loader2,
  RefreshCw,
  Search,
  Server,
  ShoppingCart,
} from 'lucide-react';
import { Button, Input } from '@verris/ui';
import { PageHeaderRow } from '@/components/panel';
import { SpinBorder } from '@/components/spin-border';
import { toast } from 'sonner';
import {
  quoteDomainAction,
  registerDomainClientAction,
  transferDomainAction,
  type RegistrarOrderRow,
} from '../actions';

const TLD_OPTIONS = [
  { value: 'pl', label: '.pl' },
  { value: 'com.pl', label: '.com.pl' },
  { value: 'org.pl', label: '.org.pl' },
  { value: 'com', label: '.com' },
  { value: 'eu', label: '.eu' },
  { value: 'net', label: '.net' },
  { value: 'org', label: '.org' },
] as const;

const YEAR_OPTIONS = [1, 2, 3, 5, 10] as const;

const DEFAULT_NS = ['ns1.verris.pl', 'ns2.verris.pl'];

type Step = 'search' | 'period' | 'config' | 'summary';

type QuoteRow = {
  years: number;
  priceAmount: string | null;
  loading: boolean;
};

function formatPln(amount: string | null | undefined) {
  if (!amount) return '—';
  const n = Number.parseFloat(amount);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(n);
}

function buildFqdn(label: string, tld: string) {
  const clean = label.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
  return clean ? `${clean}.${tld}` : '';
}

export function DomainPurchaseWizard({ initialOrders }: { initialOrders: RegistrarOrderRow[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('search');
  const [label, setLabel] = useState('');
  const [tld, setTld] = useState<(typeof TLD_OPTIONS)[number]['value']>('pl');
  const [years, setYears] = useState(1);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [premium, setPremium] = useState(false);
  const [ns1, setNs1] = useState(DEFAULT_NS[0]);
  const [ns2, setNs2] = useState(DEFAULT_NS[1]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fqdn = useMemo(() => buildFqdn(label, tld), [label, tld]);
  const selectedQuote = quotes.find((q) => q.years === years);
  const stepIndex = step === 'search' ? 0 : step === 'period' ? 1 : step === 'config' ? 2 : 3;

  const loadQuotes = useCallback(async (domain: string) => {
    setQuotes(YEAR_OPTIONS.map((y) => ({ years: y, priceAmount: null, loading: true })));
    const results = await Promise.all(
      YEAR_OPTIONS.map(async (y) => {
        try {
          const q = await quoteDomainAction(domain, y);
          return { years: y, priceAmount: q.priceAmount, loading: false };
        } catch {
          return { years: y, priceAmount: null, loading: false };
        }
      }),
    );
    setQuotes(results);
    return results;
  }, []);

  const onCheckAvailability = () => {
    if (!fqdn || !fqdn.includes('.')) {
      toast.error('Podaj poprawną nazwę domeny');
      return;
    }
    startTransition(async () => {
      try {
        const q = await quoteDomainAction(fqdn, 1);
        setAvailable(q.available);
        setPremium(Boolean(q.premium));
        if (!q.available) {
          toast.error(`Domena ${fqdn} jest zajęta`);
          return;
        }
        await loadQuotes(fqdn);
        setYears(1);
        setStep('period');
        toast.success(`${fqdn} jest dostępna`);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Nie udało się sprawdzić domeny');
      }
    });
  };

  const onRegister = () => {
    if (!fqdn || !selectedQuote?.priceAmount) return;
    startTransition(async () => {
      try {
        await registerDomainClientAction({
          name: fqdn,
          years,
          nameservers: [ns1, ns2].map((n) => n.trim().toLowerCase()).filter(Boolean),
        });
        toast.success(`Zamówiono rejestrację ${fqdn}`);
        router.push('/dashboard/domains');
        router.refresh();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Rejestracja nie powiodła się');
      }
    });
  };

  const steps = [
    { id: 'search', label: 'Nazwa' },
    { id: 'period', label: 'Okres' },
    { id: 'config', label: 'Konfiguracja' },
    { id: 'summary', label: 'Podsumowanie' },
  ] as const;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeaderRow
        title="Kup domenę"
        description="Sprawdź dostępność, wybierz okres rejestracji i skonfiguruj nameserwery — opłata z portfela Verris."
        actions={
          <Button variant="outline" className="gap-2" onClick={() => router.push('/dashboard/domains')}>
            <ArrowLeft className="h-4 w-4" /> Moje domeny
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
              i <= stepIndex
                ? 'border-verris-mint/40 bg-verris-mint/10 text-verris-paper'
                : 'border-white/10 text-neutral-500'
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-[10px]">
              {i < stepIndex ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {s.label}
          </div>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-[32px] p-px">
        <SpinBorder variant="white" className="opacity-20" />
        <div className="relative rounded-[calc(32px-1px)] border border-white/5 bg-[#0a0a0a] p-6 lg:p-8">
          {step === 'search' && (
            <div className="mx-auto max-w-2xl space-y-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <Search className="h-5 w-5 text-verris-mint" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Wybierz nazwę domeny</h2>
                  <p className="text-sm text-neutral-400">Wpisz nazwę i wybierz końcówkę (TLD).</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <div className="flex min-w-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black focus-within:border-verris-mint/50">
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="twojanazwa"
                    className="border-0 bg-transparent focus-visible:ring-0"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && onCheckAvailability()}
                  />
                  <select
                    value={tld}
                    onChange={(e) => setTld(e.target.value as (typeof TLD_OPTIONS)[number]['value'])}
                    className="border-l border-white/10 bg-[#111] px-3 text-sm text-white outline-none"
                  >
                    {TLD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  className="shrink-0 gap-2 sm:min-w-[160px]"
                  disabled={isPending || !label.trim()}
                  onClick={onCheckAvailability}
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Sprawdź
                </Button>
              </div>

              {fqdn ? (
                <p className="text-center text-sm text-neutral-400">
                  Szukasz: <span className="font-mono text-white">{fqdn}</span>
                </p>
              ) : null}

              {available === false ? (
                <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  Domena jest zajęta — spróbuj innej nazwy lub końcówki.
                </p>
              ) : null}
            </div>
          )}

          {step === 'period' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
                <div>
                  <p className="text-sm text-neutral-400">Wybrana domena</p>
                  <p className="font-mono text-xl font-semibold text-white">{fqdn}</p>
                  {premium ? (
                    <span className="mt-1 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                      Domena premium
                    </span>
                  ) : null}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep('search')}>
                  Zmień nazwę
                </Button>
              </div>

              <h3 className="text-sm font-medium text-neutral-300">Okres rejestracji</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {quotes.map((q) => (
                  <button
                    key={q.years}
                    type="button"
                    onClick={() => setYears(q.years)}
                    className={`rounded-2xl border p-4 text-left transition-colors ${
                      years === q.years
                        ? 'border-verris-mint/50 bg-verris-mint/10'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <p className="text-sm text-neutral-400">
                      {q.years} {q.years === 1 ? 'rok' : q.years < 5 ? 'lata' : 'lat'}
                    </p>
                    <p className="mt-2 text-2xl font-bold text-white">
                      {q.loading ? <Loader2 className="h-6 w-6 animate-spin" /> : formatPln(q.priceAmount)}
                    </p>
                  </button>
                ))}
              </div>

              <div className="flex justify-between gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep('search')}>
                  Wstecz
                </Button>
                <Button
                  className="gap-2"
                  disabled={!selectedQuote?.priceAmount}
                  onClick={() => setStep('config')}
                >
                  Dalej <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 'config' && (
            <div className="mx-auto max-w-xl space-y-6">
              <div className="flex items-center gap-3">
                <Server className="h-5 w-5 text-verris-mint" />
                <h2 className="text-lg font-semibold text-white">Nameserwery DNS</h2>
              </div>
              <p className="text-sm text-neutral-400">
                Domyślnie ustawiamy serwery Verris. Możesz je zmienić przed rejestracją.
              </p>
              <div className="space-y-3">
                <label className="block text-xs text-neutral-500">Nameserver 1</label>
                <Input value={ns1} onChange={(e) => setNs1(e.target.value)} className="font-mono" />
                <label className="block text-xs text-neutral-500">Nameserver 2</label>
                <Input value={ns2} onChange={(e) => setNs2(e.target.value)} className="font-mono" />
              </div>
              <div className="flex justify-between gap-3">
                <Button variant="outline" onClick={() => setStep('period')}>
                  Wstecz
                </Button>
                <Button className="gap-2" onClick={() => setStep('summary')}>
                  Dalej <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 'summary' && (
            <div className="mx-auto max-w-lg space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-400">Domena</span>
                  <span className="font-mono font-medium text-white">{fqdn}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-400">Okres</span>
                  <span className="text-white">{years} {years === 1 ? 'rok' : 'lat'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-400">NS</span>
                  <span className="text-right font-mono text-xs text-white">
                    {ns1}
                    <br />
                    {ns2}
                  </span>
                </div>
                <div className="border-t border-white/10 pt-3 flex justify-between gap-4 text-base">
                  <span className="font-medium text-white">Do zapłaty (portfel)</span>
                  <span className="font-bold text-verris-mint">{formatPln(selectedQuote?.priceAmount)}</span>
                </div>
              </div>
              <p className="text-xs text-neutral-500">
                Kwota zostanie pobrana z portfela Verris. Przy braku środków doładuj portfel w panelu.
              </p>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button variant="outline" onClick={() => setStep('config')}>
                  Wstecz
                </Button>
                <Button className="gap-2" disabled={isPending} onClick={onRegister}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                  Zamów rejestrację
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="rounded-[28px] border border-white/10 bg-[#0a0a0a] p-6">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setTransferOpen((v) => !v)}
        >
          <div className="flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-neutral-400" />
            <div>
              <h2 className="font-semibold text-white">Transfer domeny</h2>
              <p className="text-sm text-neutral-500">Przenieś domenę od innego rejestratora</p>
            </div>
          </div>
          <span className="text-xs text-neutral-500">{transferOpen ? 'Zwiń' : 'Rozwiń'}</span>
        </button>
        {transferOpen ? (
          <form action={transferDomainAction} className="mt-6 grid gap-4 lg:grid-cols-2">
            <Input name="name" required placeholder="twojadomena.pl" />
            <Input name="authCode" required placeholder="Kod AuthInfo / EPP" />
            <Input name="years" type="number" min={1} max={10} defaultValue={1} />
            <Input name="nameservers" placeholder="ns1.verris.pl, ns2.verris.pl" defaultValue={DEFAULT_NS.join(', ')} />
            <div className="lg:col-span-2">
              <Button type="submit" variant="outline">
                Zleć transfer
              </Button>
            </div>
          </form>
        ) : null}
      </section>

      {initialOrders.length > 0 ? (
        <section className="rounded-[28px] border border-white/10 bg-[#0a0a0a] p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Historia zleceń</h2>
          <div className="space-y-3">
            {initialOrders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{order.domainName}</p>
                    <p className="text-xs text-neutral-500">
                      {order.type} · {order.status}
                      {order.priceAmount ? ` · ${formatPln(order.priceAmount)}` : ''}
                    </p>
                  </div>
                  <Globe2 className="h-4 w-4 text-neutral-600" />
                </div>
                {order.lastError ? <p className="mt-2 text-sm text-rose-300">{order.lastError}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
