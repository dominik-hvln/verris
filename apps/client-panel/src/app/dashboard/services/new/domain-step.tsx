'use client';

import { useState, useTransition } from 'react';
import { Check, Globe, Loader2, Search, Sparkles } from 'lucide-react';
import type { DomainSearchResultDto } from '@verris/contracts';
import { searchDomainsAction } from '@/app/dashboard/domains/actions';
import { formatCredits } from '@/lib/credits';

export type DomainMode = 'own' | 'register';

export interface DomainSelection {
  mode: DomainMode;
  /** Domain that will be used for the hosting account. */
  domain: string;
  /** When mode === 'register': the selected FQDN to register + years. */
  register: { name: string; years: number } | null;
}

/**
 * O-3 — domain step in checkout. Either use an existing/own domain (free-text)
 * or search + pick a brand-new domain that we register during checkout. The
 * actual registration (wallet charge) happens on submit in the parent form so
 * the domain and hosting are ordered together.
 */
export function DomainStep({
  value,
  onChange,
}: {
  value: DomainSelection;
  onChange: (next: DomainSelection) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DomainSearchResultDto[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setMode = (mode: DomainMode) =>
    onChange({ mode, domain: mode === 'own' ? value.domain : '', register: null });

  const runSearch = () => {
    const label = query.trim().toLowerCase().replace(/\s+/g, '');
    if (label.length < 2) {
      setSearchError('Wpisz nazwę (min. 2 znaki).');
      return;
    }
    setSearchError(null);
    startTransition(async () => {
      try {
        const rows = await searchDomainsAction(label.replace(/\..*$/, ''));
        setResults(rows);
      } catch {
        setSearchError('Nie udało się wyszukać domen. Spróbuj ponownie.');
      }
    });
  };

  const pick = (row: DomainSearchResultDto) => {
    onChange({ mode: 'register', domain: row.domain, register: { name: row.domain, years: 1 } });
  };

  return (
    <section>
      <h2 className="text-xl font-bold text-white">3. Domena główna</h2>
      <p className="text-neutral-400 text-sm mt-1">
        Podłącz własną domenę albo zarejestruj nową w trakcie zamówienia — opłata za domenę
        zostanie pobrana z portfela.
      </p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
        <ModeCard
          active={value.mode === 'own'}
          onClick={() => setMode('own')}
          icon={<Globe className="h-5 w-5" />}
          title="Mam własną domenę"
          description="Wpiszę domenę, którą już posiadam (lub roboczą)."
        />
        <ModeCard
          active={value.mode === 'register'}
          onClick={() => setMode('register')}
          icon={<Sparkles className="h-5 w-5" />}
          title="Zarejestruj nową domenę"
          description="Wyszukaj i zarejestruj nową domenę razem z hostingiem."
        />
      </div>

      {value.mode === 'own' ? (
        <input
          type="text"
          value={value.domain}
          onChange={(e) => onChange({ mode: 'own', domain: e.target.value, register: null })}
          placeholder="mojadomena.pl"
          className="mt-4 w-full max-w-md rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-white/40 focus:outline-none"
        />
      ) : (
        <div className="mt-4 max-w-2xl">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder="nazwa-firmy"
              className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-white/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={runSearch}
              disabled={pending}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Szukaj
            </button>
          </div>
          {searchError ? <p className="mt-2 text-sm text-rose-300">{searchError}</p> : null}

          {results ? (
            <div className="mt-4 space-y-2">
              {results.length === 0 ? (
                <p className="text-sm text-neutral-400">Brak wyników — spróbuj innej nazwy.</p>
              ) : (
                results.map((row) => {
                  const selected = value.register?.name === row.domain;
                  const price = row.register.grossAmount;
                  return (
                    <div
                      key={row.domain}
                      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
                        selected
                          ? 'border-emerald-400/50 bg-emerald-400/10'
                          : row.available
                            ? 'border-white/10 bg-white/[0.03]'
                            : 'border-white/5 bg-white/[0.01] opacity-60'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-white truncate">{row.domain}</p>
                        <p className="text-xs text-neutral-400">
                          {row.available
                            ? price
                              ? `${formatCredits(price)} / rok`
                              : 'dostępna'
                            : 'niedostępna'}
                          {row.premium ? ' · premium' : ''}
                        </p>
                      </div>
                      {row.available ? (
                        <button
                          type="button"
                          onClick={() => pick(row)}
                          className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold ${
                            selected
                              ? 'bg-emerald-500 text-black'
                              : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
                          }`}
                        >
                          {selected ? <Check className="h-4 w-4" /> : null}
                          {selected ? 'Wybrana' : 'Wybierz'}
                        </button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          ) : null}

          {value.register ? (
            <p className="mt-3 text-sm text-emerald-200">
              Zarejestrujemy <strong className="font-mono">{value.register.name}</strong> na 1 rok i
              uruchomimy na niej hosting.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-5 text-left transition-all ${
        active
          ? 'border-white bg-white/10 text-white'
          : 'border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/30'
      }`}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span className="font-bold">{title}</span>
      </div>
      <p className="mt-2 text-sm text-neutral-400">{description}</p>
    </button>
  );
}
