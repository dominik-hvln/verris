'use client';

import React, { useEffect, useState, useId } from 'react';
import { KeyRound, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@verris/ui';
import { fetchHostingDomainsAction } from '@/app/dashboard/services/[id]/hosting-domains-action';
import {
  pasteCustomSslAction,
  requestLetsEncryptSslAction,
} from '@/app/dashboard/services/[id]/hosting-ssl-actions';
import { Select } from '@/components/panel';
import { Checkbox } from '@/components/panel/checkbox';

interface Props {
  serviceId: string;
}

export function HostingSslForms({ serviceId }: Props) {
  const domainId = useId();
  const [domains, setDomains] = useState<{ name: string }[]>([]);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [loadingDomains, setLoadingDomains] = useState(true);

  const [domain, setDomain] = useState('');
  const [includeWww, setIncludeWww] = useState(true);
  const [wildcard, setWildcard] = useState(false);
  const [leBusy, setLeBusy] = useState(false);
  const [leMsg, setLeMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [cert, setCert] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [caBundle, setCaBundle] = useState('');
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteMsg, setPasteMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Przy montażu `loadingDomains` jest już true, a `domainError` pusty — efekt tylko pobiera.
  // serviceId pochodzi z trasy, więc jego zmiana to nowy montaż.
  useEffect(() => {
    void fetchHostingDomainsAction(serviceId)
      .then((res) => {
        setDomains(res.domains);
        if (res.fetchError) setDomainError(res.fetchError);
      })
      .catch((e) => {
        setDomainError(e instanceof Error ? e.message : 'Nie udało się pobrać domen.');
        setDomains([]);
      })
      .finally(() => {
        setLoadingDomains(false);
      });
  }, [serviceId]);

  // Domyślnie pierwsza domena z listy — w renderze, nie efektem.
  if (!domain && domains.length > 0) {
    setDomain(domains[0].name);
  }

  return (
    <div className="space-y-6">
      {domainError ? (
        <p className="text-sm text-warn rounded-[10px] border border-warn/30 bg-warn-soft px-3 py-2">
          {domainError}
        </p>
      ) : null}

      <label htmlFor={domainId} className="block space-y-1.5 max-w-md">
        <span className="text-xs font-medium text-muted-foreground">Domena (konto hostingowe)</span>
        <Select
          id={domainId}
          value={domain}
          onChange={setDomain}
          disabled={loadingDomains || domains.length === 0}
          aria-label="Domena (konto hostingowe)"
          placeholder="—"
          options={domains.map((d) => ({ value: d.name, label: d.name }))}
        />
      </label>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[10px] border border-line bg-raised p-5 space-y-4">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <Sparkles className="h-4 w-4 text-data-hi" />
            Let&apos;s Encrypt
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Zlecenie wystawienia certyfikatu na serwerze. Może potrwać do ok. 2–3 minut — nie zamykaj
            karty w tym czasie.
          </p>
          <label className="flex items-center gap-2 text-sm text-[color:var(--verris-body)] cursor-pointer select-none">
            <Checkbox
              className="rounded border-line-strong bg-background"
              checked={includeWww}
              disabled={wildcard}
              onChange={(e) => setIncludeWww(e.target.checked)}
            />
            Uwzględnij <span className="font-mono text-[color:var(--verris-body)]">www</span> (jeśli domena jest na koncie)
          </label>
          <label className="flex items-start gap-2 text-sm text-[color:var(--verris-body)] cursor-pointer select-none">
            <Checkbox
              className="mt-0.5 rounded border-line-strong bg-background"
              checked={wildcard}
              onChange={(e) => setWildcard(e.target.checked)}
            />
            <span>
              Wildcard <span className="font-mono text-[color:var(--verris-body)]">*.{domain || 'domena'}</span> — pokrywa wszystkie subdomeny.
              <span className="mt-0.5 block text-[11px] text-warn">
                Wymaga, aby DNS domeny był hostowany na tym serwerze (walidacja DNS-01).
              </span>
            </span>
          </label>
          {leMsg ? (
            <p
              className={
                leMsg.type === 'ok'
                  ? 'text-sm text-data-hi'
                  : 'text-sm text-crit'
              }
            >
              {leMsg.text}
            </p>
          ) : null}
          <Button
            type="button"
            className="w-full gap-2 bg-primary text-primary-foreground font-semibold hover:bg-data-hi"
            disabled={leBusy || !domain.trim() || loadingDomains}
            onClick={async () => {
              setLeMsg(null);
              setLeBusy(true);
              const r = await requestLetsEncryptSslAction(serviceId, domain.trim(), includeWww, wildcard);
              setLeBusy(false);
              if (r.ok) {
                setLeMsg({
                  type: 'ok',
                  text: wildcard
                    ? 'Zlecono wystawienie certyfikatu wildcard (w tle). Walidacja DNS-01 wymaga, aby strefa ' +
                      'DNS domeny była na tym serwerze. Status zaktualizuje się tu po wydaniu (zwykle do kilku minut).'
                    : 'Zlecono wystawienie certyfikatu (w tle). Aby się powiodło, domena musi już ' +
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

        <div className="rounded-[10px] border border-line bg-raised p-5 space-y-4">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <KeyRound className="h-4 w-4 text-data-hi" />
            Własny certyfikat (PEM)
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Wklej certyfikat serwera, klucz prywatny i opcjonalnie łańcuch CA (PEM). Dane trafiają wyłącznie do
            serwera dla wybranej domeny.
          </p>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Certyfikat (PEM)</span>
            <textarea
              className="w-full min-h-[100px] rounded-[10px] border border-line bg-background px-3 py-2 text-xs font-mono text-[color:var(--verris-body)]"
              value={cert}
              onChange={(e) => setCert(e.target.value)}
              placeholder="-----BEGIN CERTIFICATE-----"
              spellCheck={false}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Klucz prywatny (PEM)</span>
            <textarea
              className="w-full min-h-[80px] rounded-[10px] border border-line bg-background px-3 py-2 text-xs font-mono text-[color:var(--verris-body)]"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="-----BEGIN PRIVATE KEY-----"
              spellCheck={false}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Łańcuch CA (opcjonalnie)</span>
            <textarea
              className="w-full min-h-[60px] rounded-[10px] border border-line bg-background px-3 py-2 text-xs font-mono text-[color:var(--verris-body)]"
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
                  ? 'text-sm text-data-hi'
                  : 'text-sm text-crit'
              }
            >
              {pasteMsg.text}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 border-data/28 text-foreground hover:bg-data-soft"
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
