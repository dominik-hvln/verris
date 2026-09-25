'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@verris/ui';
import { HOSTING_MAIL_DAILY_SEND_LIMIT } from '@verris/contracts';
import {
  changeHostingEmailPasswordAction,
  changeHostingEmailQuotaAction,
  createHostingEmailAction,
  deleteHostingEmailAction,
  fetchHostingEmailAction,
} from '@/app/dashboard/services/[id]/hosting-email-actions';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import { Select } from '@/components/panel';
import { fetchConnectionInfoAction } from '@/app/dashboard/services/[id]/hosting-connection-actions';
import { HostingTabShell } from '@/components/hosting/HostingTabShell';
import { AccessList, Kpi, KpiStrip, Meter } from '@/components/panel/v2';
import MailExtras from '@/components/hosting/MailExtras';
import { MailLogPanel } from '@/components/hosting/MailLogPanel';
import { countDiskUsage, fetchDiskUsage, type DiskUsageStatus } from '@/app/dashboard/services/[id]/hosting-disk-usage-actions';
import { DeliverabilityPanel } from '@/app/dashboard/email/deliverability-panel';
import { createHostingSsoUrlAction } from '@/app/dashboard/services/[id]/hosting-sso-actions';
import { daErrorMessage, hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { useHostingLinks } from '@/components/hosting/hosting-links-context';
import { potwierdz } from '@/components/panel/potwierdz';

function genPassword(len = 18): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

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
  // E-06 — zajętość skrzynek z pomiaru zajętości konta (C-15), przeliczana na żądanie.
  const [zajetosc, setZajetosc] = useState<DiskUsageStatus | null>(null);
  useEffect(() => {
    void fetchDiskUsage(serviceId).then((r) => r.ok && setZajetosc(r.status));
  }, [serviceId]);
  useEffect(() => {
    if (!zajetosc?.wToku) return;
    const t = setInterval(() => void fetchDiskUsage(serviceId).then((r) => r.ok && setZajetosc(r.status)), 6_000);
    return () => clearInterval(t);
  }, [zajetosc?.wToku, serviceId]);
  const uzyteMb = (email: string) => {
    const s = zajetosc?.skrzynki.find((x) => x.email === email.toLowerCase());
    return s ? Math.round((s.kb / 1024) * 10) / 10 : null;
  };
  const [mailHost, setMailHost] = useState<string | null>(null);
  const [emailQuota, setEmailQuota] = useState<{ used: string; limit: string } | null>(null);
  const [domains, setDomains] = useState<string[]>([]);

  // create form
  const [localPart, setLocalPart] = useState('');
  const [domain, setDomain] = useState('');
  const [password, setPassword] = useState('');
  const [quota, setQuota] = useState('1024');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [ssoOpening, setSsoOpening] = useState(false);

  /**
   * SPRINT-1c — panel poczty bez przepisywania haseł: jednorazowy URL SSO.
   * Okno otwieramy PRZED awaitem (polityka popupów); przy błędzie wracamy do
   * zwykłego linku do panelu hostingu.
   */
  const openWebmailSso = async () => {
    if (ssoOpening) return;
    setSsoOpening(true);
    const win = window.open('about:blank', '_blank', 'noopener');
    const res = await createHostingSsoUrlAction(serviceId, 'webmail');
    setSsoOpening(false);
    if (res.ok) {
      if (win) win.location.href = res.url;
      else window.open(res.url, '_blank');
      return;
    }
    if (win) win.close();
    if (links.emailUrl) {
      toast.info('Auto-logowanie niedostępne — otwieram panel poczty', {
        description: daErrorMessage(res.error),
      });
      window.open(links.emailUrl, '_blank');
    } else {
      toast.error('Nie udało się otworzyć panelu poczty', { description: daErrorMessage(res.error) });
    }
  };
  // zmiana hasła per skrzynka
  const [pwEditing, setPwEditing] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  // E-05 — zmiana rozmiaru skrzynki
  const [quotaEditing, setQuotaEditing] = useState<string | null>(null);
  const [quotaValue, setQuotaValue] = useState('');
  const [quotaSaving, setQuotaSaving] = useState(false);

  const onChangeQuota = async (email: string) => {
    const mb = Number.parseInt(quotaValue, 10);
    if (!Number.isFinite(mb) || mb < 10) {
      toast.error('Rozmiar skrzynki to co najmniej 10 MB.');
      return;
    }
    setQuotaSaving(true);
    const res = await changeHostingEmailQuotaAction({ subscriptionId: serviceId, email, quotaMb: mb });
    setQuotaSaving(false);
    if (!res.ok) {
      toast.error('Nie udało się zmienić rozmiaru', { description: daErrorMessage(res.error) });
      return;
    }
    toast.success(`Nowy rozmiar skrzynki: ${mb} MB`, { description: email });
    setQuotaEditing(null);
    void load();
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const [emailRes, conn, domRes] = await Promise.all([
        fetchHostingEmailAction(serviceId),
        fetchConnectionInfoAction(serviceId).catch(() => null),
        fetchHostingDomainsAction(serviceId).catch(() => null),
      ]);
      setRows(emailRes.rows);
      setFetchError(emailRes.fetchError);
      const domNames = (domRes?.domains ?? []).map((d) => d.name);
      setDomains(domNames);
      setDomain((cur) => cur || domNames[0] || '');
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

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain) {
      toast.error('Brak domeny na koncie do utworzenia skrzynki.');
      return;
    }
    setCreating(true);
    const res = await createHostingEmailAction({
      subscriptionId: serviceId,
      email: `${localPart.trim()}@${domain}`,
      password,
      quotaMb: Number.parseInt(quota, 10) || 1024,
    });
    setCreating(false);
    if (!res.ok) {
      toast.error('Nie udało się utworzyć skrzynki', { description: daErrorMessage(res.error) });
      return;
    }
    toast.success('Skrzynka utworzona', { description: `${localPart.trim()}@${domain}` });
    setLocalPart('');
    setPassword('');
    void load();
  };

  const onChangePassword = async (email: string) => {
    if (pwValue.length < 8) {
      toast.error('Hasło musi mieć co najmniej 8 znaków.');
      return;
    }
    setPwSaving(true);
    const res = await changeHostingEmailPasswordAction({
      subscriptionId: serviceId,
      email,
      password: pwValue,
    });
    setPwSaving(false);
    if (!res.ok) {
      toast.error('Nie udało się zmienić hasła', { description: daErrorMessage(res.error) });
      return;
    }
    toast.success('Hasło skrzynki zmienione', { description: email });
    setPwEditing(null);
    setPwValue('');
  };

  const onDelete = async (email: string) => {
    if (!(await potwierdz(`Usunąć skrzynkę „${email}"? Tej operacji nie można cofnąć.`, { akcja: 'Usuń', niebezpieczne: true }))) return;
    setDeleting(email);
    const res = await deleteHostingEmailAction(serviceId, email);
    setDeleting(null);
    if (!res.ok) {
      toast.error('Nie udało się usunąć skrzynki', { description: daErrorMessage(res.error) });
      return;
    }
    toast.success('Skrzynka usunięta');
    void load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie poczty…
      </div>
    );
  }

  const imapHost = mailHost ?? '—';

  return (
    <HostingTabShell
      title="Poczta e-mail"
      description="Skrzynki na koncie hostingowym oraz ustawienia IMAP/SMTP do klienta pocztowego."
      icon={<Mail className="h-4 w-4" />}
      help={{
        blurb:
          'Spokojnie — tworzenie skrzynki niczego nie psuje. Podajesz adres i hasło, a my zajmujemy się resztą. Dane do Outlooka/telefonu masz poniżej.',
        kbQuery: 'poczta',
      }}
      actions={
        <>
          <Link
            href={`/dashboard/migrations?serviceId=${encodeURIComponent(serviceId)}&poczta=1`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.04] px-3 text-xs text-white hover:bg-white/10"
            title="Skopiujemy wiadomości ze skrzynki u poprzedniego dostawcy (IMAP) do skrzynki na tym koncie"
          >
            Przenieś pocztę z innego serwera
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={ssoOpening}
            onClick={() => void openWebmailSso()}
            className="h-8 gap-1.5 border-white/15 bg-white/[0.04] text-white hover:bg-white/10 text-xs"
            title="Loguje Cię automatycznie do panelu poczty (jednorazowy link); przy skrzynce klikniesz webmail bez hasła"
          >
            {ssoOpening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Webmail / panel
            <ExternalLink className="h-3 w-3 opacity-70" />
          </Button>
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

      <KpiStrip>
        <Kpi
          label="Skrzynki"
          value={loading ? '…' : rows.length}
          unit={emailQuota ? `z ${emailQuota.limit}` : undefined}
          foot={<span>{emailQuota ? 'limit z planu' : 'na koncie'}</span>}
        >
          {emailQuota && Number(emailQuota.limit) > 0 ? <Meter pct={(rows.length / Number(emailQuota.limit)) * 100} /> : null}
        </Kpi>
        <Kpi label="Domeny z pocztą" value={loading ? '…' : new Set(rows.map((r) => r.email.split('@')[1])).size} foot={<span>adresy w tych domenach</span>} />
        <Kpi label="Serwer poczty" value={<span className="font-mono text-[15px] font-semibold tracking-normal">{imapHost}</span>} foot={<span>IMAP 993 · SMTP 465</span>} />
        <Kpi
          label="Limit wysyłki"
          value={HOSTING_MAIL_DAILY_SEND_LIMIT}
          unit="/ dobę"
          foot={<span>wiadomości z całego konta, licznik zeruje się raz na dobę</span>}
        />
      </KpiStrip>

      <div className="mb-4 mt-4 rounded-[10px] border border-line bg-card">
        <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
          <h3 className="m-0 font-display text-[15px] font-bold text-foreground">Ustawienia klienta pocztowego</h3>
        </div>
        <AccessList
          items={[
            { label: 'Serwer przychodzący (IMAP)', values: [imapHost], port: '993' },
            { label: 'Serwer wychodzący (SMTP)', values: [imapHost], port: '465' },
          ]}
        />
        <p className="m-0 px-4 pb-3.5 pt-2 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
          Szyfrowanie SSL/TLS: SMTP na porcie 465 (SSL). Jeśli Twoja sieć blokuje 465, użyj 587 ze STARTTLS. Login to pełny adres skrzynki (np. kontakt@twojadomena.pl). Hasło ustawiasz przy tworzeniu skrzynki. Webmail otwierasz przyciskiem wyżej.
        </p>
      </div>

      {/* Create mailbox */}
      <form onSubmit={onCreate} className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="mb-3 text-sm font-semibold text-white">Nowa skrzynka e-mail</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">Adres</span>
            <div className="flex items-stretch gap-1.5">
              <input
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value)}
                placeholder="kontakt"
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              />
              <span className="flex items-center text-sm text-neutral-500">@</span>
              <Select
                value={domain}
                onChange={setDomain}
                disabled={domains.length === 0}
                aria-label="Domena"
                className="min-w-[10rem]"
                placeholder="—"
                options={domains.map((d) => ({ value: d, label: d }))}
              />
            </div>
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
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <label className="space-y-1">
            <span className="text-xs text-neutral-400">Limit (MB)</span>
            <input
              value={quota}
              onChange={(e) => setQuota(e.target.value.replace(/\D/g, ''))}
              className="w-28 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <Button
            type="submit"
            size="sm"
            disabled={creating || !localPart.trim() || !domain || password.length < 8}
            className="h-8 gap-1.5 bg-white text-black hover:bg-neutral-200 text-xs"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Utwórz skrzynkę
          </Button>
        </div>
      </form>

      {rows.length === 0 && !fetchError ? (
        <p className="rounded-xl border border-white/5 bg-[#050505] px-3 py-8 text-center text-xs text-neutral-500">
          Brak skrzynek — utwórz pierwszą powyżej.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/5 bg-[#050505]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-2 text-xs text-neutral-400">
            <span>
              {zajetosc?.policzono
                ? `Zajętość skrzynek z ${new Date(zajetosc.policzono).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`
                : 'Zajętość skrzynek policzy serwer na żądanie.'}
            </span>
            <button
              type="button"
              disabled={!zajetosc || zajetosc.wToku}
              onClick={() => void countDiskUsage(serviceId).then((r) => (r.ok ? setZajetosc(r.status) : toast.error(r.error)))}
              className="font-semibold text-data-hi hover:underline disabled:opacity-50"
            >
              {zajetosc?.wToku ? 'Liczę…' : 'Przelicz zajętość'}
            </button>
          </div>
          {rows.map((box) => (
            <div key={box.id} className="border-b border-white/5 last:border-0">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="inline-flex min-w-0 flex-1 items-center gap-2 break-all text-sm text-white">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                  {box.email}
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    data-tip="Zmień rozmiar skrzynki"
                    onClick={() => {
                      setQuotaEditing((cur) => (cur === box.email ? null : box.email));
                      setQuotaValue(box.quotaMb != null ? String(box.quotaMb) : '1024');
                      setPwEditing(null);
                    }}
                    className="whitespace-nowrap text-xs text-neutral-400 underline decoration-dotted underline-offset-2 hover:text-white"
                  >
                    {uzyteMb(box.email) !== null ? `${uzyteMb(box.email)!.toLocaleString('pl-PL')} MB z ` : ''}
                    {box.quotaMb != null ? `${box.quotaMb} MB` : 'bez limitu'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void openWebmailSso()}
                    disabled={ssoOpening}
                    className="text-xs text-neutral-400 hover:text-white disabled:opacity-50"
                  >
                    Webmail →
                  </button>
                  <button
                    type="button"
                    title="Zmień hasło"
                    onClick={() => {
                      setPwEditing((cur) => (cur === box.email ? null : box.email));
                      setPwValue('');
                      setQuotaEditing(null);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10"
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Usuń skrzynkę"
                    disabled={deleting === box.email}
                    onClick={() => void onDelete(box.email)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                  >
                    {deleting === box.email ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              {quotaEditing === box.email ? (
                <div className="flex flex-wrap items-end gap-2 px-4 pb-3">
                  <label className="space-y-1">
                    <span className="text-[11px] text-neutral-400">Nowy rozmiar (MB)</span>
                    <input
                      value={quotaValue}
                      inputMode="numeric"
                      onChange={(e) => setQuotaValue(e.target.value.replace(/\D/g, ''))}
                      className="w-32 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    disabled={quotaSaving || !quotaValue}
                    onClick={() => void onChangeQuota(box.email)}
                    className="h-9 gap-1.5 bg-white text-black hover:bg-neutral-200 text-xs"
                  >
                    {quotaSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Zapisz rozmiar
                  </Button>
                  <span className="basis-full text-[11px] text-neutral-500">Poczta w skrzynce zostaje. Zmniejszenie poniżej zajętego miejsca zablokuje odbiór nowych wiadomości.</span>
                </div>
              ) : null}
              {pwEditing === box.email ? (
                <div className="flex items-end gap-2 px-4 pb-3">
                  <label className="flex-1 space-y-1">
                    <span className="text-[11px] text-neutral-400">Nowe hasło (min. 8 znaków)</span>
                    <div className="flex gap-1.5">
                      <input
                        value={pwValue}
                        onChange={(e) => setPwValue(e.target.value)}
                        placeholder="nowe hasło"
                        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/30"
                      />
                      <button
                        type="button"
                        title="Wygeneruj hasło"
                        onClick={() => setPwValue(genPassword())}
                        className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 text-neutral-300 hover:bg-white/10"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                    </div>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pwSaving || pwValue.length < 8}
                    onClick={() => void onChangePassword(box.email)}
                    className="h-9 gap-1.5 bg-white text-black hover:bg-neutral-200 text-xs"
                  >
                    {pwSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Zapisz hasło
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <MailExtras serviceId={serviceId} />

      <DeliverabilityPanel serviceId={serviceId} />

      <MailLogPanel serviceId={serviceId} />

      <p className="mt-3 flex items-start gap-2 text-[11px] text-neutral-500">
        <Server className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Skrzynki tworzysz i usuwasz tutaj. Webmail (jeśli włączony na węźle) i zaawansowane opcje są dostępne w
        panelu hostingu.
      </p>
    </HostingTabShell>
  );
}
