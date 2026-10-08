'use client';

import { useEffect, useMemo, useState, useId } from 'react';
import { Button } from '@verris/ui';
import { Select } from '@/components/panel';
import {
  createMigrationBundleAction,
  discoverMigrationSourceAction,
  preflightMigrationAction,
  type MigrationMysqlInput,
} from './actions';
import { bezpiecznaAkcja } from '@/lib/akcja';
import type { DiscoveredSite, DiscoveryResult, PreflightSummary } from './types';
import { Checkbox } from '@/components/panel/checkbox';
import { Stepper } from '@/components/panel/stepper';
import { plForm } from '@/lib/pl';

interface Props {
  serviceId: string;
  onQueued?: () => void;
  /** Co przenosimy — każdy zakres to osobny formularz (uwaga Dominika 02.10). Poczta: `MigracjaPoczty`. */
  zakres: Zakres;
}

export type Zakres = 'strona' | 'pliki' | 'baza' | 'wszystko';

interface DbRow extends MigrationMysqlInput {
  key: string;
  username: string;
  password: string;
  /** Wykryte bazy przychodzą odznaczone, gdy nie wiadomo, która należy do wybranej strony. */
  wlaczona: boolean;
  wykryta?: boolean;
}

interface SkrzynkaRow {
  key: string;
  /** Adres u nas = adres u starego dostawcy. */
  email: string;
  host: string;
  port: number;
  /** Login u starego dostawcy — puste = adres skrzynki. */
  login: string;
  password: string;
}

const RODZAJ_STRONY: Record<DiscoveredSite['kind'], string> = { main: 'strona główna', addon: 'strona dodatkowa', sub: 'poddomena' };

/** Katalog strony, gdy panel go nie podał — domyślne układy paneli. */
function katalogDomyslny(panel: string | undefined, domena: string, glowna: boolean): string {
  if (panel === 'cpanel') return glowna ? '/public_html' : '';
  if (panel === 'directadmin') return domena ? `/domains/${domena}/public_html` : '';
  if (panel === 'plesk') return glowna ? '/httpdocs' : '';
  return '';
}

/** Bazy do zaznaczenia przy stronie: Plesk wie, do której subskrypcji należy baza; gdzie indziej — tylko gdy jest jedna. */
function bazyDlaStrony(d: DiscoveryResult, strona: DiscoveredSite | undefined): (nazwa: string) => boolean {
  if (d.databases.length === 1) return () => true;
  if (strona?.konto && d.databases.some((b) => b.konto)) {
    const nalezace = d.databases.filter((b) => b.konto === strona.konto);
    return (nazwa) => nalezace.length === 1 ? nalezace[0]!.name === nazwa : nalezace.some((b) => b.name === nazwa);
  }
  return () => false;
}

const PROVIDER_PRESETS: Array<{
  id: string;
  label: string;
  panelType?: 'cpanel' | 'directadmin' | 'plesk';
  panelPort?: number;
  ftpProtocol: 'ftp' | 'ftps' | 'sftp';
  ftpPort: number;
}> = [
  { id: 'cpanel', label: 'cPanel (np. OVH, Zenbox)', panelType: 'cpanel', panelPort: 2083, ftpProtocol: 'ftp', ftpPort: 21 },
  { id: 'directadmin', label: 'DirectAdmin (cyberFolks, Seohost)', panelType: 'directadmin', panelPort: 2222, ftpProtocol: 'sftp', ftpPort: 22 },
  { id: 'plesk', label: 'Plesk', panelType: 'plesk', panelPort: 8443, ftpProtocol: 'ftp', ftpPort: 21 },
  { id: 'dhosting', label: 'dhosting', ftpProtocol: 'sftp', ftpPort: 22 },
  { id: 'home', label: 'home.pl', ftpProtocol: 'ftp', ftpPort: 21 },
  { id: 'hostinger', label: 'Hostinger', ftpProtocol: 'sftp', ftpPort: 65002 },
  { id: 'other', label: 'Inny dostawca', ftpProtocol: 'sftp', ftpPort: 22 },
];

const input = 'w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white';
const labelText = 'text-xs text-neutral-400';

const STEPS = ['Skąd migrujesz', 'Co przenosimy', 'Test dostępów', 'Start'] as const;

let rowSeq = 0;
const nextKey = () => `row_${Date.now()}_${rowSeq++}`;

export function MigrationWizard({ serviceId, onQueued, zakres }: Props) {
  const [step, setStep] = useState(0); // 0..3
  const [method, setMethod] = useState<'auto' | 'manual' | null>(null);
  const [presetId, setPresetId] = useState('directadmin');
  const preset = PROVIDER_PRESETS.find((p) => p.id === presetId) ?? PROVIDER_PRESETS[1];

  const [targetDomain, setTargetDomain] = useState('');
  const [sourceDomain, setSourceDomain] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);

  const includeFiles = zakres !== 'baza';
  const includeDbs = zakres !== 'pliki';
  const includeMail = zakres === 'wszystko';
  const [skrzynki, setSkrzynki] = useState<SkrzynkaRow[]>([]);
  const [zalozSkrzynki, setZalozSkrzynki] = useState(true);
  const [wybranaStrona, setWybranaStrona] = useState('');
  const [ftpProtocol, setFtpProtocol] = useState<'ftp' | 'ftps' | 'sftp'>('sftp');
  const [ftpHost, setFtpHost] = useState('');
  const [ftpPort, setFtpPort] = useState(22);
  const [ftpUser, setFtpUser] = useState('');
  const [ftpPass, setFtpPass] = useState('');
  // Puste = worker sam znajdzie katalog strony (public_html / domains/<d>/public_html / httpdocs).
  const [ftpPath, setFtpPath] = useState('');

  const [dbs, setDbs] = useState<DbRow[]>(() =>
    zakres === 'baza' ? [{ key: nextKey(), host: '', port: 3306, username: '', password: '', database: '', wlaczona: true }] : [],
  );

  const [panelHost, setPanelHost] = useState('');
  const [panelUser, setPanelUser] = useState('');
  const [panelPass, setPanelPass] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);

  const [preflight, setPreflight] = useState<PreflightSummary | null>(null);
  const [preflighting, setPreflighting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const hasAnySource = useMemo(
    () =>
      (includeFiles && ftpHost.trim().length > 0) ||
      (includeDbs && dbs.some((d) => d.wlaczona && d.database.trim())) ||
      (includeMail && skrzynki.some((m) => m.email.trim() && m.password)),
    [includeFiles, includeDbs, includeMail, ftpHost, dbs, skrzynki],
  );

  function buildInput() {
    return {
      serviceId,
      targetDomain: targetDomain.trim() || undefined,
      sourceDomain: sourceDomain.trim() || undefined,
      sourcePanelType: preset.panelType ?? 'manual',
      ftp:
        includeFiles && ftpHost.trim()
          ? {
              host: ftpHost.trim(),
              port: ftpPort,
              username: ftpUser,
              password: ftpPass,
              protocol: ftpProtocol,
              remotePath: ftpPath.trim() || '/',
            }
          : undefined,
      mysql: includeDbs
        ? dbs
            .filter((d) => d.wlaczona && d.database.trim())
            .map(({ key: _k, wlaczona: _w, wykryta: _wy, username, password, ...db }) => ({
              ...db,
              ...(username.trim() ? { username: username.trim() } : {}),
              ...(password ? { password } : {}),
            }))
        : [],
      imap: includeMail
        ? skrzynki
            .filter((m) => m.email.trim() && m.host.trim() && m.password)
            .map((m) => ({
              host: m.host.trim(),
              port: m.port,
              username: m.login.trim() || m.email.trim().toLowerCase(),
              password: m.password,
              email: m.email.trim().toLowerCase(),
            }))
        : [],
    };
  }

  /** Wybór strony z listy wykrytych: domena źródłowa, katalog plików, login FTP (Plesk) i bazy tej strony. */
  function wybierzStrone(domena: string, d: DiscoveryResult | null = discovery) {
    setWybranaStrona(domena);
    if (!d) return;
    const strona = (d.sites ?? []).find((x) => x.domain === domena);
    setSourceDomain(domena);
    setFtpPath(strona?.ftpPath ?? katalogDomyslny(d.panelType, domena, (strona?.kind ?? 'main') === 'main'));
    if (strona?.ftpUser) setFtpUser(strona.ftpUser);
    const zaznacz = bazyDlaStrony(d, strona);
    setDbs((rows) => rows.map((r) => (r.wykryta ? { ...r, wlaczona: zaznacz(r.database) } : r)));
  }

  async function runDiscovery() {
    setMsg(null);
    setDiscovering(true);
    const res = await bezpiecznaAkcja(() =>
      discoverMigrationSourceAction({
        serviceId,
        host: panelHost.trim(),
        port: preset.panelPort,
        username: panelUser,
        password: panelPass,
        panelType: preset.panelType,
      }),
    );
    setDiscovering(false);
    if ('error' in res) {
      setMsg({ type: 'err', text: `${res.error} — możesz też przejść dalej i wpisać dane ręcznie.` });
      return;
    }
    const d = res.result as DiscoveryResult;
    setDiscovery(d);
    // Panel podał dane FTP konta: FTP z szyfrowaniem (FTPS) na porcie z panelu — SSH na hostingu
    // współdzielonym bywa wyłączone, więc preset SFTP:22 zawodził. Hasło główne FTP to zwykle hasło panelu.
    if (d.ftpHint) {
      setFtpProtocol('ftps');
      setFtpPort(d.ftpHint.port);
    } else {
      setFtpProtocol(preset.ftpProtocol);
      setFtpPort(preset.ftpPort);
    }
    setFtpHost(d.ftpHint?.host ?? panelHost.trim());
    setFtpUser(d.ftpHint?.username ?? panelUser);
    setFtpPass(panelPass);
    if (includeDbs) setDbs(
      d.databases.map((db) => ({
        key: nextKey(),
        host: panelHost.trim(),
        port: 3306,
        username: '',
        password: '',
        database: db.name,
        wlaczona: false,
        wykryta: true,
      })),
    );
    if (includeMail) setSkrzynki(
      d.mailboxes.map((m) => ({ key: nextKey(), email: m.email, host: panelHost.trim(), port: 993, login: '', password: '' })),
    );
    // Katalog strony, nie katalog domowy konta (tam są poczta i hasła skrzynek). Strona główna na start —
    // przy kilku stronach klient wybiera z listy w następnym kroku (uwaga Dominika 08.10).
    const sites = d.sites ?? [];
    const start = sites.find((x) => x.kind === 'main')?.domain ?? sites[0]?.domain ?? d.primaryDomain ?? '';
    if (start) wybierzStrone(start, d);
    else setFtpPath(katalogDomyslny(preset.panelType, d.primaryDomain ?? '', true));
    setStep(1);
  }

  // Test dostępów rusza sam po wejściu w krok — klient nie musi wiedzieć, że trzeba go kliknąć.
  useEffect(() => {
    if (step === 2 && !preflight && !preflighting) void runPreflight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  // Złe hasło = STOP przed startem: inaczej klient dowiaduje się o literówce z maila po godzinie.
  const zleHaslo = preflight?.checks.some((c) => c.status === 'auth_failed') ?? false;
  // Host odrzucony przed połączeniem (sieć prywatna, serwer Verris) — tego nie dokończy też obsługa.
  const hostZablokowany = preflight?.checks.some((c) => c.status === 'blocked') ?? false;
  // Sama baza bez plików: zapasowej drogi (mysqldump przez SSH konta plikowego) nie ma — bez zdalnego dostępu
  // migracja by padła po starcie, więc zatrzymujemy tutaj.
  const bazaNiedostepna =
    zakres === 'baza' && (preflight?.checks.some((c) => c.kind === 'mysql' && c.status === 'unreachable') ?? false);

  async function runPreflight() {
    setMsg(null);
    setPreflighting(true);
    const res = await bezpiecznaAkcja(() => preflightMigrationAction(buildInput()));
    setPreflighting(false);
    if ('error' in res) {
      setMsg({ type: 'err', text: res.error });
      return;
    }
    setPreflight(res.result as PreflightSummary);
  }

  async function submit() {
    setMsg(null);
    if (!hasAnySource) {
      setMsg({ type: 'err', text: zakres === 'baza' ? 'Wpisz nazwę bazy.' : zakres === 'wszystko' ? 'Wpisz dane plików, bazy albo skrzynki.' : 'Wpisz adres serwera z plikami.' });
      return;
    }
    if (!consent) {
      setMsg({ type: 'err', text: 'Zaznacz zgodę na przeniesienie danych, aby uruchomić migrację.' });
      return;
    }
    setBusy(true);
    const res = await bezpiecznaAkcja(() =>
      createMigrationBundleAction({
        ...buildInput(),
        notes: notes.trim() || undefined,
        consentAccepted: true,
        utworzBrakujaceSkrzynki: includeMail && zalozSkrzynki ? true : undefined,
      }),
    );
    setBusy(false);
    if ('error' in res) {
      setMsg({ type: 'err', text: res.error });
      return;
    }
    setMsg({ type: 'ok', text: 'Migracja została uruchomiona. Poniżej zobaczysz postęp na żywo.' });
    setFtpPass('');
    setDbs((rows) => rows.map((r) => ({ ...r, password: '' })));
    setSkrzynki((rows) => rows.map((r) => ({ ...r, password: '' })));
    onQueued?.();
  }

  return (
    <div className="space-y-5">
      <Stepper kroki={STEPS} aktualny={step} />

      {step === 0 ? (
        <StepMethod
          zakres={zakres}
          method={method}
          setMethod={setMethod}
          presetId={presetId}
          setPresetId={setPresetId}
          preset={preset}
          panelHost={panelHost}
          setPanelHost={setPanelHost}
          panelUser={panelUser}
          setPanelUser={setPanelUser}
          panelPass={panelPass}
          setPanelPass={setPanelPass}
          discovering={discovering}
          onDiscover={runDiscovery}
          onManual={() => {
            setFtpProtocol(preset.ftpProtocol);
            setFtpPort(preset.ftpPort);
            setStep(1);
          }}
          msg={msg}
        />
      ) : null}

      {step === 1 ? (
        <StepSources
          discovery={discovery}
          presetId={presetId}
          setPresetId={(id) => {
            setPresetId(id);
            const p = PROVIDER_PRESETS.find((x) => x.id === id);
            if (p) {
              setFtpProtocol(p.ftpProtocol);
              setFtpPort(p.ftpPort);
            }
          }}
          targetDomain={targetDomain}
          setTargetDomain={setTargetDomain}
          sourceDomain={sourceDomain}
          setSourceDomain={setSourceDomain}
          zakres={zakres}
          ftpProtocol={ftpProtocol}
          setFtpProtocol={setFtpProtocol}
          ftpHost={ftpHost}
          setFtpHost={setFtpHost}
          ftpPort={ftpPort}
          setFtpPort={setFtpPort}
          ftpUser={ftpUser}
          setFtpUser={setFtpUser}
          ftpPass={ftpPass}
          setFtpPass={setFtpPass}
          ftpPath={ftpPath}
          setFtpPath={setFtpPath}
          dbs={dbs}
          setDbs={setDbs}
          wybranaStrona={wybranaStrona}
          onWybierzStrone={(d) => wybierzStrone(d)}
          skrzynki={skrzynki}
          setSkrzynki={setSkrzynki}
          zalozSkrzynki={zalozSkrzynki}
          setZalozSkrzynki={setZalozSkrzynki}
          panelHost={panelHost}
        />
      ) : null}

      {step === 2 ? (
        <StepPreflight zakres={zakres} preflight={preflight} preflighting={preflighting} onRun={runPreflight} />
      ) : null}

      {step === 3 ? (
        <StepStart
          zakres={zakres}
          ftpHost={ftpHost}
          dbs={dbs}
          skrzynki={skrzynki}
          zalozSkrzynki={zalozSkrzynki}
          targetDomain={targetDomain}
          notes={notes}
          setNotes={setNotes}
          consent={consent}
          setConsent={setConsent}
        />
      ) : null}

      {msg && step !== 0 ? (
        <p className={msg.type === 'ok' ? 'text-sm text-emerald-300' : 'text-sm text-rose-300'}>{msg.text}</p>
      ) : null}

      {/* Nawigacja */}
      <div className="flex items-center justify-between border-t border-white/10 pt-4">
        <div>
          {step > 0 ? (
            <Button
              type="button"
              onClick={() => {
                setMsg(null); // błąd z kroku, z którego wychodzimy, nie dotyczy poprzedniego
                setStep((s) => s - 1);
              }}
              className="bg-white/10 hover:bg-white/20 text-white"
            >
              ← Wstecz
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          {step === 1 ? (
            <Button
              type="button"
              disabled={!hasAnySource}
              onClick={() => {
                setPreflight(null);
                setStep(2);
              }}
              className="bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40"
            >
              Dalej: test dostępów →
            </Button>
          ) : null}
          {step === 2 ? (
            <>
              <Button type="button" disabled={preflighting} onClick={runPreflight} className="bg-white/10 hover:bg-white/20 text-white">
                {preflighting ? 'Testuję…' : preflight ? 'Testuj ponownie' : 'Uruchom test'}
              </Button>
              <Button
                type="button"
                disabled={preflighting || !preflight || zleHaslo || hostZablokowany || bazaNiedostepna}
                onClick={() => setStep(3)}
                className="bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40"
              >
                Dalej: podsumowanie →
              </Button>
            </>
          ) : null}
          {step === 3 ? (
            <Button
              type="button"
              disabled={busy || !hasAnySource || !consent}
              onClick={submit}
              className="bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40"
            >
              {busy ? 'Uruchamiam…' : 'Uruchom migrację'}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// --- kroki ------------------------------------------------------------------

const OPIS_ZAKRESU: Record<Zakres, string> = {
  strona: 'Przeniesiemy całą stronę: pliki i bazy danych (WordPress, sklep).',
  pliki: 'Przeniesiemy same pliki z serwera FTP/SFTP starego hostingu.',
  baza: 'Przeniesiemy bazę danych MySQL ze starego hostingu.',
  wszystko: 'Przeniesiemy wszystko naraz: pliki strony, bazy danych i skrzynki pocztowe — brakujące skrzynki założymy u nas.',
};

function StepMethod(props: {
  zakres: Zakres;
  method: 'auto' | 'manual' | null;
  setMethod: (m: 'auto' | 'manual' | null) => void;
  presetId: string;
  setPresetId: (id: string) => void;
  preset: (typeof PROVIDER_PRESETS)[number];
  panelHost: string;
  setPanelHost: (v: string) => void;
  panelUser: string;
  setPanelUser: (v: string) => void;
  panelPass: string;
  setPanelPass: (v: string) => void;
  discovering: boolean;
  onDiscover: () => void;
  onManual: () => void;
  msg: { type: 'ok' | 'err'; text: string } | null;
}) {
  const fieldId = useId();
  const { method, setMethod, preset } = props;
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-300">
        {OPIS_ZAKRESU[props.zakres]} Wybierz, jak chcesz zacząć:
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setMethod('auto')}
          className={`rounded-2xl border p-4 text-left transition ${method === 'auto' ? 'border-cyan-400/60 bg-cyan-500/[0.08]' : 'border-cyan-500/25 bg-cyan-500/[0.04] hover:border-cyan-400/50'}`}
        >
          <p className="font-semibold text-white">Automatycznie (zalecane)</p>
          <p className="mt-1 text-xs text-neutral-400">Podaj login do panelu starego hostingu — sami wykryjemy dane serwera i bazy.</p>
        </button>
        <button
          type="button"
          onClick={() => setMethod('manual')}
          className={`rounded-2xl border p-4 text-left transition ${method === 'manual' ? 'border-white/40 bg-white/[0.05]' : 'border-white/10 bg-white/[0.02] hover:border-white/30'}`}
        >
          <p className="font-semibold text-white">Ręcznie</p>
          <p className="mt-1 text-xs text-neutral-400">Wpiszesz dane dostępowe samodzielnie.</p>
        </button>
      </div>

      {method === 'auto' ? (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label htmlFor={`${fieldId}-panel`} className="space-y-1.5 block">
              <span className={labelText}>Panel starego hostingu</span>
              <Select
                id={`${fieldId}-panel`}
                value={props.presetId}
                onChange={props.setPresetId}
                aria-label="Panel starego hostingu"
                options={PROVIDER_PRESETS.filter((p) => p.panelType).map((p) => ({ value: p.id, label: p.label }))}
              />
            </label>
            <label className="space-y-1.5 block">
              <span className={labelText}>Adres panelu / serwera</span>
              <input value={props.panelHost} onChange={(e) => props.setPanelHost(e.target.value)} className={input} placeholder="np. serwer123.hosting.pl" />
            </label>
            <label className="space-y-1.5 block">
              <span className={labelText}>Login do panelu</span>
              <input value={props.panelUser} onChange={(e) => props.setPanelUser(e.target.value)} className={input} autoComplete="off" />
            </label>
            <label className="space-y-1.5 block">
              <span className={labelText}>Hasło do panelu</span>
              <input type="password" value={props.panelPass} onChange={(e) => props.setPanelPass(e.target.value)} className={input} autoComplete="new-password" />
            </label>
          </div>
          <p className="text-xs text-neutral-500">
            Łączymy się tylko po to, by odczytać listę domen i baz. Hasła nie są zapisywane.
          </p>
          {props.msg ? <p className={props.msg.type === 'ok' ? 'text-sm text-emerald-300' : 'text-sm text-rose-300'}>{props.msg.text}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={props.discovering || !props.panelHost.trim() || !props.panelUser || !props.panelPass}
              onClick={props.onDiscover}
              className="bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-40"
            >
              {props.discovering ? 'Wykrywam…' : 'Wykryj zawartość i przejdź dalej'}
            </Button>
            <Button type="button" onClick={props.onManual} className="bg-white/10 hover:bg-white/20 text-white">
              Wpiszę dane ręcznie
            </Button>
          </div>
        </div>
      ) : null}

      {method === 'manual' ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <label htmlFor={`${fieldId}-provider`} className="space-y-1.5 block">
            <span className={labelText}>Dostawca (ustawi domyślny protokół/port)</span>
            <Select
              id={`${fieldId}-provider`}
              value={props.presetId}
              onChange={props.setPresetId}
              aria-label="Dostawca"
              options={PROVIDER_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
            />
          </label>
          <div className="mt-3">
            <Button type="button" onClick={props.onManual} className="bg-cyan-600 hover:bg-cyan-500 text-white">
              Dalej: co przenosimy →
            </Button>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-neutral-500">
        Wybrany dostawca: <span className="text-neutral-300">{preset.label}</span>. Migracja jest w pełni
        automatyczna; gdyby coś się zablokowało, przejmie ją nasz zespół.
      </p>
    </div>
  );
}

function StepSources(props: {
  zakres: Zakres;
  discovery: DiscoveryResult | null;
  presetId: string;
  setPresetId: (id: string) => void;
  targetDomain: string;
  setTargetDomain: (v: string) => void;
  sourceDomain: string;
  setSourceDomain: (v: string) => void;
  ftpProtocol: 'ftp' | 'ftps' | 'sftp';
  setFtpProtocol: (v: 'ftp' | 'ftps' | 'sftp') => void;
  ftpHost: string;
  setFtpHost: (v: string) => void;
  ftpPort: number;
  setFtpPort: (v: number) => void;
  ftpUser: string;
  setFtpUser: (v: string) => void;
  ftpPass: string;
  setFtpPass: (v: string) => void;
  ftpPath: string;
  setFtpPath: (v: string) => void;
  dbs: DbRow[];
  setDbs: React.Dispatch<React.SetStateAction<DbRow[]>>;
  wybranaStrona: string;
  onWybierzStrone: (domena: string) => void;
  skrzynki: SkrzynkaRow[];
  setSkrzynki: React.Dispatch<React.SetStateAction<SkrzynkaRow[]>>;
  zalozSkrzynki: boolean;
  setZalozSkrzynki: (v: boolean) => void;
  panelHost: string;
}) {
  const protocolId = useId();
  const stronaId = useId();
  const { discovery } = props;
  const includeFiles = props.zakres !== 'baza';
  const sites = discovery?.sites ?? [];
  const wybrana = sites.find((x) => x.domain === props.wybranaStrona);
  return (
    <div className="space-y-5">
      {discovery ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-xs text-emerald-100/90">
          <p className="font-semibold text-emerald-200">
            Wykryto: {discovery.domains.length} {plForm(discovery.domains.length, 'domena', 'domeny', 'domen')}, {discovery.databases.length} {plForm(discovery.databases.length, 'baza', 'bazy', 'baz')} ({discovery.panelType}).
          </p>
          {props.zakres === 'strona' || props.zakres === 'wszystko' ? (
            <p className="mt-1 text-emerald-100/70">Strona na WordPressie? Login i hasło bazy zostaw puste, odczytamy je sami.</p>
          ) : null}
          {discovery.warnings.map((w) => (
            <p key={w} className="mt-1 text-amber-200/80">⚠ {w}</p>
          ))}
        </div>
      ) : null}

      {includeFiles && sites.length > 1 ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
          <label htmlFor={stronaId} className="space-y-1.5 block">
            <span className="text-sm font-semibold text-white">Którą stronę przenosimy?</span>
            <Select
              id={stronaId}
              value={props.wybranaStrona}
              onChange={props.onWybierzStrone}
              aria-label="Strona do przeniesienia"
              options={sites.map((x) => ({
                value: x.domain,
                label: `${x.domain} — ${RODZAJ_STRONY[x.kind]}${x.konto && x.konto !== x.domain ? ` (konto ${x.konto})` : ''}`,
              }))}
            />
          </label>
          <p className="text-xs text-neutral-500">
            Na starym hostingu {plForm(sites.length, 'jest', 'są', 'jest')} {sites.length} {plForm(sites.length, 'strona', 'strony', 'stron')}.
            Przeniesiemy tylko wybraną —{' '}
            {wybrana?.ftpPath ? <>pliki z katalogu <span className="text-neutral-300">{wybrana.ftpPath}</span></> : 'katalog znajdziemy sami'}
            {discovery?.databases.length ? ', zaznacz poniżej jej bazy.' : '.'} Kolejną stronę przeniesiesz osobną migracją.
          </p>
        </section>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5 block">
          <span className={labelText}>Domena docelowa (u nas)</span>
          <input value={props.targetDomain} onChange={(e) => props.setTargetDomain(e.target.value)} className={input} placeholder="twojadomena.pl" />
        </label>
        {props.zakres === 'strona' || props.zakres === 'wszystko' ? (
          <label className="space-y-1.5 block">
            <span className={labelText}>Domena na starym hostingu (dla podmiany URL w WordPress)</span>
            <input value={props.sourceDomain} onChange={(e) => props.setSourceDomain(e.target.value)} className={input} placeholder="np. stara-domena.pl (jeśli inna)" />
          </label>
        ) : null}
      </div>

      {includeFiles ? (
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <p className="text-sm font-semibold text-white">Pliki strony (FTP/SFTP)</p>
        <div className="grid gap-3 md:grid-cols-2">
            <label htmlFor={protocolId} className="space-y-1.5 block">
              <span className={labelText}>Protokół</span>
              <Select
                id={protocolId}
                value={props.ftpProtocol}
                onChange={(v) => props.setFtpProtocol(v as 'ftp' | 'ftps' | 'sftp')}
                aria-label="Protokół plików"
                options={[
                  { value: 'sftp', label: 'SFTP' },
                  { value: 'ftps', label: 'FTPS' },
                  { value: 'ftp', label: 'FTP' },
                ]}
              />
            </label>
            <label className="space-y-1.5 block">
              <span className={labelText}>Host</span>
              <input value={props.ftpHost} onChange={(e) => props.setFtpHost(e.target.value)} className={input} />
            </label>
            <label className="space-y-1.5 block">
              <span className={labelText}>Port</span>
              <input type="number" min={1} max={65535} value={props.ftpPort} onChange={(e) => props.setFtpPort(Number(e.target.value))} className={input} />
            </label>
            <label className="space-y-1.5 block">
              <span className={labelText}>Użytkownik</span>
              <input value={props.ftpUser} onChange={(e) => props.setFtpUser(e.target.value)} className={input} autoComplete="off" />
            </label>
            <label className="space-y-1.5 block">
              <span className={labelText}>Hasło</span>
              <input type="password" value={props.ftpPass} onChange={(e) => props.setFtpPass(e.target.value)} className={input} autoComplete="new-password" />
              <span className="block text-[11px] text-neutral-500">Zwykle to samo hasło co do panelu starego hostingu.</span>
            </label>
            <label className="space-y-1.5 block">
              <span className={labelText}>Ścieżka na serwerze</span>
              <input value={props.ftpPath} onChange={(e) => props.setFtpPath(e.target.value)} className={input} placeholder="zostaw puste — sami znajdziemy katalog strony" />
            </label>
          </div>
      </section>
      ) : null}

      {props.zakres !== 'pliki' ? (
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">
            Bazy danych MySQL ({props.dbs.filter((d) => d.wlaczona).length}
            {props.dbs.some((d) => !d.wlaczona) ? ` z ${props.dbs.length}` : ''})
          </p>
          <Button
            type="button"
            onClick={() => props.setDbs((r) => [...r, { key: nextKey(), host: props.ftpHost || '', port: 3306, username: '', password: '', database: '', wlaczona: true }])}
            className="bg-white/10 hover:bg-white/20 text-white text-xs"
          >
            + dodaj bazę
          </Button>
        </div>
        {props.dbs.map((row, i) => (
          <div key={row.key} className={`grid gap-2 md:grid-cols-6 rounded-xl border border-white/5 p-2 ${row.wlaczona ? '' : 'opacity-60'}`}>
            {row.wykryta ? (
              <label className="flex items-center gap-2 text-xs text-neutral-300 md:col-span-6">
                <Checkbox
                  checked={row.wlaczona}
                  onChange={(e) => patch(props.setDbs, i, { wlaczona: e.target.checked })}
                  aria-label={`Przenieś bazę ${row.database}`}
                  className="h-4 w-4 accent-cyan-500"
                />
                Przenieś bazę <span className="text-white">{row.database}</span>
              </label>
            ) : null}
            <input className={`${input} md:col-span-2`} aria-label="Serwer bazy" placeholder="serwer bazy" value={row.host} onChange={(e) => patch(props.setDbs, i, { host: e.target.value })} />
            <input className={input} type="number" aria-label="Port bazy" placeholder="port" value={row.port} onChange={(e) => patch(props.setDbs, i, { port: Number(e.target.value) })} />
            <input className={input} aria-label="Nazwa bazy" placeholder="nazwa bazy" value={row.database} onChange={(e) => patch(props.setDbs, i, { database: e.target.value })} />
            <input className={input} aria-label="Użytkownik bazy" placeholder={includeFiles ? 'użytkownik (WP: puste)' : 'użytkownik'} autoComplete="off" value={row.username} onChange={(e) => patch(props.setDbs, i, { username: e.target.value })} />
            <div className="flex gap-1">
              <input className={input} type="password" aria-label="Hasło bazy" placeholder={includeFiles ? 'hasło (WP: puste)' : 'hasło'} autoComplete="new-password" value={row.password} onChange={(e) => patch(props.setDbs, i, { password: e.target.value })} />
              <button type="button" onClick={() => props.setDbs((r) => r.filter((_, j) => j !== i))} className="px-2 text-rose-300 hover:text-rose-200" aria-label="Usuń bazę">×</button>
            </div>
          </div>
        ))}
        {props.dbs.some((d) => d.wykryta) && !props.dbs.some((d) => d.wlaczona) ? (
          <p className="text-xs text-amber-200/80">
            Zaznacz bazę wybranej strony — przy WordPressie jej nazwę znajdziesz w pliku wp-config.php (DB_NAME).
          </p>
        ) : null}
        {props.dbs.length === 0 ? (
          <p className="text-xs text-neutral-500">Brak baz. Dodaj, jeśli Twoja strona ich używa (np. WordPress, sklep).</p>
        ) : includeFiles ? (
          <p className="text-xs text-neutral-500">
            Nie znasz loginu i hasła bazy? Przy WordPressie zostaw je puste — odczytamy je z pliku wp-config.php po
            skopiowaniu plików strony.
          </p>
        ) : null}
      </section>
      ) : null}

      {props.zakres === 'wszystko' ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Skrzynki pocztowe ({props.skrzynki.length})</p>
            <Button
              type="button"
              onClick={() =>
                props.setSkrzynki((r) => [...r, { key: nextKey(), email: '', host: props.panelHost.trim() || props.ftpHost.trim(), port: 993, login: '', password: '' }])
              }
              className="bg-white/10 hover:bg-white/20 text-white text-xs"
            >
              + dodaj skrzynkę
            </Button>
          </div>
          {props.skrzynki.map((row, i) => (
            <div key={row.key} className="grid gap-2 md:grid-cols-6 rounded-xl border border-white/5 p-2">
              <input className={`${input} md:col-span-2`} aria-label="Adres skrzynki" placeholder="adres, np. biuro@firma.pl" value={row.email} onChange={(e) => patch(props.setSkrzynki, i, { email: e.target.value })} />
              <input className={input} aria-label="Serwer poczty (IMAP)" placeholder="serwer IMAP" value={row.host} onChange={(e) => patch(props.setSkrzynki, i, { host: e.target.value })} />
              <input className={input} type="number" aria-label="Port IMAP" value={row.port} onChange={(e) => patch(props.setSkrzynki, i, { port: Number(e.target.value) })} />
              <input className={input} aria-label="Login skrzynki" placeholder="login (puste = adres)" autoComplete="off" value={row.login} onChange={(e) => patch(props.setSkrzynki, i, { login: e.target.value })} />
              <div className="flex gap-1">
                <input className={input} type="password" aria-label="Hasło skrzynki" placeholder="hasło" autoComplete="new-password" value={row.password} onChange={(e) => patch(props.setSkrzynki, i, { password: e.target.value })} />
                <button type="button" onClick={() => props.setSkrzynki((r) => r.filter((_, j) => j !== i))} className="px-2 text-rose-300 hover:text-rose-200" aria-label="Usuń skrzynkę">×</button>
              </div>
            </div>
          ))}
          {props.skrzynki.length === 0 ? (
            <p className="text-xs text-neutral-500">Brak skrzynek. Dodaj te, które chcesz przenieść — podaj adres i hasło u obecnego dostawcy.</p>
          ) : (
            <p className="text-xs text-neutral-500">Skrzynki bez hasła pominiemy. Port 993 to standard (IMAP z szyfrowaniem).</p>
          )}
          <label className="flex items-start gap-2.5 text-xs text-neutral-300">
            <Checkbox
              checked={props.zalozSkrzynki}
              onChange={(e) => props.setZalozSkrzynki(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-500"
            />
            <span>
              Załóż u nas skrzynki, których jeszcze nie ma — z tym samym hasłem co u obecnego dostawcy. Adres musi być
              na domenie tej usługi.
            </span>
          </label>
        </section>
      ) : null}
    </div>
  );
}

function StepPreflight({
  zakres,
  preflight,
  preflighting,
  onRun,
}: {
  zakres: Zakres;
  preflight: PreflightSummary | null;
  preflighting: boolean;
  onRun: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-300">
        Zanim uruchomimy migrację, sprawdźmy, czy podane dane dostępowe działają. To zajmuje kilka sekund
        i pozwala od razu poprawić literówki.
      </p>
      {!preflight ? (
        <Button type="button" disabled={preflighting} onClick={onRun} className="bg-cyan-600 hover:bg-cyan-500 text-white">
          {preflighting ? 'Sprawdzam dostępy…' : 'Sprawdź dostępy'}
        </Button>
      ) : (
        <div className={`rounded-xl border px-3 py-2.5 text-xs ${preflight.ok ? 'border-emerald-500/25 bg-emerald-500/[0.06]' : 'border-amber-500/25 bg-amber-500/[0.06]'}`}>
          <p className="font-semibold text-white">
            {preflight.ok
              ? 'Wszystko wygląda dobrze ✓'
              : preflight.checks.some((c) => c.status === 'blocked')
                ? 'Tego adresu nie można użyć jako źródła migracji — wróć krok wstecz i podaj adres serwera starego hostingu'
                : preflight.checks.some((c) => c.status === 'auth_failed')
                ? 'Serwer odrzucił login lub hasło — wróć krok wstecz, popraw dane oznaczone czerwoną kropką i sprawdź ponownie'
                : 'Część źródeł wymaga uwagi — możesz kontynuować, resztę dokończymy po naszej stronie'}
          </p>
          <ul className="mt-1.5 space-y-1">
            {preflight.checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={preflightDot(c.status)}>●</span>
                <span className="text-neutral-300">
                  <strong>{c.target}</strong> — {c.message}
                </span>
              </li>
            ))}
          </ul>
          {preflight.checks.some((c) => c.kind === 'mysql' && c.status === 'unreachable') ? (
            zakres === 'baza' ? (
              <p className="mt-2 text-amber-200/90">
                Stary hosting nie wpuszcza połączeń do bazy z zewnątrz. Włącz u niego zdalny dostęp do MySQL albo wybierz
                „Cała strona” — wtedy bazę pobierzemy razem z plikami.
              </p>
            ) : (
            <p className="mt-2 text-neutral-500">
              Brak zdalnego dostępu do bazy to normalne na hostingach współdzielonych — bazę pobierzemy inną drogą
              (przez SSH albo jednorazowo przez stronę). Możesz spokojnie przejść dalej.
            </p>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}

function StepStart(props: {
  zakres: Zakres;
  ftpHost: string;
  dbs: DbRow[];
  skrzynki: SkrzynkaRow[];
  zalozSkrzynki: boolean;
  targetDomain: string;
  notes: string;
  setNotes: (v: string) => void;
  consent: boolean;
  setConsent: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-300">Sprawdź, co przenosimy, i uruchom migrację:</p>
      <ul className="space-y-1.5 text-sm">
        {props.zakres !== 'baza' ? (
          <li className="flex items-center gap-2">
            <span className={props.ftpHost.trim() ? 'text-emerald-400' : 'text-neutral-600'}>●</span>
            <span className="text-neutral-200">Pliki strony {props.ftpHost.trim() ? `(${props.ftpHost.trim()})` : '— pominięte'}</span>
          </li>
        ) : null}
        {props.zakres !== 'pliki' ? (
          <li className="flex items-center gap-2">
            <span className={props.dbs.some((d) => d.wlaczona) ? 'text-emerald-400' : 'text-neutral-600'}>●</span>
            <span className="text-neutral-200">Bazy danych: {props.dbs.filter((d) => d.wlaczona && d.database.trim()).length}</span>
          </li>
        ) : null}
        {props.zakres === 'wszystko' ? (
          <li className="flex items-center gap-2">
            <span className={props.skrzynki.some((m) => m.email.trim() && m.password) ? 'text-emerald-400' : 'text-neutral-600'}>●</span>
            <span className="text-neutral-200">
              Skrzynki: {props.skrzynki.filter((m) => m.email.trim() && m.password).length}
              {props.zalozSkrzynki ? ' (brakujące założymy)' : ''}
            </span>
          </li>
        ) : null}
        <li className="flex items-center gap-2">
          <span className={props.targetDomain.trim() ? 'text-emerald-400' : 'text-amber-400'}>●</span>
          <span className="text-neutral-200">Domena docelowa: {props.targetDomain.trim() || 'domena konta (domyślna)'}</span>
        </li>
      </ul>
      <label className="space-y-1.5 block">
        <span className={labelText}>Notatki dla nas (opcjonalnie)</span>
        <textarea value={props.notes} onChange={(e) => props.setNotes(e.target.value)} className={`${input} min-h-[64px]`} />
      </label>
      <p className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.05] px-3 py-2 text-xs text-cyan-100/90">
        Hasła szyfrujemy, używamy tylko na czas transferu i kasujemy po zakończeniu. Twoja obecna
        strona działa bez przerwy aż do przełączenia DNS — ten krok wykonasz sam(a) na końcu.
      </p>

      {/* Zgoda / upoważnienie (RODO) — wymagane do startu. */}
      <label className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs leading-relaxed text-neutral-300">
        <Checkbox
          checked={props.consent}
          onChange={(e) => props.setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-500"
        />
        <span>
          Oświadczam, że mam prawo przenieść wskazane dane i <strong>upoważniam Verris</strong> do
          jednorazowego dostępu do wskazanego hostingu źródłowego w celu wykonania migracji. Rozumiem,
          że dane dostępowe są szyfrowane i usuwane po zakończeniu. Akceptuję{' '}
          <a href="/legal/dpa" target="_blank" className="text-cyan-300 underline">Umowę powierzenia (DPA)</a>,{' '}
          <a href="/legal/privacy" target="_blank" className="text-cyan-300 underline">Politykę prywatności</a>{' '}
          i <a href="/legal/terms" target="_blank" className="text-cyan-300 underline">Regulamin</a>.
        </span>
      </label>
    </div>
  );
}

// --- helpers ----------------------------------------------------------------

function patch<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, index: number, fields: Partial<T>) {
  setter((rows) => rows.map((r, i) => (i === index ? { ...r, ...fields } : r)));
}

function preflightDot(status: string): string {
  if (status === 'ok') return 'text-emerald-400';
  if (status === 'reachable') return 'text-cyan-400';
  if (status === 'auth_failed' || status === 'blocked') return 'text-rose-400';
  return 'text-amber-400';
}
