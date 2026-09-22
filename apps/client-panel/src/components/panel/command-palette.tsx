'use client';

/**
 * PB-15 — wyszukiwarka „/" (także Ctrl/Cmd+K): strony panelu, usługi, szybkie akcje.
 * Brak trafień → szukaj w bazie wiedzy.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

export type PaletteItem = { label: string; hint: string; href?: string; run?: () => void };

/** Normalizacja do wyszukiwania bez polskich znaków. Czysta funkcja — testowana. */
export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
}

export function filterItems(items: PaletteItem[], q: string): PaletteItem[] {
  const n = normalize(q.trim());
  if (!n) return items;
  return items.filter((i) => normalize(`${i.label} ${i.hint}`).includes(n));
}

export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (document.activeElement as HTMLElement | null)?.isContentEditable;
      if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setQ('');
        setSel(0);
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 10);
  }, [open]);

  const rows = useMemo(() => {
    const f = filterItems(items, q);
    if (f.length > 0 || !q.trim()) return f.slice(0, 12);
    return [{ label: `Szukaj w bazie wiedzy: „${q.trim()}”`, hint: 'pomoc', href: `/dashboard/knowledge?q=${encodeURIComponent(q.trim())}` }];
  }, [items, q]);

  const run = (it: PaletteItem | undefined) => {
    if (!it) return;
    setOpen(false);
    if (it.run) it.run();
    else if (it.href) router.push(it.href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQ('');
          setSel(0);
          setOpen(true);
        }}
        className="flex min-w-0 items-center gap-2.5 rounded-md border border-line bg-card px-2.5 py-[7px] text-left text-[13.5px] text-muted-foreground hover:border-line-strong sm:w-[min(320px,34vw)]"
        aria-label="Szukaj lub zrób coś"
      >
        <Search className="h-[15px] w-[15px] shrink-0" />
        <span className="hidden flex-1 truncate sm:inline">Szukaj lub zrób coś…</span>
        <kbd className="hidden rounded border border-b-2 border-line-strong bg-raised px-1.5 font-mono text-[11px] text-foreground sm:inline">/</kbd>
      </button>
      {/* Portal: pasek górny ma backdrop-blur, który zamyka `fixed` w swoim obrysie.
          Cel = kolumna treści (dziedziczy motyw), awaryjnie body. */}
      {open ? createPortal(
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[14vh] backdrop-blur-[2px]"
          style={{ background: 'rgba(4, 10, 7, 0.55)' }}
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div role="dialog" aria-label="Szukaj lub zrób coś" className="w-full max-w-[560px] overflow-hidden rounded-xl border border-line-strong bg-card shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
            <input
              ref={input}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setSel(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSel((s) => Math.min(s + 1, rows.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSel((s) => Math.max(s - 1, 0));
                } else if (e.key === 'Enter') run(rows[sel]);
                else if (e.key === 'Escape') setOpen(false);
              }}
              placeholder="Wpisz, co chcesz zrobić…"
              className="w-full border-0 border-b border-line bg-transparent px-4 py-[15px] text-base font-medium text-foreground outline-none"
            />
            <ul role="listbox" className="m-0 max-h-[340px] list-none overflow-auto p-1.5">
              {rows.map((it, i) => (
                <li
                  key={`${it.label}-${i}`}
                  role="option"
                  aria-selected={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => run(it)}
                  className={`flex cursor-pointer items-center justify-between gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground ${i === sel ? 'bg-raised' : ''}`}
                >
                  <span className="truncate">{it.label}</span>
                  <small className="shrink-0 font-mono text-xs text-muted-foreground">{it.hint}</small>
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.querySelector('.v2-content') ?? document.body,
      ) : null}
    </>
  );
}
