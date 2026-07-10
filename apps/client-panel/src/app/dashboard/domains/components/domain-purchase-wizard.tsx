'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
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
  Sparkles,
  X,
} from 'lucide-react';
import { Button, Input } from '@verris/ui';
import type { DomainCustomerPriceDto, DomainSearchResultDto } from '@verris/contracts';
import { PageHeaderRow } from '@/components/panel';
import { SpinBorder } from '@/components/spin-border';
import { toast } from 'sonner';
import {
  getWaiverConsentAction,
  quotePeriodsAction,
  registerDomainClientAction,
  searchDomainsAction,
  transferDomainAction,
  type RegistrarOrderRow,
} from '../actions';
import { trackBeginCheckout, trackPurchase, trackSearch } from '@/lib/analytics-events';

const YEAR_OPTIONS = [1, 2, 3, 5, 10] as const;

const DEFAULT_NS = ['ns1.verris.pl', 'ns2.verris.pl'];

type Step = 'search' | 'period' | 'config' | 'summary';

type QuoteRow = {
  years: number;
  priceAmount: string | null;
  netAmount: string | null;
  vatAmount: string | null;
  vatRate: number;
  loading: boolean;
};

function formatPln(amount: string | null | undefined) {
  if (!amount) return '—';
  const n = Number.parseFloat(amount);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(n);
}

function sanitizeLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
}

function TldResultCard({
  result,
  label,
  selected,
  onSelect,
  disabled,
}: {
  result: DomainSearchResultDto;
  label: string;
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const fqdn = `${label}${result.label}`;

  return (
    <button
      type="button"
      disabled={!result.available || disabled}
      onClick={onSelect}
      className={`group relative flex flex-col rounded-2xl border p-4 text-left transition-all ${
        !result.available
          ? 'cursor-not-allowed border-white/5 bg-white/[0.01] opacity-50'
          : selected
            ? 'border-verris-mint/60 bg-verris-mint/10 ring-1 ring-verris-mint/30'
            : 'border-white/10 bg-white/[0.02] hover:border-verris-mint/40 hover:bg-verris-mint/5'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm text-white">
            <span className="text-neutral-400">{label}</span>
            <span className="font-semibold">{result.label}</span>
          </p>
          <p className="mt-0.5 truncate text-[11px] text-neutral-500">{fqdn}</p>
        </div>
        {result.available ? (
          <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            Wolna
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-neutral-500">
            Zajęta
          </span>
        )}
      </div>

      {result.available ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-stretch gap-2">
            <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">Rejestracja (1. rok)</p>
              <p className="text-lg font-bold text-white">
                {formatPln(result.register.grossAmount ?? result.priceAmount)}
              </p>
              <p className="text-[10px] text-neutral-500">brutto · VAT {result.register.vatRate}%</p>
            </div>
            <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">Odnowienie / rok</p>
              <p className="text-lg font-bold text-emerald-300">
                {result.renewal?.grossAmount ? formatPln(result.renewal.grossAmount) : '—'}
              </p>
              <p className="text-[10px] text-neutral-500">
                {result.renewal?.grossAmount ? `brutto · VAT ${result.renewal.vatRate}%` : 'wg cennika'}
              </p>
            </div>
            {result.premium ? (
              <span className="inline-flex h-fit shrink-0 items-center gap-1 self-start rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                <Sparkles className="h-3 w-3" /> Premium
              </span>
            ) : null}
          </div>
          <p className="text-[10px] text-emerald-300/80">
            Cenę odnowienia pokazujemy od razu — bez niespodzianek przy przedłużeniu.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-neutral-600">Spróbuj innej końcówki</p>
      )}
    </button>
  );
}

export function DomainPurchaseWizard({ initialOrders }: { initialOrders: RegistrarOrderRow[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('search');
  const [label, setLabel] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<DomainSearchResultDto[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [years, setYears] = useState(1);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [renewalPerYear, setRenewalPerYear] = useState<DomainCustomerPriceDto | null>(null);
  const [premium, setPremium] = useState(false);
  const [ns1, setNs1] = useState(DEFAULT_NS[0]);
  const [ns2, setNs2] = useState(DEFAULT_NS[1]);
  // Oświadczenie: natychmiastowa rejestracja + utrata prawa odstąpienia (art. 38 pkt 1 upk).
  const [waiverConsent, setWaiverConsent] = useState(false);
  // Zbiorcza akceptacja dokumentów przy zamówieniu (jak u liderów rynku).
  const [acceptDocs, setAcceptDocs] = useState(false);
  // Zgoda raz na koncie (Regulamin §12 ust. 8): oświadczenie z pierwszego zakupu
  // obejmuje kolejne rejestracje — wtedy zamiast checkboxa pokazujemy przypomnienie.
  const [standingConsent, setStandingConsent] = useState<{ granted: boolean; grantedAt: string | null } | null>(null);
  useEffect(() => {
    void getWaiverConsentAction().then((r) => {
      setStandingConsent(r);
      if (r.granted) setWaiverConsent(true);
    });
  }, []);
  const [transferOpen, setTransferOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const cleanLabel = useMemo(() => sanitizeLabel(label), [label]);
  const fqdn = selectedDomain ?? (cleanLabel ? `${cleanLabel}.pl` : '');
  const selectedQuote = quotes.find((q) => q.years === years);
  const stepIndex = step === 'search' ? 0 : step === 'period' ? 1 : step === 'config' ? 2 : 3;

  const popularResults = useMemo(
    () => searchResults.filter((r) => r.popular),
    [searchResults],
  );
  const otherResults = useMemo(
    () => searchResults.filter((r) => !r.popular),
    [searchResults],
  );
  const availableCount = useMemo(
    () => searchResults.filter((r) => r.available).length,
    [searchResults],
  );

  const loadQuotes = useCallback(async (domain: string) => {
    setQuotes(
      YEAR_OPTIONS.map((y) => ({
        years: y,
        priceAmount: null,
        netAmount: null,
        vatAmount: null,
        vatRate: 23,
        loading: true,
      })),
    );
    try {
      const { quotes: rows, renewalPerYear: renew } = await quotePeriodsAction(domain, [...YEAR_OPTIONS]);
      setRenewalPerYear(renew);
      setQuotes(
        rows.map((q) => ({
          years: q.years,
          priceAmount: q.priceAmount,
          netAmount: q.netAmount,
          vatAmount: q.vatAmount,
          vatRate: q.vatRate,
          loading: false,
        })),
      );
      return rows;
    } catch {
      setRenewalPerYear(null);
      setQuotes(
        YEAR_OPTIONS.map((y) => ({
          years: y,
          priceAmount: null,
          netAmount: null,
          vatAmount: null,
          vatRate: 23,
          loading: false,
        })),
      );
      return [];
    }
  }, []);

  const onSearch = () => {
    if (!cleanLabel) {
      toast.error('Podaj poprawną nazwę domeny');
      return;
    }
    startTransition(async () => {
      try {
        setSelectedDomain(null);
        setHasSearched(true);
        trackSearch(cleanLabel); // GA4: search — intencja zakupowa (fraza domeny)
        const results = await searchDomainsAction(cleanLabel);
        setSearchResults(results);
        if (results.every((r) => !r.available)) {
          toast.error('Ta nazwa jest zajęta we wszystkich sprawdzonych końcówkach');
        } else {
          toast.success(
            `Znaleziono ${results.filter((r) => r.available).length} dostępnych wariantów`,
          );
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Nie udało się sprawdzić domeny');
      }
    });
  };

  const onSelectDomain = (result: DomainSearchResultDto) => {
    if (!result.available) return;
    startTransition(async () => {
      try {
        setSelectedDomain(result.domain);
        setPremium(Boolean(result.premium));
        setYears(1);
        const rows = await loadQuotes(result.domain);
        if (!rows.some((q) => q.priceAmount)) {
          toast.error('Nie udało się pobrać cen dla wybranej domeny');
          return;
        }
        // GA4: begin_checkout — wybór dostępnej domeny i wejście w konfigurację.
        {
          const firstPrice = Number(rows.find((q) => q.priceAmount)?.priceAmount);
          trackBeginCheckout(
            [{ item_name: result.domain, item_category: 'domena', quantity: 1 }],
            Number.isFinite(firstPrice) ? firstPrice : undefined,
          );
        }
        setStep('period');
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Nie udało się pobrać cen');
      }
    });
  };

  const onRegister = () => {
    if (!selectedDomain || !selectedQuote?.priceAmount) return;
    if (!waiverConsent) {
      toast.error('Zaznacz oświadczenie o natychmiastowej rejestracji i utracie prawa odstąpienia.');
      return;
    }
    startTransition(async () => {
      try {
        await registerDomainClientAction({
          name: selectedDomain,
          years,
          nameservers: [ns1, ns2].map((n) => n.trim().toLowerCase()).filter(Boolean),
          withdrawalWaiverConsent: waiverConsent,
        });
        // GA4: purchase — domena płacona z Portfela, kwota z wyceny.
        // transaction_id MUSI być stabilny: `Date.now()` dawał nowy identyfikator przy
        // każdym ponowieniu, więc GA4 nie deduplikowało zakupu, a `event_id` dla Meta
        // (purchase-<transactionId>) rozjeżdżał się z tym, co wyśle CAPI.
        // Domena rejestrowana jest raz, więc jej nazwa jest naturalnym kluczem.
        {
          const paid = Number(selectedQuote.priceAmount);
          if (Number.isFinite(paid)) {
            trackPurchase({
              transactionId: `domain-${selectedDomain}`,
              value: paid,
              items: [
                { item_name: selectedDomain, item_category: 'domena', price: paid, quantity: 1 },
              ],
            });
          }
        }
        toast.success(`Zamówiono rejestrację ${selectedDomain}`);
        router.push('/dashboard/domains');
        router.refresh();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Rejestracja nie powiodła się');
      }
    });
  };

  const resetSearch = () => {
    setStep('search');
    setSelectedDomain(null);
    setSearchResults([]);
    setHasSearched(false);
    setQuotes([]);
    setRenewalPerYear(null);
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
            <div className="mx-auto max-w-3xl space-y-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <Search className="h-5 w-5 text-verris-mint" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Wybierz nazwę domeny</h2>
                  <p className="text-sm text-neutral-400">
                    Wpisz samą nazwę — sprawdzimy dostępność we wszystkich popularnych końcówkach naraz.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <div className="relative min-w-0 flex-1">
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="twojanazwa"
                    className="h-12 rounded-xl border-white/10 bg-black pr-24 font-mono text-base focus-visible:border-verris-mint/50"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && onSearch()}
                  />
                  {label ? (
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-500">
                      .pl, .com…
                    </span>
                  ) : null}
                </div>
                <Button
                  className="h-12 shrink-0 gap-2 sm:min-w-[160px]"
                  disabled={isPending || !cleanLabel}
                  onClick={onSearch}
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Szukaj
                </Button>
              </div>

              {hasSearched && !isPending ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <p className="text-sm text-neutral-300">
                      Wyniki dla{' '}
                      <span className="font-mono font-medium text-white">{cleanLabel}</span>
                    </p>
                    <p className="text-xs text-neutral-500">
                      {availableCount > 0
                        ? `${availableCount} dostępnych z ${searchResults.length} · ceny brutto (VAT 23%)`
                        : 'Brak wolnych wariantów'}
                    </p>
                  </div>

                  {popularResults.length > 0 ? (
                    <div className="space-y-3">
                      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                        <Sparkles className="h-3.5 w-3.5 text-verris-mint" />
                        Popularne
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {popularResults.map((result) => (
                          <TldResultCard
                            key={result.extension}
                            result={result}
                            label={cleanLabel}
                            selected={selectedDomain === result.domain}
                            onSelect={() => onSelectDomain(result)}
                            disabled={isPending}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {otherResults.length > 0 ? (
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                        Pozostałe końcówki
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {otherResults.map((result) => (
                          <TldResultCard
                            key={result.extension}
                            result={result}
                            label={cleanLabel}
                            selected={selectedDomain === result.domain}
                            onSelect={() => onSelectDomain(result)}
                            disabled={isPending}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {availableCount === 0 ? (
                    <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                      Wszystkie sprawdzone warianty są zajęte — spróbuj innej nazwy.
                    </p>
                  ) : (
                    <p className="text-center text-xs text-neutral-500">
                      Kliknij dostępną domenę, aby wybrać okres rejestracji.
                    </p>
                  )}
                </div>
              ) : isPending ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-neutral-400">
                  <Loader2 className="h-8 w-8 animate-spin text-verris-mint" />
                  <p className="text-sm">Sprawdzamy dostępność we wszystkich końcówkach…</p>
                </div>
              ) : null}
            </div>
          )}

          {step === 'period' && selectedDomain ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
                <div>
                  <p className="text-sm text-neutral-400">Wybrana domena</p>
                  <p className="font-mono text-xl font-semibold text-white">{selectedDomain}</p>
                  {premium ? (
                    <span className="mt-1 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                      Domena premium
                    </span>
                  ) : null}
                </div>
                <Button variant="ghost" size="sm" className="gap-1" onClick={resetSearch}>
                  <X className="h-3.5 w-3.5" /> Zmień nazwę
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
                    {!q.loading && q.priceAmount ? (
                      <p className="mt-1 text-[10px] text-neutral-500">brutto · VAT {q.vatRate}%</p>
                    ) : null}
                  </button>
                ))}
              </div>

              {renewalPerYear?.grossAmount ? (
                <p className="text-sm text-neutral-400">
                  Odnowienie:{' '}
                  <span className="font-medium text-neutral-200">
                    {formatPln(renewalPerYear.grossAmount)} / rok brutto
                  </span>
                </p>
              ) : null}

              <div className="flex justify-between gap-3 pt-2">
                <Button variant="outline" onClick={resetSearch}>
                  Wstecz
                </Button>
                <Button
                  className="gap-2"
                  disabled={!selectedQuote?.priceAmount || isPending}
                  onClick={() => setStep('config')}
                >
                  Dalej <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}

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
                  <span className="text-white">
                    {years} {years === 1 ? 'rok' : 'lat'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-400">NS</span>
                  <span className="text-right font-mono text-xs text-white">
                    {ns1}
                    <br />
                    {ns2}
                  </span>
                </div>
                {selectedQuote?.netAmount && selectedQuote.vatAmount ? (
                  <>
                    <div className="flex justify-between gap-4 text-xs">
                      <span className="text-neutral-500">Netto</span>
                      <span className="text-neutral-300">{formatPln(selectedQuote.netAmount)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-xs">
                      <span className="text-neutral-500">VAT ({selectedQuote.vatRate}%)</span>
                      <span className="text-neutral-300">{formatPln(selectedQuote.vatAmount)}</span>
                    </div>
                  </>
                ) : null}
                <div className="border-t border-white/10 pt-3 flex justify-between gap-4 text-base">
                  <span className="font-medium text-white">Do zapłaty (portfel, brutto)</span>
                  <span className="font-bold text-verris-mint">{formatPln(selectedQuote?.priceAmount)}</span>
                </div>
              </div>
              {renewalPerYear?.grossAmount ? (
                <p className="text-xs text-neutral-500">
                  Kolejne odnowienia: {formatPln(renewalPerYear.grossAmount)}/rok brutto (VAT{' '}
                  {renewalPerYear.vatRate}%).
                </p>
              ) : null}
              <p className="text-xs text-neutral-500">
                Kwota brutto zostanie pobrana z portfela Verris. Przy braku środków doładuj portfel w panelu.
              </p>
              {/* Zbiorcza akceptacja dokumentów przy zamówieniu. */}
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <input
                  type="checkbox"
                  checked={acceptDocs}
                  onChange={(e) => setAcceptDocs(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/5 accent-white"
                />
                <span className="text-xs leading-relaxed text-neutral-300">
                  Zamawiając, akceptuję:{' '}
                  <a href="/legal/terms" target="_blank" className="underline hover:text-white">
                    Regulamin świadczenia usług Verris
                  </a>{' '}
                  (w tym warunki rejestracji domen — §12),{' '}
                  <a href="/legal/privacy" target="_blank" className="underline hover:text-white">
                    Politykę prywatności
                  </a>{' '}
                  oraz{' '}
                  <a href="/legal/dpa" target="_blank" className="underline hover:text-white">
                    DPA
                  </a>
                  .
                </span>
              </label>
              {/* Oświadczenie konsumenckie — art. 38 ust. 1 pkt 1 upk (Regulamin §12 ust. 7–8).
                  Zgoda raz na koncie: przy kolejnych zakupach przypomnienie zamiast checkboxa. */}
              {standingConsent?.granted ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs leading-relaxed text-neutral-400">
                  Obejmuje to zamówienie: Twoje oświadczenie o żądaniu natychmiastowej
                  rejestracji domen i utracie prawa odstąpienia z chwilą rejestracji, złożone
                  przy pierwszym zakupie domeny
                  {standingConsent.grantedAt
                    ? ` (${new Date(standingConsent.grantedAt).toLocaleDateString('pl-PL')})`
                    : ''}{' '}
                  — {' '}
                  <a href="/legal/terms" target="_blank" className="underline hover:text-white">
                    Regulamin §12 ust. 8
                  </a>
                  .
                </p>
              ) : (
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <input
                    type="checkbox"
                    checked={waiverConsent}
                    onChange={(e) => setWaiverConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/5 accent-white"
                  />
                  <span className="text-xs leading-relaxed text-neutral-300">
                    Żądam natychmiastowego wykonania usługi rejestracji domeny{' '}
                    <strong className="text-white">{selectedDomain}</strong> i przyjmuję do
                    wiadomości, że z chwilą jej zarejestrowania (pełnego wykonania usługi){' '}
                    <strong className="text-white">tracę prawo odstąpienia</strong> od umowy w tym
                    zakresie (art. 38 ust. 1 pkt 1 ustawy o prawach konsumenta,{' '}
                    <a href="/legal/terms" target="_blank" className="underline hover:text-white">
                      Regulamin §12
                    </a>
                    ). Oświadczenie obejmuje również kolejne rejestracje domen na tym koncie
                    (możesz je odwołać, pisząc na kontakt@verris.pl).
                  </span>
                </label>
              )}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button variant="outline" onClick={() => setStep('config')}>
                  Wstecz
                </Button>
                <Button
                  className="gap-2"
                  disabled={isPending || !waiverConsent || !acceptDocs}
                  onClick={onRegister}
                >
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
            <Input
              name="nameservers"
              placeholder="ns1.verris.pl, ns2.verris.pl"
              defaultValue={DEFAULT_NS.join(', ')}
            />
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
