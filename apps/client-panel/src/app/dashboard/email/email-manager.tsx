'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ExternalLink, Loader2, Mail, Plus, Trash2 } from 'lucide-react';
import {
  createHostingEmailAction,
  deleteHostingEmailAction,
} from '../services/[id]/hosting-email-actions';

export interface MailboxRow {
  id: string;
  email: string;
  quotaMb: number | null;
}

/**
 * P-1 — mailbox management + Roundcube webmail access for a hosting service.
 * Create/delete mailboxes via DirectAdmin; "Otwórz webmail" opens the
 * custom-branded Roundcube at the platform-configured URL (prefilled login).
 */
export function EmailManager({
  serviceId,
  domain,
  rows,
  webmailUrl,
}: {
  serviceId: string;
  domain: string | null;
  rows: MailboxRow[];
  webmailUrl: string;
}) {
  const router = useRouter();
  const [localPart, setLocalPart] = useState('');
  const [password, setPassword] = useState('');
  const [quota, setQuota] = useState('1024');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const webmailFor = (email?: string) => {
    if (!webmailUrl) return null;
    const base = webmailUrl.replace(/\/$/, '');
    return email ? `${base}/?_user=${encodeURIComponent(email)}` : base;
  };

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    const lp = localPart.trim().toLowerCase();
    if (!lp || !domain) {
      setError('Podaj nazwę skrzynki.');
      return;
    }
    if (password.length < 8) {
      setError('Hasło musi mieć min. 8 znaków.');
      return;
    }
    startTransition(async () => {
      const res = await createHostingEmailAction({
        subscriptionId: serviceId,
        email: `${lp}@${domain}`,
        password,
        quotaMb: Number.parseInt(quota, 10) || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        toast.error('Nie udało się utworzyć skrzynki', { description: res.error });
        return;
      }
      setOk(`Skrzynka ${lp}@${domain} utworzona.`);
      toast.success(`Utworzono skrzynkę ${lp}@${domain}`);
      setLocalPart('');
      setPassword('');
      router.refresh();
    });
  };

  const onDelete = (email: string) => {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const res = await deleteHostingEmailAction(serviceId, email);
      if (!res.ok) {
        setError(res.error);
        toast.error('Nie udało się usunąć skrzynki', { description: res.error });
        return;
      }
      toast.success(`Usunięto skrzynkę ${email}`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {webmailUrl ? (
        <a
          href={webmailFor() ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
        >
          <ExternalLink className="h-4 w-4" /> Otwórz webmail (Roundcube)
        </a>
      ) : null}

      <form
        onSubmit={onCreate}
        className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3"
      >
        <p className="text-sm font-semibold text-white">Nowa skrzynka</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex flex-1 items-center rounded-lg border border-white/10 bg-black/40">
            <input
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
              placeholder="kontakt"
              className="flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none"
            />
            <span className="px-3 text-sm text-neutral-400">@{domain ?? '...'}</span>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="hasło (min. 8 znaków)"
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
          />
          <input
            type="number"
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
            min={0}
            title="Limit MB (0 = bez limitu)"
            className="w-24 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none"
          />
          <button
            type="submit"
            disabled={pending || !domain}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Dodaj
          </button>
        </div>
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {ok ? <p className="text-sm text-emerald-300">{ok}</p> : null}
      </form>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-neutral-400">Brak skrzynek — utwórz pierwszą powyżej.</p>
        ) : (
          rows.map((box) => (
            <div
              key={box.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-white shrink-0" aria-hidden />
                  <p className="font-medium text-white truncate">{box.email}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Limit: {box.quotaMb != null ? `${box.quotaMb} MB` : 'brak limitu'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {webmailUrl ? (
                  <a
                    href={webmailFor(box.email) ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg border border-white/10 hover:bg-white/5"
                    title="Webmail"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-neutral-300" />
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => onDelete(box.email)}
                  disabled={pending}
                  className="p-2 rounded-lg border border-white/10 hover:bg-rose-500/10 hover:border-rose-500/40 disabled:opacity-50"
                  title="Usuń skrzynkę"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-300" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
