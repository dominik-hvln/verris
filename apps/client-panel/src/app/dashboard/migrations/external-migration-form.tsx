'use client';

import { useState } from 'react';
import { Button } from '@verris/ui';
import { requestMigrationBundleAction } from './actions';
import { Select } from '@/components/panel';

interface Props {
  serviceId: string;
}

/**
 * CMP-10 — presety migracji per konkurent. Ustawiają domyślny protokół/port
 * i podpowiadają, gdzie w panelu danego dostawcy znaleźć dane dostępowe.
 * Źródło jest też dopisywane do notatek, więc worker/staff wie, skąd migrujemy
 * (bez zmian w schemacie bazy).
 */
type Provider = {
  id: string;
  label: string;
  protocol: 'ftp' | 'ftps' | 'sftp';
  port: number;
  hostHint: string;
  tips: string[];
};

const PROVIDERS: Provider[] = [
  {
    id: 'dhosting',
    label: 'dhosting',
    protocol: 'sftp',
    port: 22,
    hostHint: 'np. serwerXXXX.dhosting.pl',
    tips: [
      'Pliki: dPanel → FTP/SSH — skopiuj host, login i hasło konta FTP.',
      'Baza: dPanel → Bazy danych → wyeksportuj zrzut lub podaj dane do migracji.',
      'Poczta: dPanel → Poczta → dane serwera IMAP (host, port 993).',
    ],
  },
  {
    id: 'home.pl',
    label: 'home.pl',
    protocol: 'ftp',
    port: 21,
    hostHint: 'np. ftp.twojadomena.pl',
    tips: [
      'Pliki: Panel home.pl → Serwer → FTP — host zwykle ftp.twojadomena.pl.',
      'Baza: Panel → Bazy MySQL → eksport lub dane dostępowe.',
      'Poczta: Panel → Poczta → ustawienia IMAP (port 993).',
    ],
  },
  {
    id: 'cyberfolks',
    label: 'cyberFolks',
    protocol: 'sftp',
    port: 22,
    hostHint: 'np. serwerXXXX.cyberfolks.pl',
    tips: [
      'Pliki: panel DirectAdmin → konta FTP (lub SSH/SFTP).',
      'Baza: DirectAdmin → MySQL Management → eksport bazy.',
      'Poczta: DirectAdmin → E-mail accounts → dane IMAP (port 993).',
    ],
  },
  {
    id: 'seohost',
    label: 'Seohost',
    protocol: 'ftp',
    port: 21,
    hostHint: 'np. serwer Seohost / IP konta',
    tips: [
      'Pliki: panel (DirectAdmin) → konta FTP.',
      'Baza: DirectAdmin → MySQL Management → eksport bazy.',
      'Poczta: DirectAdmin → E-mail accounts → dane IMAP (port 993).',
    ],
  },
  {
    id: 'hostinger',
    label: 'Hostinger',
    protocol: 'sftp',
    port: 65002,
    hostHint: 'host z hPanel → Pliki → SSH/SFTP',
    tips: [
      'Pliki: hPanel → Pliki → Dostęp SSH/SFTP — Hostinger używa portu SFTP 65002.',
      'Baza: hPanel → Bazy danych MySQL → eksport lub zdalny dostęp.',
      'Poczta: hPanel → E-maile → konfiguracja IMAP (port 993).',
    ],
  },
  {
    id: 'other',
    label: 'Inny dostawca',
    protocol: 'sftp',
    port: 22,
    hostHint: 'host Twojego obecnego serwera',
    tips: ['Podaj dane FTP/SFTP, MySQL i IMAP od obecnego dostawcy — pomożemy na każdym kroku.'],
  },
];

export function ExternalMigrationForm({ serviceId }: Props) {
  const [providerId, setProviderId] = useState<string>('dhosting');
  const [sourceType, setSourceType] = useState<'FTP' | 'MYSQL' | 'IMAP'>('FTP');
  const [targetDomain, setTargetDomain] = useState('');
  const [protocol, setProtocol] = useState<'ftp' | 'ftps' | 'sftp'>('sftp');
  const [sourceHost, setSourceHost] = useState('');
  const [sourcePort, setSourcePort] = useState(22);
  const [sourceUsername, setSourceUsername] = useState('');
  const [sourcePassword, setSourcePassword] = useState('');
  const [sourcePath, setSourcePath] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const provider = PROVIDERS.find((p) => p.id === providerId) ?? PROVIDERS[0];

  function applyProvider(id: string) {
    setProviderId(id);
    const p = PROVIDERS.find((x) => x.id === id);
    if (p && sourceType === 'FTP') {
      setProtocol(p.protocol);
      setSourcePort(p.port);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        setBusy(true);
        const sourceTag = `[Źródło: ${provider.label}]`;
        const mergedNotes = [sourceTag, notes.trim()].filter(Boolean).join(' ');
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
          notes: mergedNotes || undefined,
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
        <span className="text-xs text-neutral-400">Skąd migrujesz?</span>
        <Select
          value={providerId}
          onChange={applyProvider}
          aria-label="Skąd migrujesz"
          options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
        />
      </label>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-xs text-emerald-100/90">
        <p className="mb-1 font-semibold text-emerald-200">Jak pobrać dane z {provider.label}</p>
        <ul className="space-y-1">
          {provider.tips.map((t) => (
            <li key={t} className="flex gap-1.5">
              <span className="text-emerald-400">•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>

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
            placeholder={provider.hostHint}
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
