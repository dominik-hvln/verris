'use client';

import { useMemo, useState } from 'react';
import { Button } from '@verris/ui';
import { Select } from '@/components/panel';
import {
  createMigrationBundleAction,
  discoverMigrationSourceAction,
  preflightMigrationAction,
  type MigrationImapInput,
  type MigrationMysqlInput,
} from './actions';
import type { DiscoveryResult, PreflightSummary } from './types';

interface Props {
  serviceId: string;
  onQueued?: () => void;
}

interface DbRow extends MigrationMysqlInput {
  key: string;
}
interface BoxRow extends MigrationImapInput {
  key: string;
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

export function MigrationWizard({ serviceId, onQueued }: Props) {
  const [step, setStep] = useState(0); // 0..3
  const [method, setMethod] = useState<'auto' | 'manual' | null>(null);
  const [presetId, setPresetId] = useState('directadmin');
  const preset = PROVIDER_PRESETS.find((p) => p.id === presetId) ?? PROVIDER_PRESETS[1];

  const [targetDomain, setTargetDomain] = useState('');
  const [sourceDomain, setSourceDomain] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);

  const [includeFiles, setIncludeFiles] = useState(true);
  const [ftpProtocol, setFtpProtocol] = useState<'ftp' | 'ftps' | 'sftp'>('sftp');
  const [ftpHost, setFtpHost] = useState('');
  const [ftpPort, setFtpPort] = useState(22);
  const [ftpUser, setFtpUser] = useState('');
  const [ftpPass, setFtpPass] = useState('');
  const [ftpPath, setFtpPath] = useState('/');

  const [dbs, setDbs] = useState<DbRow[]>([]);
  const [boxes, setBoxes] = useState<BoxRow[]>([]);

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
    () => (includeFiles && ftpHost.trim().length > 0) || dbs.length > 0 || boxes.length > 0,
    [includeFiles, ftpHost, dbs.length, boxes.length],
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
      mysql: dbs.map(({ key: _key, ...rest }) => rest),
      imap: boxes.map(({ key: _key, ...rest }) => rest),
    };
  }

  async function runDiscovery() {
    setMsg(null);
    setDiscovering(true);
    const res = await discoverMigrationSourceAction({
      serviceId,
      host: panelHost.trim(),
      port: preset.panelPort,
      username: panelUser,
      password: panelPass,
      panelType: preset.panelType,
    });
    setDiscovering(false);
    if ('error' in res) {
      setMsg({ type: 'err', text: `${res.error} — możesz też przejść dalej i wpisać dane ręcznie.` });
      return;
    }
    const d = res.result as DiscoveryResult;
    setDiscovery(d);
    setIncludeFiles(true);
    setFtpProtocol(preset.ftpProtocol);
    setFtpPort(preset.ftpPort);
    setFtpHost(d.ftpHint?.host ?? panelHost.trim());
    setFtpUser(d.ftpHint?.username ?? panelUser);
    if (d.primaryDomain && !sourceDomain) setSourceDomain(d.primaryDomain);
    setDbs(
      d.databases.map((db) => ({
        key: nextKey(),
        host: panelHost.trim(),
        port: 3306,
        username: '',
        password: '',
        database: db.name,
      })),
    );
    setBoxes(
      d.mailboxes.map((box) => ({
        key: nextKey(),
        host: panelHost.trim(),
        port: 993,
        username: box.email,
        password: '',
        email: box.email,
      })),
    );
    setStep(1);
  }

  async function runPreflight() {
    setMsg(null);
    setPreflighting(true);
    const res = await preflightMigrationAction(buildInput());
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
      setMsg({ type: 'err', text: 'Wskaż co najmniej jedno źródło: pliki, bazę lub skrzynkę.' });
      return;
    }
    if (!consent) {
      setMsg({ type: 'err', text: 'Zaznacz zgodę na przeniesienie danych, aby uruchomić migrację.' });
      return;
    }
    setBusy(true);
    const res = await createMigrationBundleAction({
      ...buildInput(),
      notes: notes.trim() || undefined,
      consentAccepted: true,
    });
    setBusy(false);
    if ('error' in res) {
      setMsg({ type: 'err', text: res.error });
      return;
    }
    setMsg({ type: 'ok', text: 'Migracja została uruchomiona. Poniżej zobaczysz postęp na żywo.' });
    setFtpPass('');
    setDbs((rows) => rows.map((r) => ({ ...r, password: '' })));
    setBoxes((rows) => rows.map((r) => ({ ...r, password: '' })));
    onQueued?.();
  }

  return (
    <div className="space-y-5">
      <StepIndicator step={step} />

      {step === 0 ? (
        <StepMethod
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
          includeFiles={includeFiles}
          setIncludeFiles={setIncludeFiles}
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
          boxes={boxes}
          setBoxes={setBoxes}
        />
      ) : null}

      {step === 2 ? (
        <StepPreflight preflight={preflight} preflighting={preflighting} onRun={runPreflight} />
      ) : null}

      {step === 3 ? (
        <StepStart
          includeFiles={includeFiles}
          ftpHost={ftpHost}
          dbs={dbs}
          boxes={boxes}
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
            <Button type="button" onClick={() => setStep((s) => s - 1)} className="bg-white/10 hover:bg-white/20 text-white">
              ← Wstecz
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          {step === 1 ? (
            <Button
              type="button"
              disabled={!hasAnySource}
              onClick={() => setStep(2)}
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
              <Button type="button" onClick={() => setStep(3)} className="bg-cyan-600 hover:bg-cyan-500 text-white">
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

function StepIndicator({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-1 text-xs">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-1">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
              i < step
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                : i === step
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-100'
                  : 'border-white/15 bg-white/5 text-neutral-500'
            }`}
          >
            {i < step ? '✓' : i + 1}
          </span>
          <span className={`hidden truncate sm:inline ${i === step ? 'text-white' : 'text-neutral-500'}`}>{label}</span>
          {i < STEPS.length - 1 ? <span className="mx-1 h-px flex-1 bg-white/10" /> : null}
        </li>
      ))}
    </ol>
  );
}

function StepMethod(props: {
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
  const { method, setMethod, preset } = props;
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-300">
        Przeniesiemy Twoją stronę, bazy danych i pocztę ze starego hostingu — od A do Z.
        Wybierz, jak chcesz zacząć:
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setMethod('auto')}
          className={`rounded-2xl border p-4 text-left transition ${method === 'auto' ? 'border-cyan-400/60 bg-cyan-500/[0.08]' : 'border-cyan-500/25 bg-cyan-500/[0.04] hover:border-cyan-400/50'}`}
        >
          <p className="font-semibold text-white">Automatycznie (zalecane)</p>
          <p className="mt-1 text-xs text-neutral-400">Podaj login do panelu starego hostingu — sami wykryjemy domeny, bazy i skrzynki.</p>
        </button>
        <button
          type="button"
          onClick={() => setMethod('manual')}
          className={`rounded-2xl border p-4 text-left transition ${method === 'manual' ? 'border-white/40 bg-white/[0.05]' : 'border-white/10 bg-white/[0.02] hover:border-white/30'}`}
        >
          <p className="font-semibold text-white">Ręcznie</p>
          <p className="mt-1 text-xs text-neutral-400">Wprowadź dane FTP/SFTP, baz i skrzynek samodzielnie.</p>
        </button>
      </div>

      {method === 'auto' ? (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 block">
              <span className={labelText}>Panel starego hostingu</span>
              <Select
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
            Łączymy się tylko po to, by odczytać listę domen, baz i skrzynek. Hasła nie są zapisywane.
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
          <label className="space-y-1.5 block">
            <span className={labelText}>Dostawca (ustawi domyślny protokół/port)</span>
            <Select
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
  discovery: DiscoveryResult | null;
  presetId: string;
  setPresetId: (id: string) => void;
  targetDomain: string;
  setTargetDomain: (v: string) => void;
  sourceDomain: string;
  setSourceDomain: (v: string) => void;
  includeFiles: boolean;
  setIncludeFiles: (v: boolean) => void;
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
  boxes: BoxRow[];
  setBoxes: React.Dispatch<React.SetStateAction<BoxRow[]>>;
}) {
  const { discovery } = props;
  return (
    <div className="space-y-5">
      {discovery ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-xs text-emerald-100/90">
          <p className="font-semibold text-emerald-200">
            Wykryto: {discovery.domains.length} domen, {discovery.databases.length} baz, {discovery.mailboxes.length} skrzynek ({discovery.panelType}).
          </p>
          <p className="mt-1 text-emerald-100/70">Uzupełnij brakujące hasła do baz i skrzynek — reszta jest gotowa.</p>
          {discovery.warnings.map((w) => (
            <p key={w} className="mt-1 text-amber-200/80">⚠ {w}</p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5 block">
          <span className={labelText}>Domena docelowa (u nas)</span>
          <input value={props.targetDomain} onChange={(e) => props.setTargetDomain(e.target.value)} className={input} placeholder="twojadomena.pl" />
        </label>
        <label className="space-y-1.5 block">
          <span className={labelText}>Domena na starym hostingu (dla podmiany URL w WordPress)</span>
          <input value={props.sourceDomain} onChange={(e) => props.setSourceDomain(e.target.value)} className={input} placeholder="np. stara-domena.pl (jeśli inna)" />
        </label>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-white">
          <input type="checkbox" checked={props.includeFiles} onChange={(e) => props.setIncludeFiles(e.target.checked)} />
          Pliki strony (FTP/SFTP)
        </label>
        {props.includeFiles ? (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 block">
              <span className={labelText}>Protokół</span>
              <Select
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
            </label>
            <label className="space-y-1.5 block">
              <span className={labelText}>Ścieżka na serwerze</span>
              <input value={props.ftpPath} onChange={(e) => props.setFtpPath(e.target.value)} className={input} placeholder="/ lub /public_html" />
            </label>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Bazy danych MySQL ({props.dbs.length})</p>
          <Button
            type="button"
            onClick={() => props.setDbs((r) => [...r, { key: nextKey(), host: props.ftpHost || '', port: 3306, username: '', password: '', database: '' }])}
            className="bg-white/10 hover:bg-white/20 text-white text-xs"
          >
            + dodaj bazę
          </Button>
        </div>
        {props.dbs.map((row, i) => (
          <div key={row.key} className="grid gap-2 md:grid-cols-6 rounded-xl border border-white/5 p-2">
            <input className={`${input} md:col-span-2`} placeholder="host" value={row.host} onChange={(e) => patch(props.setDbs, i, { host: e.target.value })} />
            <input className={input} type="number" placeholder="port" value={row.port} onChange={(e) => patch(props.setDbs, i, { port: Number(e.target.value) })} />
            <input className={input} placeholder="nazwa bazy" value={row.database} onChange={(e) => patch(props.setDbs, i, { database: e.target.value })} />
            <input className={input} placeholder="użytkownik" autoComplete="off" value={row.username} onChange={(e) => patch(props.setDbs, i, { username: e.target.value })} />
            <div className="flex gap-1">
              <input className={input} type="password" placeholder="hasło" autoComplete="new-password" value={row.password} onChange={(e) => patch(props.setDbs, i, { password: e.target.value })} />
              <button type="button" onClick={() => props.setDbs((r) => r.filter((_, j) => j !== i))} className="px-2 text-rose-300 hover:text-rose-200" aria-label="Usuń bazę">×</button>
            </div>
          </div>
        ))}
        {props.dbs.length === 0 ? <p className="text-xs text-neutral-500">Brak baz. Dodaj, jeśli Twoja strona ich używa (np. WordPress, sklep).</p> : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Skrzynki e-mail IMAP ({props.boxes.length})</p>
          <Button
            type="button"
            onClick={() => props.setBoxes((r) => [...r, { key: nextKey(), host: '', port: 993, username: '', password: '', email: '' }])}
            className="bg-white/10 hover:bg-white/20 text-white text-xs"
          >
            + dodaj skrzynkę
          </Button>
        </div>
        {props.boxes.map((row, i) => (
          <div key={row.key} className="grid gap-2 md:grid-cols-6 rounded-xl border border-white/5 p-2">
            <input className={`${input} md:col-span-2`} placeholder="adres e-mail" value={row.email ?? ''} onChange={(e) => patch(props.setBoxes, i, { email: e.target.value, username: row.username || e.target.value })} />
            <input className={input} placeholder="host IMAP" value={row.host} onChange={(e) => patch(props.setBoxes, i, { host: e.target.value })} />
            <input className={input} type="number" placeholder="port" value={row.port} onChange={(e) => patch(props.setBoxes, i, { port: Number(e.target.value) })} />
            <input className={input} placeholder="login" autoComplete="off" value={row.username} onChange={(e) => patch(props.setBoxes, i, { username: e.target.value })} />
            <div className="flex gap-1">
              <input className={input} type="password" placeholder="hasło" autoComplete="new-password" value={row.password} onChange={(e) => patch(props.setBoxes, i, { password: e.target.value })} />
              <button type="button" onClick={() => props.setBoxes((r) => r.filter((_, j) => j !== i))} className="px-2 text-rose-300 hover:text-rose-200" aria-label="Usuń skrzynkę">×</button>
            </div>
          </div>
        ))}
        {props.boxes.length === 0 ? <p className="text-xs text-neutral-500">Brak skrzynek. Dodaj, jeśli przenosisz pocztę.</p> : null}
      </section>
    </div>
  );
}

function StepPreflight({
  preflight,
  preflighting,
  onRun,
}: {
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
          {preflighting ? 'Testuję dostępy…' : 'Uruchom test dostępów'}
        </Button>
      ) : (
        <div className={`rounded-xl border px-3 py-2.5 text-xs ${preflight.ok ? 'border-emerald-500/25 bg-emerald-500/[0.06]' : 'border-amber-500/25 bg-amber-500/[0.06]'}`}>
          <p className="font-semibold text-white">
            {preflight.ok ? 'Wszystko wygląda dobrze ✓' : 'Część źródeł wymaga uwagi (możesz kontynuować)'}
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
          <p className="mt-2 text-neutral-500">
            „Zablokowany zdalny MySQL" to normalne na hostingach współdzielonych — przy transferze
            pobierzemy bazę przez SSH. Możesz spokojnie przejść dalej.
          </p>
        </div>
      )}
    </div>
  );
}

function StepStart(props: {
  includeFiles: boolean;
  ftpHost: string;
  dbs: DbRow[];
  boxes: BoxRow[];
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
        <li className="flex items-center gap-2">
          <span className={props.includeFiles && props.ftpHost.trim() ? 'text-emerald-400' : 'text-neutral-600'}>●</span>
          <span className="text-neutral-200">Pliki strony {props.includeFiles && props.ftpHost.trim() ? `(${props.ftpHost.trim()})` : '— pominięte'}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className={props.dbs.length > 0 ? 'text-emerald-400' : 'text-neutral-600'}>●</span>
          <span className="text-neutral-200">Bazy danych: {props.dbs.length}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className={props.boxes.length > 0 ? 'text-emerald-400' : 'text-neutral-600'}>●</span>
          <span className="text-neutral-200">Skrzynki e-mail: {props.boxes.length}</span>
        </li>
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
        <input
          type="checkbox"
          checked={props.consent}
          onChange={(e) => props.setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-500"
        />
        <span>
          Oświadczam, że mam prawo przenieść wskazane dane i <strong>upoważniam Verris</strong> do
          jednorazowego dostępu do wskazanego hostingu źródłowego w celu wykonania migracji. Rozumiem,
          że dane dostępowe są szyfrowane i usuwane po zakończeniu. Akceptuję{' '}
          <a href="/legal/dpa" target="_blank" className="text-cyan-300 hover:underline">Umowę powierzenia (DPA)</a>,{' '}
          <a href="/legal/privacy" target="_blank" className="text-cyan-300 hover:underline">Politykę prywatności</a>{' '}
          i <a href="/legal/terms" target="_blank" className="text-cyan-300 hover:underline">Regulamin</a>.
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
  if (status === 'auth_failed') return 'text-rose-400';
  return 'text-amber-400';
}
