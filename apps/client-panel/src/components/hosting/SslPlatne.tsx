'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Loader2, RefreshCw } from 'lucide-react';
import type { SslPlatneDto, SslZamowienieDto, SslZamowienieStatus } from '@verris/contracts';
import { SectionHead, StatusPill, type Tone } from '@/components/panel/v2';
import { Select } from '@/components/panel/select';
import { potwierdz } from '@/components/panel/potwierdz';
import { liczba } from '@/lib/liczba';
import { checkPaidSslAction, fetchPaidSslAction, orderPaidSslAction } from '@/app/dashboard/services/[id]/hosting-ssl-actions';

const STATUS: Record<SslZamowienieStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'oczekuje na weryfikację', tone: 'warn' },
  VALIDATING: { label: 'oczekuje na weryfikację', tone: 'warn' },
  ISSUED: { label: 'wydany', tone: 'data' },
  INSTALLED: { label: 'zainstalowany', tone: 'data' },
  FAILED: { label: 'błąd', tone: 'warn' },
};
/** Adresy, które wystawca zawsze przyjmuje do weryfikacji e-mailem (API sprawdza to samo). */
const ADRESY = ['admin', 'administrator', 'hostmaster', 'postmaster', 'webmaster'];
const BTN =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-strong bg-card px-[13px] py-2 text-sm font-medium text-foreground hover:border-primary disabled:opacity-50';
const K = (kwota: string) => `${liczba(Number(kwota), 2)} K`;

/** G-08 — płatny certyfikat SSL (DV): zakup z portfela, weryfikacja, instalacja na koncie. Bez cennika — nic. */
export function SslPlatne({ serviceId, domains }: { serviceId: string; domains: { name: string }[] }) {
  const [dane, setDane] = useState<SslPlatneDto | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [domain, setDomain] = useState('');
  const [productId, setProductId] = useState('');
  const [walidacja, setWalidacja] = useState<'DNS' | 'EMAIL'>('DNS');
  const [adres, setAdres] = useState('admin');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const wczytaj = useCallback(
    () =>
      fetchPaidSslAction(serviceId).then((w) => {
        if (w.ok) setDane(w.dane);
        else setBlad(w.blad);
      }),
    [serviceId],
  );
  useEffect(() => {
    void wczytaj();
  }, [wczytaj]);

  if (!dane) return blad ? <p className="m-0 rounded-[10px] bg-warn-soft px-4 py-3 text-sm text-warn">{blad}</p> : null;
  if (dane.oferta.length === 0 && dane.zamowienia.length === 0) return null;

  // Domyślne wybory w renderze, nie efektem (jak w HostingSslForms).
  if (!domain && domains.length > 0) setDomain(domains[0].name);
  if (!productId && dane.oferta.length > 0) setProductId(String(dane.oferta[0].productId));
  const produkt = dane.oferta.find((p) => String(p.productId) === productId);
  const host = produkt?.wildcard ? `*.${domain}` : domain;

  const zamow = async () => {
    if (!produkt || !domain) return;
    setMsg(null);
    const ok = await potwierdz(
      `Z portfela pobierzemy ${K(produkt.priceGross)} za certyfikat ${produkt.name} dla ${host} na 1 rok. ` +
        (walidacja === 'DNS'
          ? 'Weryfikacja domeny przez rekord DNS — gdy DNS domeny jest u nas, dodamy go sami.'
          : `Wiadomość z linkiem do weryfikacji przyjdzie na ${adres}@${domain}.`) +
        ' Po wydaniu zainstalujemy certyfikat na koncie automatycznie. Jeśli wystawca odrzuci zamówienie, opłata wróci do portfela.',
      { tytul: 'Zamówić certyfikat SSL?', akcja: 'Zamów i zapłać' },
    );
    if (!ok) return;
    setBusy('zamow');
    const w = await orderPaidSslAction(serviceId, {
      domain,
      productId: produkt.productId,
      validation: walidacja,
      ...(walidacja === 'EMAIL' ? { approverEmail: `${adres}@${domain}` } : {}),
    });
    setBusy(null);
    if (!w.ok) return setMsg({ type: 'err', text: w.blad });
    setMsg({ type: 'ok', text: 'Certyfikat zamówiony — czeka na weryfikację domeny.' });
    await wczytaj();
  };

  const sprawdz = async (z: SslZamowienieDto) => {
    setBusy(z.id);
    const w = await checkPaidSslAction(serviceId, z.id);
    setBusy(null);
    if (!w.ok) return setMsg({ type: 'err', text: w.blad });
    setDane((d) => d && { ...d, zamowienia: d.zamowienia.map((x) => (x.id === z.id ? w.dane : x)) });
  };

  return (
    <section>
      <SectionHead
        title="Certyfikat płatny"
        desc="Certyfikat DV od komercyjnego wystawcy z gwarancją — kupujesz z portfela, a my generujemy klucz, przeprowadzamy weryfikację i instalujemy certyfikat na koncie."
      />
      {dane.oferta.length > 0 ? (
        <div className="space-y-4 rounded-[10px] border border-line bg-card p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Domena</span>
              <Select
                value={domain}
                onChange={setDomain}
                aria-label="Domena certyfikatu"
                options={domains.map((d) => ({ value: d.name, label: d.name }))}
              />
            </div>
            <div className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Certyfikat</span>
              <Select
                value={productId}
                onChange={setProductId}
                aria-label="Rodzaj certyfikatu"
                options={dane.oferta.map((p) => ({
                  value: String(p.productId),
                  label: `${p.name}${p.wildcard ? ' — wildcard (wszystkie subdomeny)' : ' — jedna domena'} · ${K(p.priceGross)} / rok`,
                }))}
              />
            </div>
            <div className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Weryfikacja domeny</span>
              <Select
                value={walidacja}
                onChange={(v) => setWalidacja(v === 'EMAIL' ? 'EMAIL' : 'DNS')}
                aria-label="Weryfikacja domeny"
                options={[
                  { value: 'DNS', label: 'Rekord DNS (zalecane)' },
                  { value: 'EMAIL', label: 'E-mail na adres w domenie' },
                ]}
              />
            </div>
            {walidacja === 'EMAIL' ? (
              <div className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Adres do weryfikacji</span>
                <Select
                  value={adres}
                  onChange={setAdres}
                  aria-label="Adres do weryfikacji"
                  options={ADRESY.map((a) => ({ value: a, label: `${a}@${domain || 'domena'}` }))}
                />
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-sm text-[color:var(--verris-body)]">
              {produkt ? (
                <>
                  Cena: <b className="text-foreground">{K(produkt.priceGross)}</b> brutto za 1 rok · certyfikat dla <span className="font-mono">{host || '—'}</span>
                </>
              ) : null}
            </p>
            <button type="button" className={BTN} disabled={!produkt || !domain || busy === 'zamow'} onClick={zamow}>
              {busy === 'zamow' ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <BadgeCheck className="h-[15px] w-[15px]" />}
              Zamów certyfikat
            </button>
          </div>
          {msg ? <p className={msg.type === 'ok' ? 'm-0 text-sm text-data-hi' : 'm-0 text-sm text-crit'}>{msg.text}</p> : null}
          <p className="m-0 text-xs text-muted-foreground">
            Certyfikaty OV i EV (z weryfikacją firmy) — na zapytanie:{' '}
            <Link href="/dashboard/support/new" className="underline">
              napisz zgłoszenie
            </Link>
            .
          </p>
        </div>
      ) : null}

      {dane.zamowienia.length > 0 ? (
        <ul className="mt-4 space-y-3 p-0">
          {dane.zamowienia.map((z) => {
            const st = STATUS[z.status];
            const wToku = z.status === 'PENDING' || z.status === 'VALIDATING' || z.status === 'ISSUED';
            return (
              <li key={z.id} className="list-none space-y-2 rounded-[10px] border border-line bg-card px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <b className="font-semibold text-foreground">{z.wildcard ? `*.${z.domain}` : z.domain}</b>
                    <span className="ml-2 text-muted-foreground">{z.productName}</span>
                    <span className="ml-2">
                      <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    </span>
                    {z.expiresAt ? (
                      <span className="ml-2 text-muted-foreground">
                        ważny do {new Date(z.expiresAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    ) : null}
                  </div>
                  {wToku ? (
                    <button type="button" className={BTN} disabled={busy === z.id} onClick={() => void sprawdz(z)}>
                      {busy === z.id ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <RefreshCw className="h-[15px] w-[15px]" />}
                      Sprawdź teraz
                    </button>
                  ) : null}
                </div>
                {z.status === 'VALIDATING' && z.validation === 'EMAIL' && z.approverEmail ? (
                  <p className="m-0 text-muted-foreground">Kliknij link w wiadomości od wystawcy wysłanej na {z.approverEmail}.</p>
                ) : null}
                {z.status === 'VALIDATING' && z.validation === 'DNS' ? (
                  z.dnsRecord ? (
                    <p className="m-0 text-muted-foreground">
                      Rekord weryfikacyjny{z.dnsRecordAdded ? ' (dodany w strefie DNS na naszym serwerze)' : ''}:{' '}
                      <span className="break-all font-mono text-foreground">
                        {z.dnsRecord.name} {z.dnsRecord.type} {z.dnsRecord.value}
                      </span>
                      . Jeśli DNS domeny jest u innego dostawcy, dodaj ten rekord tam.
                    </p>
                  ) : (
                    <p className="m-0 text-muted-foreground">Czekamy na rekord weryfikacyjny od wystawcy — sprawdzimy to automatycznie.</p>
                  )
                ) : null}
                {z.problem ? <p className="m-0 text-warn">{z.problem}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
