'use client';

import { useState } from 'react';
import { Button } from '@verris/ui';
import { requestMigrationBundleAction } from './actions';
import { Select } from '@/components/panel';

interface Props {
  serviceId: string;
}

export function ExternalMigrationForm({ serviceId }: Props) {
  const [sourceType, setSourceType] = useState<'FTP' | 'MYSQL' | 'IMAP'>('FTP');
  const [targetDomain, setTargetDomain] = useState('');
  const [protocol, setProtocol] = useState<'ftp' | 'ftps' | 'sftp'>('sftp');
  const [sourceHost, setSourceHost] = useState('');
  const [sourcePort, setSourcePort] = useState(21);
  const [sourceUsername, setSourceUsername] = useState('');
  const [sourcePassword, setSourcePassword] = useState('');
  const [sourcePath, setSourcePath] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        setBusy(true);
        const res = await requestMigrationBundleAction({
          serviceId,
          targetDomain: targetDomain.trim() || undefined,
          sourceType,
          sourceHost,
          sourcePort,
          sourceUsername,
          sourcePassword,
          sourcePath: sourcePath.trim() || undefined,
          protocol,
          notes: notes.trim() || undefined,
        });
        setBusy(false);
        if ('error' in res) {
          setMsg({ type: 'err', text: res.error });
          return;
        }
        setMsg({
          type: 'ok',
          text: 'Pakiet migracji został zarejestrowany. Jeśli wybrałeś SFTP/FTP, pierwszy job plikowy trafi do compute-node worker.',
        });
        setSourcePassword('');
      }}
    >
      <label className="space-y-1.5 block">
        <span className="text-xs text-neutral-400">Domena docelowa</span>
        <input
          value={targetDomain}
          onChange={(e) => setTargetDomain(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          placeholder="example.com"
        />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs text-neutral-400">Typ źródła</span>
          <Select
            value={sourceType}
            onChange={(v) => setSourceType(v as 'FTP' | 'MYSQL' | 'IMAP')}
            aria-label="Typ źródła"
            options={[
              { value: 'FTP', label: 'FTP (pliki)' },
              { value: 'MYSQL', label: 'MySQL (baza)' },
              { value: 'IMAP', label: 'IMAP (poczta)' },
            ]}
          />
        </label>
        {sourceType === 'FTP' ? (
          <label className="space-y-1.5">
            <span className="text-xs text-neutral-400">Protokół plików</span>
            <Select
              value={protocol}
              onChange={(v) => setProtocol(v as 'ftp' | 'ftps' | 'sftp')}
              aria-label="Protokół plików"
              options={[
                { value: 'sftp', label: 'SFTP' },
                { value: 'ftps', label: 'FTPS' },
                { value: 'ftp', label: 'FTP' },
              ]}
            />
          </label>
        ) : null}
        <label className="space-y-1.5">
          <span className="text-xs text-neutral-400">Host źródła</span>
          <input
            value={sourceHost}
            onChange={(e) => setSourceHost(e.target.value)}
            required
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            placeholder="old-host.example.com"
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs text-neutral-400">Port</span>
          <input
            type="number"
            min={1}
            max={65535}
            value={sourcePort}
            onChange={(e) => setSourcePort(Number(e.target.value))}
            required
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs text-neutral-400">Użytkownik</span>
          <input
            value={sourceUsername}
            onChange={(e) => setSourceUsername(e.target.value)}
            required
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>
      <label className="space-y-1.5 block">
        <span className="text-xs text-neutral-400">Hasło źródła</span>
        <input
          type="password"
          value={sourcePassword}
          onChange={(e) => setSourcePassword(e.target.value)}
          required
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="space-y-1.5 block">
        <span className="text-xs text-neutral-400">Ścieżka / baza / skrzynka</span>
        <input
          value={sourcePath}
          onChange={(e) => setSourcePath(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="space-y-1.5 block">
        <span className="text-xs text-neutral-400">Notatki</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full min-h-[72px] rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>
      {msg ? <p className={`text-sm ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p> : null}
      <Button type="submit" disabled={busy} className="bg-cyan-600 hover:bg-cyan-500 text-white">
        {busy ? 'Wysyłam pakiet…' : 'Zleć pakiet migracji'}
      </Button>
    </form>
  );
}

