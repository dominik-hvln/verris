'use client';

import { useState } from 'react';
import { ExternalLink, Server, Copy, Check } from 'lucide-react';
import { Button } from '@verris/ui';
import { useHostingLinks, HostingLinksLoading } from '@/components/hosting/hosting-links-context';

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Kopiuj ${label}`}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="shrink-0 rounded-md border border-line p-1.5 text-muted-foreground hover:bg-raised hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-data-hi" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function CredentialRow({ label, value, mono = true, secret = false }: { label: string; value: string; mono?: boolean; secret?: boolean }) {
  // Hasło nie leży jawnie na ekranie (zrzuty, udostępniony ekran) — pokazujemy na żądanie, kopiowanie działa zawsze.
  const [shown, setShown] = useState(!secret);
  return (
    <div className="space-y-1">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <div className="flex items-start gap-2 min-w-0">
        <p className={`text-[13px] leading-snug text-foreground break-all min-w-0 flex-1 ${mono ? 'font-mono' : ''}`}>
          {shown ? value : '•'.repeat(Math.min(12, Math.max(8, value.length)))}
        </p>
        {secret ? (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-data-hi hover:bg-raised"
            aria-pressed={shown}
          >
            {shown ? 'Ukryj' : 'Pokaż'}
          </button>
        ) : null}
        <CopyButton value={value} label={label} />
      </div>
    </div>
  );
}

/** Stały panel boczny — dane logowania do panelu hostingu. */
export default function HostingPanelCard() {
  const { links, loading } = useHostingLinks();

  if (loading) {
    return (
      <div className="rounded-[10px] border border-line bg-card p-4">
        <HostingLinksLoading label="Panel hostingu…" />
      </div>
    );
  }

  const panelLabel = links.panelDisplayHost || links.panelBaseUrl.replace(/^https?:\/\//, '');

  return (
    <div className="rounded-[10px] border border-line bg-card p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-md border border-line bg-raised p-2 text-muted-foreground">
          <Server className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-bold text-foreground">Panel hostingu</h3>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Zarządzaj plikami, bazami i pocztą na{' '}
            <span className="font-mono text-foreground">{panelLabel}</span>
          </p>
        </div>
      </div>

      {links.daUsername && links.daPassword ? (
        <div className="space-y-3 rounded-md border border-line bg-raised/60 p-3">
          <CredentialRow label="Adres" value={links.panelBaseUrl} />
          <CredentialRow label="Login" value={links.daUsername} />
          <CredentialRow label="Hasło" value={links.daPassword} secret />
        </div>
      ) : (
        <p className="text-[12.5px] text-warn">
          {links.fetchError ?? 'Dane logowania będą dostępne po aktywacji usługi.'}
        </p>
      )}

      {links.panelBaseUrl ? (
        <Button asChild size="sm" className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
          <a href={links.panelBaseUrl} target="_blank" rel="noopener noreferrer">
            Otwórz panel hostingu
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      ) : null}
    </div>
  );
}
