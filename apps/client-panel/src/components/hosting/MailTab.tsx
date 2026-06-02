'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Server,
} from 'lucide-react';
import { Button } from '@verris/ui';
import { fetchHostingEmailAction } from '@/app/dashboard/services/[id]/hosting-email-actions';
import { fetchConnectionInfoAction } from '@/app/dashboard/services/[id]/hosting-connection-actions';
import { HostingTabShell, DaExternalLink } from '@/components/hosting/HostingTabShell';
import { hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { useHostingLinks } from '@/components/hosting/hosting-links-context';

interface Props {
  serviceId: string;
}

export default function MailTab({ serviceId }: Props) {
  const { links } = useHostingLinks();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rows, setRows] = useState<{ id: string; email: string; quotaMb: number | null }[]>([]);
  const [mailHost, setMailHost] = useState<string | null>(null);
  const [emailQuota, setEmailQuota] = useState<{ used: string; limit: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [emailRes, conn] = await Promise.all([
        fetchHostingEmailAction(serviceId),
        fetchConnectionInfoAction(serviceId).catch(() => null),
      ]);
      setRows(emailRes.rows);
      setFetchError(emailRes.fetchError);
      setMailHost(conn?.mailHost ?? null);
      if (conn?.emails) {
        const used =
          conn.emails.used == null ? '—' : String(Math.round(conn.emails.used));
        const limit =
          conn.emails.limit == null ? '∞' : String(Math.round(conn.emails.limit));
        setEmailQuota({ used, limit });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać poczty.');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie poczty…
      </div>
    );
  }

  const emailUrl = links.emailUrl;
  const imapHost = mailHost ?? '—';

  return (
    <HostingTabShell
      title="Poczta e-mail"
      description="Skrzynki na koncie hostingowym oraz ustawienia IMAP/SMTP do klienta pocztowego."
      icon={<Mail className="h-4 w-4" />}
      actions={
        <>
          {emailUrl ? (
            <DaExternalLink href={emailUrl} variant="primary">
              Zarządzaj skrzynkami
              <ExternalLink className="h-3 w-3 opacity-70" />
            </DaExternalLink>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true);
              void load();
            }}
            className="h-8 gap-1.5 border-white/15 bg-white/[0.04] text-white hover:bg-white/10 text-xs"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Odśwież
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {fetchError ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {hostingFetchErrorMessage(fetchError)}
        </div>
      ) : null}

      <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Ustawienia klienta pocztowego
        </h3>
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-neutral-500">Serwer przychodzący (IMAP)</dt>
            <dd className="font-mono text-neutral-200 mt-0.5">{imapHost}</dd>
            <dd className="text-neutral-500 mt-0.5">Port 993 · SSL/TLS</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Serwer wychodzący (SMTP)</dt>
            <dd className="font-mono text-neutral-200 mt-0.5">{imapHost}</dd>
            <dd className="text-neutral-500 mt-0.5">Port 587 · STARTTLS (lub 465 SSL)</dd>
          </div>
        </dl>
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          Login to pełny adres skrzynki (np. kontakt@twojadomena.pl). Hasło ustawiasz przy tworzeniu skrzynki w
          panelu hostingu. Webmail, jeśli jest włączony na węźle, otwierasz z zaawansowanego panelu hostingu.
        </p>
        {emailQuota ? (
          <p className="text-[11px] text-neutral-400">
            Skrzynki na koncie: <span className="text-white font-medium">{emailQuota.used}</span>
            <span className="text-neutral-500"> / {emailQuota.limit}</span>
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/5 bg-[#050505] overflow-hidden">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-white/5 border-b border-white/5 text-left">
            <tr>
              <th className="py-3 px-3 text-neutral-300 font-semibold">Adres e-mail</th>
              <th className="py-3 px-3 text-neutral-300 font-semibold hidden sm:table-cell">Limit</th>
              <th className="py-3 px-3 text-right text-neutral-300 font-semibold">Panel</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !fetchError ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-neutral-500 text-xs">
                  Brak skrzynek — utwórz je w panelu hostingu (Zarządzaj skrzynkami).
                </td>
              </tr>
            ) : null}
            {rows.map((box) => (
              <tr key={box.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-3 px-3 text-white truncate max-w-[220px]" title={box.email}>
                  <span className="inline-flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                    {box.email}
                  </span>
                </td>
                <td className="py-3 px-3 text-neutral-400 hidden sm:table-cell">
                  {box.quotaMb != null ? `${box.quotaMb} MB` : 'bez limitu'}
                </td>
                <td className="py-3 px-3 text-right">
                  {emailUrl ? (
                    <a
                      href={emailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-neutral-300 hover:text-white whitespace-nowrap"
                    >
                      Otwórz →
                    </a>
                  ) : (
                    <span className="text-neutral-600 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex items-start gap-2 text-[11px] text-neutral-500">
        <Server className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Tworzenie i usuwanie skrzynek oraz zmiana haseł odbywa się w zaawansowanym panelu hostingu — tutaj widzisz listę i dane
        do konfiguracji programu pocztowego.
      </p>
    </HostingTabShell>
  );
}
