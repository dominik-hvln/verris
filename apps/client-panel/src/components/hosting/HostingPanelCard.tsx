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
      className="shrink-0 rounded-md border border-white/10 p-1.5 text-neutral-400 hover:text-white hover:bg-white/5"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function CredentialRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
      <div className="flex items-start gap-2 min-w-0">
        <p className={`text-sm text-white break-all min-w-0 flex-1 ${mono ? 'font-mono' : ''}`}>{value}</p>
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
      <div className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-4">
        <HostingLinksLoading label="Panel hostingu…" />
      </div>
    );
  }

  const panelLabel = links.panelDisplayHost || links.panelBaseUrl.replace(/^https?:\/\//, '');

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0a0a] p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-white shrink-0">
          <Server className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-white">Panel hostingu</h2>
          <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
            Zarządzaj plikami, bazami i pocztą na{' '}
            <span className="font-mono text-neutral-300">{panelLabel}</span>
          </p>
        </div>
      </div>

      {links.daUsername && links.daPassword ? (
        <div className="space-y-3 rounded-xl border border-white/5 bg-black/30 p-3">
          <CredentialRow label="Adres" value={links.panelBaseUrl} />
          <CredentialRow label="Login" value={links.daUsername} />
          <CredentialRow label="Hasło" value={links.daPassword} />
        </div>
      ) : (
        <p className="text-xs text-amber-200/90">
          {links.fetchError ?? 'Dane logowania będą dostępne po aktywacji usługi.'}
        </p>
      )}

      {links.panelBaseUrl ? (
        <Button asChild size="sm" className="w-full bg-white text-black hover:bg-neutral-200 gap-2">
          <a href={links.panelBaseUrl} target="_blank" rel="noopener noreferrer">
            Otwórz panel hostingu
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      ) : null}
    </div>
  );
}
