'use client';

import { useState } from 'react';
import { KeyRound, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchDbUsersAction,
  createDbUserAction,
  removeDbUserAction,
  changeDbUserPasswordAction,
} from '@/app/dashboard/services/[id]/hosting-db-users-actions';
import { daErrorMessage } from '@/lib/client-hosting-messages';

function genPassword(len = 18): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

/** SPRINT-1a — zarządzanie użytkownikami istniejącej bazy MySQL. */
export default function DbUsers({ serviceId, db }: { serviceId: string; db: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr(null);
    const res = await fetchDbUsersAction(serviceId, db).catch((e) => ({
      users: [] as string[],
      fetchError: e instanceof Error ? e.message : 'Błąd',
    }));
    setUsers(res.users);
    setErr(res.fetchError);
    setLoading(false);
    setLoaded(true);
  };
  const toggle = () => {
    const n = !open;
    setOpen(n);
    if (n && !loaded) void load();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.trim() || password.length < 8) {
      toast.error('Podaj nazwę użytkownika i hasło (min. 8 znaków).');
      return;
    }
    setBusy(true);
    const res = await createDbUserAction({ subscriptionId: serviceId, db, user: user.trim(), password });
    setBusy(false);
    if (!res.ok) {
      toast.error('Nie udało się dodać użytkownika', { description: daErrorMessage(res.error) });
      return;
    }
    toast.success('Użytkownik dodany', { description: res.username });
    setUser('');
    setPassword('');
    void load();
  };

  const remove = async (u: string) => {
    if (!window.confirm(`Usunąć użytkownika „${u}"? Aplikacje łączące się tym loginem stracą dostęp.`)) return;
    setDel(u);
    const res = await removeDbUserAction({ subscriptionId: serviceId, db, user: u });
    setDel(null);
    if (!res.ok) {
      toast.error('Nie udało się usunąć', { description: daErrorMessage(res.error) });
      return;
    }
    toast.success('Użytkownik usunięty');
    void load();
  };

  const savePassword = async (u: string) => {
    setPwSaving(true);
    const res = await changeDbUserPasswordAction({ subscriptionId: serviceId, db, user: u, password: pwValue });
    setPwSaving(false);
    if (!res.ok) {
      toast.error('Nie udało się zmienić hasła', { description: daErrorMessage(res.error) });
      return;
    }
    toast.success('Hasło zmienione');
    setPwFor(null);
    setPwValue('');
  };

  return (
    <div className="mt-1">
      <button onClick={toggle} className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-emerald-300">
        <Users className="h-3 w-3" /> {open ? 'Ukryj użytkowników' : 'Użytkownicy bazy'}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-white/10 bg-black/30 p-3">
          <p className="mb-2 text-[11px] text-neutral-500">
            Dodatkowi użytkownicy tej bazy — np. osobny login dla aplikacji albo współpracownika. Nazwa dostanie prefiks konta.
          </p>
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="np. app2"
              maxLength={16}
              className="w-32 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-white placeholder:text-neutral-500"
            />
            <div className="flex flex-[2] gap-1.5">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="hasło (min. 8 znaków)"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-sm text-white placeholder:text-neutral-500"
              />
              <button
                type="button"
                title="Wygeneruj hasło"
                onClick={() => setPassword(genPassword())}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 text-neutral-300 hover:bg-white/10"
              >
                <KeyRound className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Dodaj
            </button>
          </form>
          {loading ? (
            <p className="mt-2 text-[11px] text-neutral-500">
              <Loader2 className="inline h-3 w-3 animate-spin" /> Wczytywanie…
            </p>
          ) : err ? (
            <p className="mt-2 text-[11px] text-amber-300/80">{daErrorMessage(err)}</p>
          ) : users.length === 0 ? (
            <p className="mt-2 text-[11px] text-neutral-500">Brak dodatkowych użytkowników.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {users.map((u) => (
                <div key={u} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="break-all font-mono text-xs text-white">{u}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        title="Zmień hasło"
                        onClick={() => {
                          setPwFor((cur) => (cur === u ? null : u));
                          setPwValue('');
                        }}
                        className="text-neutral-500 hover:text-white"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Usuń użytkownika"
                        onClick={() => remove(u)}
                        disabled={del === u}
                        className="text-neutral-500 hover:text-rose-300"
                      >
                        {del === u ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </span>
                  </div>
                  {pwFor === u ? (
                    <div className="mt-1.5 flex gap-1.5">
                      <input
                        value={pwValue}
                        onChange={(e) => setPwValue(e.target.value)}
                        placeholder="nowe hasło (min. 8 znaków)"
                        className="w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-xs text-white placeholder:text-neutral-500"
                      />
                      <button
                        type="button"
                        title="Wygeneruj hasło"
                        onClick={() => setPwValue(genPassword())}
                        className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 text-neutral-300 hover:bg-white/10"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={pwSaving || pwValue.length < 8}
                        onClick={() => void savePassword(u)}
                        className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-black hover:bg-neutral-200 disabled:opacity-40"
                      >
                        {pwSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Zapisz'}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
