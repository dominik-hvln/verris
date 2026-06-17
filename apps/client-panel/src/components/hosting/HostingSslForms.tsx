'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@verris/ui';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import {
  pasteCustomSslAction,
  requestLetsEncryptSslAction,
} from '@/app/dashboard/services/[id]/hosting-ssl-actions';

interface Props {
  serviceId: string;
}

export function HostingSslForms({ serviceId }: Props) {
  const [domains, setDomains] = useState<{ name: string }[]>([]);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [loadingDomains, setLoadingDomains] = useState(true);

  const [domain, setDomain] = useState('');
  const [includeWww, setIncludeWww] = useState(true);
  const [leBusy, setLeBusy] = useState(false);
  const [leMsg, setLeMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [cert, setCert] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [caBundle, setCaBundle] = useState('');
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteMsg, setPasteMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadDomains = useCallback(async () => {
    setLoadingDomains(true);
    setDomainError(null);
    try {
      const res = await fetchHostingDomainsAction(serviceId);
      setDomains(res.domains);
      if (res.fetchError) setDomainError(res.fetchError);
    } catch (e) {
      setDomainError(e instanceof Error ? e.message : 'Nie udało się pobrać domen.');
      setDomains([]);
    } finally {
      setLoadingDomains(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void loadDomains();
  }, [loadDomains]);

  useEffect(() => {
    if (!domain && domains.length > 0) {
      setDomain(domains[0].name);
    }
  }, [domains, domain]);

  return (
    <div className="space-y-6">
      {domainError ? (
        <p className="text-sm text-amber-200/90 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          {domainError}
        </p>
      ) : null}

      <label className="block space-y-1.5 max-w-md">
        <span className="text-xs font-medium text-neutral-400">Domena (konto hostingowe)</span>
        <select
          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          disabled={loadingDomains || domains.length === 0}
        >
          {domains.length === 0 ? (
            <option value="">—</option>
          ) : (
            domains.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))
          )}
        </select>
      </label>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Sparkles className="h-4 w-4 text-cyan-300" />
            Let&apos;s Encrypt
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Zlecenie wystawienia certyfikatu na serwerze (HTTP-01). Może potrwać do ok. 2 minut — nie zamykaj
            karty w tym czasie.
          </p>
          <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-white/20 bg-black/40"
              checked={includeWww}
              onChange={(e) => setIncludeWww(e.target.checked)}
            />
            Uwzględnij <span className="font-mono text-neutral-200">www</span> (jeśli domena jest na koncie)
          </label>
          {leMsg ? (
            <p
              className={
                leMsg.type === 'ok'
                  ? 'text-sm text-emerald-300/90'
                  : 'text-sm text-rose-300/90'
              }
            >
              {leMsg.text}
            </p>
          ) : null}
          <Button
            type="button"
            className="w-full gap-2 bg-cyan-600 hover:bg-cyan-500 text-white"
            disabled={leBusy || !domain.trim() || loadingDomains}
            onClick={async () => {
              setLeMsg(null);
              setLeBusy(true);
              const r = await requestLetsEncryptSslAction(serviceId, domain.trim(), includeWww);
              setLeBusy(false);
              if (r.ok) {
                setLeMsg({
                  type: 'ok',
                  text:
                    'Zlecono wystawienie certyfikatu (w tle). Aby się powiodło, domena musi już ' +
                    'wskazywać na nasz serwer (rekord A) — inaczej walidacja Let’s Encrypt nie przejdzie. ' +
                    'Status zaktualizuje się tu po wydaniu (zwykle do kilku minut).',
                });
              } else {
                setLeMsg({ type: 'err', text: r.error });
              }
            }}
          >
            {leBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Wystaw certyfikat LE
          </Button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <div className="flex items-center gap-2 text-white font-semibold">
            <KeyRound className="h-4 w-4 text-violet-300" />
            Własny certyfikat (PEM)
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Wklej certyfikat serwera, klucz prywatny i opcjonalnie łańcuch CA (PEM). Dane trafiają wyłącznie do
            serwera dla wybranej domeny.
          </p>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-400">Certyfikat (PEM)</span>
            <textarea
              className="w-full min-h-[100px] rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs font-mono text-neutral-200"
              value={cert}
              onChange={(e) => setCert(e.target.value)}
              placeholder="-----BEGIN CERTIFICATE-----"
              spellCheck={false}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-400">Klucz prywatny (PEM)</span>
            <textarea
              className="w-full min-h-[80px] rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs font-mono text-neutral-200"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="-----BEGIN PRIVATE KEY-----"
              spellCheck={false}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-neutral-400">Łańcuch CA (opcjonalnie)</span>
            <textarea
              className="w-full min-h-[60px] rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs font-mono text-neutral-200"
              value={caBundle}
              onChange={(e) => setCaBundle(e.target.value)}
              placeholder="-----BEGIN CERTIFICATE----- (intermediate)"
              spellCheck={false}
            />
          </label>
          {pasteMsg ? (
            <p
              className={
                pasteMsg.type === 'ok'
                  ? 'text-sm text-emerald-300/90'
                  : 'text-sm text-rose-300/90'
              }
            >
              {pasteMsg.text}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 border-violet-500/30 text-white hover:bg-violet-500/10"
            disabled={pasteBusy || !domain.trim() || !cert.trim() || !privateKey.trim() || loadingDomains}
            onClick={async () => {
              setPasteMsg(null);
              setPasteBusy(true);
              const r = await pasteCustomSslAction(serviceId, {
                domain: domain.trim(),
                certificate: cert,
                privateKey,
                caBundle: caBundle.trim() || undefined,
              });
              setPasteBusy(false);
              if (r.ok) {
                setPasteMsg({ type: 'ok', text: 'Certyfikat zapisany na serwerze.' });
              } else {
                setPasteMsg({ type: 'err', text: r.error });
              }
            }}
          >
            {pasteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Zapisz certyfikat
          </Button>
        </div>
      </div>
    </div>
  );
}
