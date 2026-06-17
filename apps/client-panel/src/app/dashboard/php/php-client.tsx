'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';
import { Select } from '@/components/panel';
import { setPhpVersion, type PhpStatus } from './php-actions';

export function PhpClient({ serviceId, status }: { serviceId: string; status: PhpStatus }) {
  const router = useRouter();
  const [version, setVersion] = useState(status.version ?? status.availableVersions[0] ?? '');
  const [pending, startTransition] = useTransition();

  const inflight =
    status.lastTask && (status.lastTask.status === 'QUEUED' || status.lastTask.status === 'RUNNING');

  const apply = () =>
    startTransition(async () => {
      const res = await setPhpVersion(serviceId, version);
      if (!res.ok) {
        toast.error('Nie udało się zmienić wersji PHP', { description: res.error });
        return;
      }
      toast.success(`Zlecono zmianę PHP na ${version}`);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm text-neutral-400">Domena</p>
        <p className="font-mono text-white">{status.domain}</p>
        <p className="mt-3 text-sm text-neutral-400">Aktualna wersja PHP</p>
        <p className="text-2xl font-bold text-white">{status.version ?? 'domyślna węzła'}</p>
        {status.appliedAt ? (
          <p className="mt-1 text-xs text-neutral-500">
            Zastosowano: {new Date(status.appliedAt).toLocaleString('pl-PL')}
          </p>
        ) : null}
      </div>

      {inflight ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <Loader2 className="h-4 w-4 animate-spin" /> Zmiana wersji PHP jest w toku — odśwież za chwilę.
        </div>
      ) : null}
      {status.lastTask?.status === 'FAILED' ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          Ostatnia zmiana nie powiodła się: {status.lastTask.errorMessage ?? 'błąd'}.
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Zmień wersję PHP</p>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end max-w-md">
          <label className="flex-1 space-y-1">
            <span className="text-xs text-neutral-400">Wersja</span>
            <Select
              value={version}
              onChange={setVersion}
              aria-label="Wersja PHP"
              options={status.availableVersions.map((v) => ({ value: v, label: `PHP ${v}` }))}
            />
          </label>
          <button
            type="button"
            onClick={apply}
            disabled={pending || !!inflight || version === status.version}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-600 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Zastosuj
          </button>
        </div>
        <p className="text-[11px] text-neutral-500">
          Zmiana jest wykonywana na serwerze (CloudLinux PHP Selector) — zwykle trwa kilkadziesiąt
          sekund. Skrypty i .htaccess pozostają bez zmian.
        </p>
      </div>
    </div>
  );
}
