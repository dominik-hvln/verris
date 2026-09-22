'use client';

/**
 * PB-15 — pulpit w nowym wyglądzie (wzorzec: docs/design/wzorzec-panelu.html).
 * Tylko dane ze snapshotu; każdy błąd zapytania czytelnie jako „—" + baner (X-39).
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, ChevronRight, Plus } from 'lucide-react';
import type { ServiceSummaryDto } from '@verris/contracts';
import { CREDIT_RATE_INFO, formatCredits } from '@/lib/credits';
import { clientFeatures } from '@/lib/client-features';
import {
  Box,
  DualBars,
  Kpi,
  KpiStrip,
  Label,
  MiniBars,
  SectionHead,
  Squares,
  StackBar,
  StatusPill,
  comet,
  lastDaysLabels,
  tip,
  type Tone,
} from '@/components/panel/v2';
import { deriveReasons } from './services-health-overview';
import { SERVICE_STATUS_LABEL, buildEcoLedgerSeries, mapWalletMonthlyFlow } from './dashboard-chart-utils';
import type { DashboardSnapshot } from './dashboard-data';

const BTN =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-line-strong bg-card px-3 py-2 text-sm font-medium text-foreground hover:border-primary';
const BTN_PRIMARY =
  'inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-primary bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground';
const TH = 'px-3 pb-2.5 pt-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground';
const TD = 'border-t border-line px-3 py-3';

const KIND: Record<ServiceSummaryDto['productKind'], string> = {
  HOSTING: 'Hosting',
  EMAIL: 'Poczta',
  EMAIL_MARKETING: 'E-mail marketing',
};

function serviceHref(s: ServiceSummaryDto) {
  return `/dashboard/services/${s.id}?kind=${s.productKind ?? 'HOSTING'}`;
}

function date(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) : '—';
}

/** Stan usługi do kropki: działa / wymaga uwagi / nieaktywna. */
function serviceTone(s: ServiceSummaryDto): { tone: Tone; text: string } {
  if (s.status !== 'ACTIVE') return { tone: s.status === 'PROVISIONING' ? 'muted' : 'warn', text: SERVICE_STATUS_LABEL[s.status] ?? s.status };
  const reasons = deriveReasons(s);
  if (reasons.length > 0 || s.health?.label === 'attention' || s.health?.label === 'critical') {
    return { tone: 'warn', text: reasons[0] ?? 'wymaga uwagi' };
  }
  return { tone: 'data', text: 'działa' };
}

/** Punkty kontroli zdrowia (tylko te, które API zmierzyło — `null` pomijamy). */
function checks(s: ServiceSummaryDto): { label: string; ok: boolean }[] {
  const c = s.health?.checks;
  if (!c) return [];
  const email = s.productKind === 'EMAIL';
  const all: [string, boolean | null][] = [
    [email ? 'DNS poczty' : 'DNS', c.dnsOk],
    ['SSL', email ? null : c.tlsOk],
    ['Kopie', c.backupFresh],
    ['Zasoby', c.lveOk],
    ['Panel', c.panelTlsOk],
    ['Poczta', c.mailOk],
  ];
  return all.filter((x): x is [string, boolean] => x[1] !== null).map(([label, ok]) => ({ label, ok }));
}

export function DashboardHome({ snapshot, aside }: { snapshot: DashboardSnapshot; aside?: ReactNode }) {
  const firstName = snapshot.profile?.firstName || '';
  const services = snapshot.services.filter((s) => s.status !== 'CANCELED' && s.status !== 'EXPIRED');
  const domains = snapshot.domains;
  // Spis wszystkiego, co nie wróciło — kolejność jak kafelki (X-39).
  const awarie = (
    [
      ['Profil i saldo', snapshot.errors.profile],
      ['Usługi', snapshot.errors.services],
      ['Domeny', snapshot.errors.domains],
      ['Program EKO', snapshot.errors.ecoProgram],
      ['Historia portfela', snapshot.errors.wallet],
      ['Historia punktów EKO', snapshot.errors.ecoLedger],
      ['Zgłoszenia', snapshot.errors.tickets],
    ] as ReadonlyArray<readonly [string, string | undefined]>
  ).filter((p): p is readonly [string, string] => Boolean(p[1]));

  const tones = services.map(serviceTone);
  const ok = tones.filter((t) => t.tone === 'data').length;
  const attention = tones.length - ok;
  const nextRenewal = services
    .map((s) => s.currentPeriodEnd)
    .filter((d): d is string => !!d)
    .sort()[0];

  const flow = mapWalletMonthlyFlow(snapshot.wallet?.monthlyFlowLast12 ?? []);
  const eco = buildEcoLedgerSeries(snapshot.ecoLedger);
  const ecoUnknown = Boolean(snapshot.errors.profile && snapshot.errors.ecoProgram);
  const ecoPoints = snapshot.profile?.ecoPoints ?? snapshot.ecoProgram?.ecoPoints ?? 0;
  const days7 = lastDaysLabels(7);
  const ticketsPerDay = days7.map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toDateString();
    return snapshot.tickets.filter((t) => new Date(t.createdAt).toDateString() === key).length;
  });

  // Asystent: najważniejsza rekomendacja ze wszystkich usług (to samo źródło co wcześniej ProactiveHints).
  const hints = services
    .flatMap((s) =>
      (s.recommendations ?? [])
        .filter((r) => r.severity === 'warning' || r.severity === 'critical')
        .map((r) => ({ s, r })),
    )
    .sort((a, b) => (b.r.severity === 'critical' ? 1 : 0) - (a.r.severity === 'critical' ? 1 : 0));
  const next = hints[0];

  const walletFoot = (
    <>
      <span data-tip={CREDIT_RATE_INFO}>{snapshot.errors.wallet ? 'historia chwilowo niedostępna' : 'wydatki z 12 miesięcy'}</span>
      <Link href="/dashboard/billing" className="text-[12.5px] font-semibold text-primary underline underline-offset-[3px]">
        Doładuj
      </Link>
    </>
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 pb-10">
      {/* Nagłówek */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Label>
            Pulpit ·{' '}
            <span suppressHydrationWarning>
              {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </Label>
          <h1 className="mb-2 mt-1.5 font-display text-[clamp(28px,4vw,40px)] font-extrabold leading-none tracking-[-0.03em]">
            <span className="v2-hello">
              Cześć{firstName ? `, ${firstName}` : ''}!
            </span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13.5px] text-muted-foreground">
            {snapshot.errors.services ? (
              <span>Stan usług chwilowo nieznany</span>
            ) : services.length === 0 ? (
              <span>Nie masz jeszcze usług — zacznij od nowej.</span>
            ) : (
              <>
                {ok > 0 ? <StatusPill tone="data">{ok === 1 ? '1 usługa działa' : `${ok} usługi działają`}</StatusPill> : null}
                {attention > 0 ? <StatusPill tone="warn">{attention === 1 ? '1 wymaga uwagi' : `${attention} wymagają uwagi`}</StatusPill> : null}
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/services/new" className={BTN_PRIMARY}>
            <Plus className="h-4 w-4" /> Nowa usługa
          </Link>
          <Link href="/dashboard/domains/buy" className={BTN}>
            Kup domenę
          </Link>
        </div>
      </header>

      {awarie.length > 0 ? (
        <div className="flex items-start gap-3 rounded-[10px] border border-crit/30 bg-crit/5 p-4 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-crit" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold">Część danych jest chwilowo niedostępna</p>
            {awarie.map(([etykieta, komunikat]) => (
              <p key={etykieta} className="text-muted-foreground">
                {etykieta}: {komunikat}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {/* Pasek liczb */}
      <div className="v2-comet rounded-[10px]" style={comet('a', 13, -2, 0.55)}>
        <KpiStrip>
          <Kpi
            label="Usługi"
            value={snapshot.errors.services ? '—' : String(services.filter((s) => s.status === 'ACTIVE').length)}
            unit="aktywne"
            foot={<span>{nextRenewal ? `najbliższe odnowienie ${date(nextRenewal)}` : 'brak zaplanowanych odnowień'}</span>}
          >
            <StackBar
              total={Math.max(1, services.length)}
              parts={[
                { label: `${ok} działa`, value: ok, color: 'var(--data)', detail: services.filter((_, i) => tones[i]!.tone === 'data').map((s) => s.planName).join(', ') },
                { label: `${attention} wymaga uwagi`, value: attention, color: 'var(--warn)', detail: services.filter((_, i) => tones[i]!.tone !== 'data').map((s) => `${s.planName}: ${serviceTone(s).text}`).join(', ') },
              ]}
            />
          </Kpi>
          <Kpi
            label="Domeny"
            value={snapshot.errors.domains ? '—' : String(domains.length)}
            foot={<span>{snapshot.errors.domains ? 'błąd pobierania' : `${domains.filter((d) => d.status === 'ACTIVE').length} aktywnych`}</span>}
          >
            {domains.length > 0 ? (
              <Squares
                items={domains.slice(0, 14).map((d) => ({
                  tone: d.status === 'ACTIVE' ? 'data' : d.status === 'EXPIRED' ? 'warn' : 'muted',
                  tip: tip(d.name, d.status === 'ACTIVE' ? 'aktywna' : d.status === 'EXPIRED' ? 'wygasła' : 'w trakcie'),
                }))}
              />
            ) : null}
          </Kpi>
          <Kpi
            label="Saldo portfela"
            value={snapshot.errors.profile ? '—' : formatCredits(snapshot.profile?.walletBalance ?? 0)}
            foot={walletFoot}
          >
            {flow.length > 0 ? (
              <MiniBars values={flow.map((p) => p.outflow)} labels={flow.map((p) => p.label)} unit="K wydatków" format={(v) => v.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} />
            ) : null}
          </Kpi>
          <Kpi
            label="Otwarte zgłoszenia"
            value={snapshot.errors.tickets ? '—' : String(snapshot.openTickets)}
            foot={<Link href="/dashboard/support" className="hover:text-foreground">Centrum pomocy →</Link>}
          >
            {snapshot.errors.tickets ? null : <MiniBars values={ticketsPerDay} labels={days7} unit="nowych zgłoszeń" />}
          </Kpi>
        </KpiStrip>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Twoje usługi */}
          <section>
            <SectionHead
              title="Twoje usługi"
              action={<Link href="/dashboard/services" className="text-[12.5px] font-semibold text-primary underline underline-offset-[3px]">Wszystkie usługi</Link>}
            />
            <div className="v2-comet overflow-x-auto rounded-[10px] border border-line bg-card" style={comet('b', 18, -4, 0.4)}>
              {snapshot.errors.services ? (
                <p className="px-4 py-5 text-sm text-muted-foreground">Nie udało się pobrać usług — spróbuj odświeżyć stronę.</p>
              ) : services.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5">
                  <p className="text-sm text-muted-foreground">Tu pojawią się Twoje usługi: hosting, poczta, newsletter.</p>
                  <Link href="/dashboard/services/new" className={BTN_PRIMARY}>Zamów pierwszą usługę</Link>
                </div>
              ) : (
                <table className="v2-stack w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={TH}>Usługa</th>
                      <th className={TH}>Stan</th>
                      <th className={TH}>Odnowienie</th>
                      <th className={TH}>Cena</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s, i) => {
                      const t = tones[i]!;
                      return (
                        <tr key={s.id} className="group hover:bg-raised/50">
                          <td className={TD} data-label="Usługa">
                            <Link href={serviceHref(s)} className="flex flex-col">
                              <b className="whitespace-nowrap font-semibold text-foreground">{s.planName}</b>
                              <small className="whitespace-nowrap text-[12.5px] text-muted-foreground">
                                {KIND[s.productKind]}
                                {s.account?.domain ? ` · ${s.account.domain}` : ''}
                              </small>
                            </Link>
                          </td>
                          <td className={TD} data-label="Stan">
                            <span className={`inline-flex items-center gap-[7px] text-[12.5px] font-semibold ${t.tone === 'data' ? 'text-data-hi' : t.tone === 'warn' ? 'text-warn' : 'text-muted-foreground'}`}>
                              <span
                                className={`h-[7px] w-[7px] rounded-full bg-current ${t.tone === 'data' ? 'v2-breathe' : t.tone === 'warn' ? 'v2-breathe v2-breathe-warn' : ''}`}
                                style={{ ['--v2-i' as string]: i }}
                              />
                              {t.text}
                            </span>
                          </td>
                          <td className={`${TD} tabular-nums`} data-label="Odnowienie">{date(s.currentPeriodEnd)}</td>
                          <td className={`${TD} whitespace-nowrap tabular-nums`} data-label="Cena">
                            {Number(s.priceAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {s.currency === 'PLN' ? 'zł' : s.currency}
                            {s.interval === 'MONTH' ? ' / mies.' : ' / rok'}
                          </td>
                          <td className={`${TD} w-8`}>
                            <Link href={serviceHref(s)} aria-label={`Otwórz ${s.planName}`} className="text-muted-foreground group-hover:text-primary">
                              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Zdrowie usług */}
          {snapshot.errors.services || services.length === 0 ? null : (
            <section>
              <SectionHead title="Zdrowie usług" desc="Sprawdzamy je regularnie. Najedź na punkt, żeby zobaczyć, co jest nie tak." />
              <div className="rounded-[10px] border border-line bg-card">
                {services.map((s, i) => {
                  const score = s.health?.score;
                  const color = score == null ? 'text-muted-foreground' : score >= 90 ? 'text-data-hi' : score >= 70 ? 'text-warn' : 'text-crit';
                  const reasons = deriveReasons(s);
                  return (
                    <div key={s.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 border-line px-4 py-3 [&+&]:border-t">
                      <div className={`min-w-[52px] font-display text-[28px] font-extrabold leading-none tracking-[-0.03em] tabular-nums ${color}`} data-tip={s.health?.summary ?? undefined}>
                        {score ?? '—'}
                        <small className="mt-1 block font-mono text-[11px] font-medium tracking-normal text-muted-foreground">/ 100</small>
                      </div>
                      <div className="min-w-0">
                        <b className="text-sm font-semibold text-foreground">{s.planName}</b>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {checks(s).map((c, j) => (
                            <span
                              key={c.label}
                              tabIndex={0}
                              data-tip={tip(`${c.label}: ${c.ok ? 'w porządku' : 'do poprawy'}`, c.ok ? undefined : reasons.find((r) => r.toLowerCase().includes(c.label.toLowerCase().split(' ')[0]!)))}
                              className={`inline-flex cursor-default items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-foreground ${c.ok ? 'border-line' : 'border-warn/45'}`}
                            >
                              <i
                                className={`h-[7px] w-[7px] rounded-full ${c.ok ? 'v2-breathe bg-data' : 'v2-breathe v2-breathe-warn bg-warn'}`}
                                style={{ ['--v2-i' as string]: (i * 7 + j * 3) % 9 }}
                              />
                              {c.label}
                            </span>
                          ))}
                          {checks(s).length === 0 ? <span className="text-xs text-muted-foreground">pierwszy pomiar w toku</span> : null}
                        </div>
                      </div>
                      <Link href={serviceHref(s)} aria-label={`Szczegóły ${s.planName}`} className="text-muted-foreground hover:text-primary">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Portfel 12 miesięcy */}
          <section>
            <SectionHead title="Portfel · 12 miesięcy" desc="Doładowania i wydatki miesiąc po miesiącu. Najedź na słupek." />
            <div className="rounded-[10px] border border-line bg-card px-4 pb-3 pt-3.5">
              {snapshot.errors.wallet ? (
                <p className="py-4 text-sm text-muted-foreground">Historia portfela chwilowo niedostępna.</p>
              ) : flow.some((p) => p.inflow > 0 || p.outflow > 0) ? (
                <>
                  <DualBars labels={flow.map((p) => p.label)} a={flow.map((p) => p.inflow)} b={flow.map((p) => p.outflow)} aLabel="doładowania" bLabel="wydatki" />
                  <div className="flex gap-4 pt-1 text-[12.5px] text-muted-foreground">
                    <span><i className="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-data-soft" />doładowania</span>
                    <span><i className="mr-1.5 inline-block h-2 w-2 rounded-[2px] bg-data" />wydatki</span>
                  </div>
                </>
              ) : (
                <p className="py-4 text-sm text-muted-foreground">Na razie brak ruchu w portfelu. <Link href="/dashboard/billing" className="text-primary underline">Doładuj portfel</Link></p>
              )}
            </div>
          </section>
        </div>

        {/* Prawa kolumna */}
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Asystent">
            <SectionHead title="Asystent" />
            <div className="v2-comet rounded-xl border border-primary/30 bg-card p-4 shadow-[0_0_0_1px_rgba(52,229,160,0.08),0_18px_40px_-22px_rgba(0,0,0,0.8)]" style={comet('b', 10, -6, 0.8)}>
              <Label className="mb-2">{next ? 'następny krok' : 'na dziś'}</Label>
              {next ? (
                <>
                  <p className="mb-3 text-[14.5px] text-foreground">
                    <b className="font-semibold">{next.r.title}</b>
                    <span className="text-muted-foreground"> · {next.s.account?.domain ?? next.s.planName}</span>
                    <br />
                    <span className="text-[13.5px] text-muted-foreground">{next.r.body}</span>
                  </p>
                  <Link href={serviceHref(next.s)} className={BTN_PRIMARY.replace('px-3 py-2 text-sm', 'px-2.5 py-1.5 text-[13px]')}>
                    Przejdź <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  {hints.length > 1 ? <p className="mt-3 text-[12.5px] text-muted-foreground">i jeszcze {hints.length - 1} — w sekcji „Zdrowie usług”.</p> : null}
                </>
              ) : (
                <p className="text-[14.5px] text-foreground">
                  Wszystko pod kontrolą. Pilnujemy DNS, SSL, kopii i obciążenia — damy znać, gdy coś będzie wymagać uwagi.
                </p>
              )}
            </div>
          </section>

          {aside}

          <Box title="Szybkie akcje">
            <div className="p-4 pt-3">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line max-sm:grid-cols-1">
                {[
                  ['Domeny i DNS', 'przypisanie do usług', '/dashboard/domains'],
                  ['Portfel i płatności', 'doładuj, faktury', '/dashboard/billing'],
                  ['Przenieś stronę', 'migracja od innego hostingu', '/dashboard/migrations'],
                  ['Nowe zgłoszenie', 'Centrum pomocy', '/dashboard/support/new'],
                ].map(([t, d, href]) => (
                  <Link key={href} href={href!} className="flex flex-col gap-0.5 bg-card px-3.5 py-3 hover:bg-raised">
                    <b className="text-sm font-semibold text-foreground">{t}</b>
                    <small className="text-[12.5px] text-muted-foreground">{d}</small>
                  </Link>
                ))}
              </div>
            </div>
          </Box>

          {clientFeatures.eco ? (
            <div className="v2-comet rounded-[10px]" style={comet('c', 15, -10, 0.45)}>
            <Box
              title="Program EKO"
              action={<span className="font-mono text-xs text-muted-foreground">{ecoUnknown ? '—' : `${ecoPoints} pkt`}</span>}
            >
              <div className="px-4 pb-3.5 pt-2.5">
                {snapshot.errors.ecoLedger ? (
                  <p className="text-[12.5px] text-muted-foreground">Historia punktów chwilowo niedostępna.</p>
                ) : (
                  <MiniBars values={eco.map((d) => d.gained)} labels={eco.map((d) => d.label)} unit="pkt EKO" />
                )}
                <p className="mt-2 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
                  punkty z 14 dni ·{' '}
                  {ecoUnknown
                    ? 'stan programu nieznany'
                    : snapshot.ecoProgram?.hasEcoModeOnActiveService
                      ? `tryb EKO włączony na ${snapshot.ecoProgram.ecoModeOnActiveServices} usł.`
                      : 'tryb EKO wyłączony'}
                </p>
                <Link href="/dashboard/eco" className="mt-2 inline-block text-[12.5px] font-semibold text-primary underline underline-offset-[3px]">Program EKO →</Link>
              </div>
            </Box>
            </div>
          ) : null}

          <Box title="Hosting w skrócie">
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 px-4 pb-3.5 pt-2 text-[13.5px] [&>dd]:m-0 [&>dd]:py-1.5 [&>dd]:text-right [&>dd]:text-foreground [&>dt]:py-1.5 [&>dt]:text-muted-foreground">
              <dt>Autoskalowanie</dt>
              <dd>{snapshot.errors.services ? '—' : `${services.filter((s) => s.autoscalingEnabled).length} usł.`}</dd>
              {snapshot.ecoProgram?.referralProgramApproved ? (
                <>
                  <dt>Program partnerski</dt>
                  <dd><Link href="/dashboard/referral" className="text-primary underline">link polecający</Link></dd>
                </>
              ) : null}
            </dl>
          </Box>
        </div>
      </div>
    </div>
  );
}
