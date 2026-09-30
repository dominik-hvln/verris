'use client';

import { useCallback, useEffect, useState } from 'react';
import { PoleHasla } from '@/components/hosting/PoleHasla';
import Link from 'next/link';
import {
  AlertCircle,
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
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
  fetchHostingEmailAction as fetchHostingEmailActionAkcja,
} from '@/app/dashboard/services/[id]/hosting-email-actions';
import {
  fetchHostingDomainsAction as fetchHostingDomainsActionAkcja,
} from '@/app/dashboard/services/[id]/hosting-domains-action';
import { Select } from '@/components/panel';
import {
  fetchConnectionInfoAction as fetchConnectionInfoActionAkcja,
} from '@/app/dashboard/services/[id]/hosting-connection-actions';
import { HostingTabShell } from '@/components/hosting/HostingTabShell';
import { AccessList, Kpi, KpiStrip, Meter } from '@/components/panel/v2';
import MailExtras, { MailOchrona } from '@/components/hosting/MailExtras';
import { MailLogPanel } from '@/components/hosting/MailLogPanel';
import { countDiskUsage, fetchDiskUsage, type DiskUsageStatus } from '@/app/dashboard/services/[id]/hosting-disk-usage-actions';
import { DeliverabilityPanel } from '@/app/dashboard/email/deliverability-panel';
import { createWebmailLoginAction } from '@/app/dashboard/services/[id]/hosting-sso-actions';
import { daErrorMessage, hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { potwierdz } from '@/components/panel/potwierdz';
import { zOdpakowaniem } from '@/lib/wynik-akcji';

// Akcja zwraca Wynik (komunikat błędu przeżywa produkcję) — tu z powrotem dane albo Error z treścią.
const fetchHostingEmailAction = zOdpakowaniem(fetchHostingEmailActionAkcja);
const fetchHostingDomainsAction = zOdpakowaniem(fetchHostingDomainsActionAkcja);
const fetchConnectionInfoAction = zOdpakowaniem(fetchConnectionInfoActionAkcja);


interface Props {
  serviceId: string;
}

export default function MailTab({ serviceId }: Props) {
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
   * E-14 — webmail skrzynki od razu w Roundcube (token z DA wysyłany formularzem POST w nowej karcie).
   * Bez zapasowego logowania do DirectAdmina (white label): przy błędzie komunikat, nie panel DA.
   */
  const openMailboxWebmail = async (email: string) => {
    if (ssoOpening) return;
    setSsoOpening(true);
    const win = window.open('about:blank', '_blank');
    const res = await createWebmailLoginAction(serviceId, email);
    setSsoOpening(false);
    if (!res.ok || !win) {
      if (win) win.close();
      toast.error('Nie udało się otworzyć webmaila', {
        description: res.ok ? 'Przeglądarka zablokowała nowe okno — zezwól na wyskakujące okna dla panelu.' : daErrorMessage(res.error),
      });
      return;
    }
    const doc = win.document;
    const form = doc.createElement('form');
    form.method = 'post';
    form.action = res.action;
    const input = doc.createElement('input');
    input.type = 'hidden';
    input.name = 'token';
    input.value = res.token;
    form.appendChild(input);
    doc.body.appendChild(form);
    win.opener = null;
    form.submit();
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
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
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
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-raised px-3 text-xs text-foreground hover:bg-raised"
            title="Skopiujemy wiadomości ze skrzynki u poprzedniego dostawcy (IMAP) do skrzynki na tym koncie"
          >
            Przenieś pocztę z innego serwera
          </Link>
          {mailHost ? (
            <a
              href={`https://${mailHost}/roundcube/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-raised px-3 text-xs text-foreground hover:bg-raised"
              title="Logowanie do poczty w przeglądarce adresem i hasłem skrzynki; przy skrzynce poniżej otworzysz ją bez hasła"
            >
              Webmail
              <ExternalLink className="h-3 w-3 opacity-70" />
            </a>
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
            className="h-8 gap-1.5 border-line-strong bg-raised text-foreground hover:bg-raised text-xs"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Odśwież
          </Button>
        </>
      }
    >
      {error ? (
        <div className="mb-3 flex items-start gap-2 rounded-[7px] border border-crit/30 bg-crit/12 px-3 py-2 text-xs text-crit">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {fetchError ? (
        <div className="mb-3 flex items-start gap-2 rounded-[7px] border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn">
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

      {/* Dwie kolumny: skrzynki i ich ustawienia po lewej, ustawienia domeny i klienta pocztowego po prawej. */}
      <div className="mt-4 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
        <div className="min-w-0">
      {/* Create mailbox */}
      <form onSubmit={onCreate} className="mb-5 rounded-[10px] border border-line bg-raised p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Nowa skrzynka e-mail</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Adres</span>
            <div className="flex items-stretch gap-1.5">
              <input
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value)}
                placeholder="kontakt"
                className="w-full rounded-[7px] border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-data"
              />
              <span className="flex items-center text-sm text-muted-foreground">@</span>
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
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Hasło</span>
            <div className="flex gap-1.5">
              <PoleHasla value={password} onChange={setPassword} placeholder="min. 8 znaków" className="w-full rounded-[7px] border border-line bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-data" />
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Limit (MB)</span>
            <input
              value={quota}
              onChange={(e) => setQuota(e.target.value.replace(/\D/g, ''))}
              className="w-28 rounded-[7px] border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-data"
            />
          </label>
          <Button
            type="submit"
            size="sm"
            disabled={creating || !localPart.trim() || !domain || password.length < 8}
            className="h-8 gap-1.5 bg-primary text-primary-foreground font-semibold hover:bg-data-hi text-xs"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Utwórz skrzynkę
          </Button>
        </div>
      </form>

      {rows.length === 0 && !fetchError ? (
        <p className="rounded-[10px] border border-line bg-card px-3 py-8 text-center text-xs text-muted-foreground">
          Brak skrzynek — utwórz pierwszą powyżej.
        </p>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-line bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-muted-foreground">
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
            <div key={box.id} className="border-b border-line last:border-0">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="inline-flex min-w-0 flex-1 items-center gap-2 break-all text-sm text-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
                    className="whitespace-nowrap text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    {uzyteMb(box.email) !== null ? `${uzyteMb(box.email)!.toLocaleString('pl-PL')} MB z ` : ''}
                    {box.quotaMb ? `${box.quotaMb} MB` : 'bez limitu'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void openMailboxWebmail(box.email)}
                    disabled={ssoOpening}
                    className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    Webmail →
                  </button>
                  <button
                    type="button"
                    title="Zmień hasło"
                    aria-label={`Zmień hasło ${box.email}`}
                    aria-expanded={pwEditing === box.email}
                    onClick={() => {
                      setPwEditing((cur) => (cur === box.email ? null : box.email));
                      setPwValue('');
                      setQuotaEditing(null);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-raised text-[color:var(--verris-body)] hover:bg-raised"
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Usuń skrzynkę"
                    aria-label={`Usuń skrzynkę ${box.email}`}
                    disabled={deleting === box.email}
                    onClick={() => void onDelete(box.email)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-raised text-crit hover:bg-crit/12 disabled:opacity-50"
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
                    <span className="text-[11px] text-muted-foreground">Nowy rozmiar (MB)</span>
                    <input
                      value={quotaValue}
                      inputMode="numeric"
                      onChange={(e) => setQuotaValue(e.target.value.replace(/\D/g, ''))}
                      className="w-32 rounded-[7px] border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-data"
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    disabled={quotaSaving || !quotaValue}
                    onClick={() => void onChangeQuota(box.email)}
                    className="h-9 gap-1.5 bg-primary text-primary-foreground font-semibold hover:bg-data-hi text-xs"
                  >
                    {quotaSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Zapisz rozmiar
                  </Button>
                  <span className="basis-full text-[11px] text-muted-foreground">Poczta w skrzynce zostaje. Zmniejszenie poniżej zajętego miejsca zablokuje odbiór nowych wiadomości.</span>
                </div>
              ) : null}
              {pwEditing === box.email ? (
                <div className="flex items-end gap-2 px-4 pb-3">
                  <div className="flex-1 space-y-1">
                    <span className="text-[11px] text-muted-foreground">Nowe hasło (min. 8 znaków)</span>
                    <div className="flex gap-1.5">
                      <PoleHasla value={pwValue} onChange={setPwValue} placeholder="nowe hasło" className="w-full rounded-[7px] border border-line bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-data" />
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pwSaving || pwValue.length < 8}
                    onClick={() => void onChangePassword(box.email)}
                    className="h-9 gap-1.5 bg-primary text-primary-foreground font-semibold hover:bg-data-hi text-xs"
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
        </div>
        <aside className="min-w-0 space-y-5 xl:sticky xl:top-4">
          {/* CalDAV/CardDAV i filtry Sieve ukryte do sprawdzenia na węźle: E-23 po starcie, E-12 (Pigeonhole). */}
      <div className="rounded-[10px] border border-line bg-card">
        <div className="px-4 pt-3.5">
          <h3 className="m-0 font-display text-[15px] font-bold text-foreground">Ustawienia klienta pocztowego</h3>
        </div>
        <AccessList
          items={[
            { label: 'Serwer przychodzący (IMAP)', values: [imapHost], port: '993' },
            { label: 'Serwer wychodzący (SMTP)', values: [imapHost], port: '465' },
          ]}
        />
        <p className="m-0 px-4 pb-3.5 pt-2 text-[12px] leading-relaxed text-muted-foreground">
          SSL/TLS: SMTP na porcie 465. Gdy sieć blokuje 465 — port 587 ze STARTTLS. Login to pełny adres skrzynki
          (np. kontakt@twojadomena.pl), hasło — to ustawione przy skrzynce.
        </p>
      </div>
          <MailOchrona serviceId={serviceId} />
        </aside>
      </div>
    </HostingTabShell>
  );
}
