'use client';

import { useMemo, useState, useTransition } from 'react';
import { LayoutGrid, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_SIDEBAR_QUICK_LINKS,
  SIDEBAR_TILE_OPTIONS,
  resolveSidebarQuickLinks,
  type SidebarTileHref,
} from '@verris/contracts';
import { updateSidebarQuickLinks } from './actions';

export function SidebarTilesSection({ initialLinks }: { initialLinks: string[] }) {
  const resolved = useMemo(() => resolveSidebarQuickLinks(initialLinks), [initialLinks]);
  const [selected, setSelected] = useState<SidebarTileHref[]>([...resolved]);
  const [pending, startTransition] = useTransition();

  const toggle = (href: SidebarTileHref) => {
    setSelected((prev) => {
      if (prev.includes(href)) {
        return prev.filter((h) => h !== href);
      }
      if (prev.length >= 4) {
        toast.message('Masz już 4 skróty — odznacz jeden, aby dodać inny.');
        return prev;
      }
      return [...prev, href];
    });
  };

  const save = () => {
    if (selected.length !== 4) {
      toast.error('Wybierz dokładnie 4 skróty.');
      return;
    }
    startTransition(async () => {
      const result = await updateSidebarQuickLinks(selected);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Skróty w sidebarze zapisane.');
      window.location.reload();
    });
  };

  const resetDefaults = () => {
    setSelected([...DEFAULT_SIDEBAR_QUICK_LINKS]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10">
          <LayoutGrid className="h-5 w-5 text-emerald-400" aria-hidden />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Skróty w sidebarze</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Wybierz 4 sekcje wyświetlane jako duże kafelki u góry menu. Pozostałe linki zostają na liście
            poniżej.
          </p>
        </div>
      </div>

      <p className="text-sm text-neutral-500">
        Wybrane: <span className="font-mono text-emerald-300">{selected.length}</span> / 4
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {SIDEBAR_TILE_OPTIONS.map((opt) => {
          const isOn = selected.includes(opt.href);
          const disabled = !isOn && selected.length >= 4;
          return (
            <button
              key={opt.href}
              type="button"
              disabled={pending || disabled}
              onClick={() => toggle(opt.href)}
              className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                isOn
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                  : disabled
                    ? 'border-white/5 bg-black/20 text-neutral-600 cursor-not-allowed'
                    : 'border-white/10 bg-black/30 text-neutral-300 hover:border-white/20 hover:bg-white/5'
              }`}
            >
              <span className="font-medium">{opt.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending || selected.length !== 4}
          onClick={save}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          <Save className="h-4 w-4" aria-hidden />
          {pending ? 'Zapisywanie…' : 'Zapisz skróty'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={resetDefaults}
          className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-medium text-neutral-300 hover:bg-white/5"
        >
          Przywróć domyślne
        </button>
      </div>
    </div>
  );
}
