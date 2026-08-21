'use client';

import { useEffect, useState } from 'react';
import { FolderKanban, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@verris/ui';
import type { HostingFtpAccountDto } from '@verris/contracts';
import {
  createHostingFtpAction,
  deleteHostingFtpAction,
  fetchHostingFtpAction,
} from '@/app/dashboard/services/[id]/hosting-extra-actions';
import { daErrorMessage, hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { HostingHelpHint } from '@/components/hosting/HostingTabShell';

function genPassword(len = 18): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

export default function FtpTab({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<HostingFtpAccountDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [directory, setDirectory] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    void fetchHostingFtpAction(serviceId)
      .then((res) => {
        setRows(res.rows);
        setError(res.fetchError);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Nie udało się wczytać kont FTP.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [serviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const res = await createHostingFtpAction(serviceId, {
      username: username.trim(),
      password,
      directory: directory.trim() || undefined,
    });
    setCreating(false);
    if (!res.ok)
      return toast.error('Nie udało się utworzyć konta FTP', {
        description: daErrorMessage(res.error),
      });
    toast.success('Konto FTP utworzone');
    setUsername('');
    setPassword('');
    setDirectory('');
    load();
  };

  const onDelete = async (u: string) => {
    if (!window.confirm(`Usunąć konto FTP „${u}"?`)) return;
    setDeleting(u);
    const res = await deleteHostingFtpAction(serviceId, u);
    setDeleting(null);
    if (!res.ok) return toast.error('Nie udało się usunąć', { description: daErrorMessage(res.error) });
    toast.success('Konto FTP usunięte');
    load();
  };

  return (
    <div className="space-y-5">
      <HostingHelpHint
        help={{
          blurb:
            'Konto FTP to dostęp do plików strony z programu typu FileZilla. Tworzysz login i hasło — to bezpieczne i w każdej chwili możesz je usunąć.',
          kbQuery: 'konto FTP',
        }}
      />
      <form onSubmit={onCreate} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="mb-3 text-sm font-semibold text-white">Nowe konto FTP</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">Użytkownik</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="np. transfer"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">Hasło</span>
            <div className="flex gap-1.5">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min. 8 znaków"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/30"
              />
              <button
                type="button"
                title="Wygeneruj hasło"
                onClick={() => setPassword(genPassword())}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 text-neutral-300 hover:bg-white/10"
              >
                <KeyRound className="h-4 w-4" />
              </button>
            </div>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">Katalog (opcjonalnie)</span>
            <input
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              placeholder="domyślnie katalog domowy"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={creating || !username.trim() || password.length < 8}
            className="h-8 gap-1.5 bg-white text-black hover:bg-neutral-200 text-xs"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Utwórz konto FTP
          </Button>
        </div>
      </form>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </div>
      ) : error ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-200/90">
          {hostingFetchErrorMessage(error)}
        </p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-neutral-500">
          <FolderKanban className="h-8 w-8 opacity-20" />
          Brak dodatkowych kont FTP.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/5 bg-[#050505]">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-white">{r.username}</p>
                <p className="truncate font-mono text-xs text-neutral-500">{r.path}</p>
              </div>
              <button
                type="button"
                title="Usuń konto FTP"
                disabled={deleting === r.username}
                onClick={() => void onDelete(r.username)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                {deleting === r.username ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
