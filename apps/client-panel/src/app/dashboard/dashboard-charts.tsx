'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCredits } from '@/lib/credits';
import type { DashboardSnapshot } from './dashboard-data';
import {
  buildEcoLedgerSeries,
  buildServiceHealthSeries,
  buildServiceStatusSeries,
  buildTicketStatusSeries,
  mapWalletMonthlyFlow,
} from './dashboard-chart-utils';

type DashboardChartsProps = {
  snapshot: DashboardSnapshot;
  showEco?: boolean;
};

export function DashboardCharts({ snapshot, showEco = false }: DashboardChartsProps) {
  const walletSeries = useMemo(
    () => mapWalletMonthlyFlow(snapshot.wallet?.monthlyFlowLast12 ?? []),
    [snapshot.wallet?.monthlyFlowLast12],
  );
  const serviceSeries = useMemo(() => buildServiceStatusSeries(snapshot.services), [snapshot.services]);
  const ecoSeries = useMemo(() => buildEcoLedgerSeries(snapshot.ecoLedger), [snapshot.ecoLedger]);
  const healthSeries = useMemo(() => buildServiceHealthSeries(snapshot.services), [snapshot.services]);
  const ticketSeries = useMemo(() => buildTicketStatusSeries(snapshot.tickets), [snapshot.tickets]);

  const walletHasActivity = walletSeries.some((d) => d.inflow > 0 || d.outflow > 0);
  const ecoHasActivity = ecoSeries.some((d) => d.gained > 0 || d.spent > 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Wykresy i trendy</h2>
          <p className="text-sm text-neutral-500">
            Dane z Twojego konta — portfel, usługi{showEco ? ', program EKO' : ''} i zgłoszenia. Najedź na element,
            aby zobaczyć szczegóły.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Portfel — przepływy (12 mies.)"
          subtitle={
            snapshot.wallet
              ? `Doładowania 30 dni: ${formatCredits(snapshot.wallet.totalTopupLast30d)} · Wydatki: ${formatCredits(snapshot.wallet.totalChargesLast30d)}`
              : 'Brak danych portfela'
          }
          className="lg:col-span-2"
          href="/dashboard/billing"
          linkLabel="Portfel i płatności"
        >
          {snapshot.wallet && walletHasActivity ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={walletSeries} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#a3a3a3', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={56}
                />
                <YAxis
                  tick={{ fill: '#737373', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v} K`}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(16,185,129,0.08)' }} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#a3a3a3' }} />
                <Bar
                  dataKey="inflow"
                  name="Wpływy"
                  fill="#34d399"
                  radius={[6, 6, 0, 0]}
                  animationDuration={900}
                  animationEasing="ease-out"
                />
                <Bar
                  dataKey="outflow"
                  name="Wydatki"
                  fill="#f87171"
                  radius={[6, 6, 0, 0]}
                  animationDuration={900}
                  animationBegin={120}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty
              message={
                snapshot.wallet
                  ? 'Brak zakończonych transakcji w ostatnich 12 miesiącach — doładuj portfel lub opłać usługę.'
                  : 'Nie udało się pobrać historii portfela.'
              }
            />
          )}
        </ChartCard>

        <ChartCard
          title="Usługi hostingowe"
          subtitle={`${snapshot.services.length} w systemie`}
          href="/dashboard/services"
          linkLabel="Moje usługi"
        >
          {serviceSeries.length > 0 ? (
            <ServiceStatusPie data={serviceSeries} />
          ) : (
            <ChartEmpty message="Nie masz jeszcze usług — zamów pierwszą usługę hostingową." />
          )}
        </ChartCard>

        {showEco ? (
          <ChartCard
            title="Punkty EKO (14 dni)"
            subtitle={`Aktualnie: ${snapshot.profile?.ecoPoints ?? snapshot.ecoProgram?.ecoPoints ?? 0} pkt`}
            className="lg:col-span-2"
            href="/dashboard/eco"
            linkLabel="Program EKO"
          >
            {ecoHasActivity ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={ecoSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ecoGain" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ecoSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f87171" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#a3a3a3', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#a3a3a3' }} />
                  <Area
                    type="monotone"
                    dataKey="gained"
                    name="Zdobyte"
                    stroke="#34d399"
                    fill="url(#ecoGain)"
                    strokeWidth={2}
                    animationDuration={1000}
                  />
                  <Area
                    type="monotone"
                    dataKey="spent"
                    name="Wymienione"
                    stroke="#f87171"
                    fill="url(#ecoSpend)"
                    strokeWidth={2}
                    animationDuration={1000}
                    animationBegin={150}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty message="Brak ruchów punktów w ostatnich 14 dniach — włącz tryb EKO lub osadź badge." />
            )}
          </ChartCard>
        ) : null}

        <ChartCard
          title="Kondycja usług"
          subtitle="Wynik health check (0–100)"
          href="/dashboard/services"
          linkLabel="Szczegóły usług"
        >
          {healthSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={healthSeries} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#737373', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={88}
                  tick={{ fill: '#a3a3a3', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip valueSuffix=" pkt" />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="score" name="Wynik" radius={[0, 8, 8, 0]} animationDuration={850}>
                  {healthSeries.map((entry) => (
                    <Cell key={entry.id} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : snapshot.services.length > 0 ? (
            <ChartEmpty message="Wyniki health check pojawią się po pierwszym skanowaniu usług." />
          ) : (
            <ChartEmpty message="Brak usług do wyświetlenia." />
          )}
        </ChartCard>

        {ticketSeries.length > 0 ? (
          <ChartCard
            title="Zgłoszenia do BOK"
            subtitle={`${snapshot.tickets.length} łącznie`}
            className="lg:col-span-3"
            href="/dashboard/support"
            linkLabel="Centrum Pomocy"
          >
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={ticketSeries}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={88}
                  paddingAngle={3}
                  animationDuration={800}
                >
                  {ticketSeries.map((entry) => (
                    <Cell key={entry.status} fill={entry.fill} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#a3a3a3' }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : null}
      </div>
    </section>
  );
}

function ServiceStatusPie({
  data,
}: {
  data: { status: string; name: string; value: number; fill: string }[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={62}
          outerRadius={96}
          paddingAngle={4}
          activeIndex={activeIndex}
          onMouseEnter={(_, index) => setActiveIndex(index)}
          animationDuration={750}
          animationEasing="ease-out"
        >
          {data.map((entry) => (
            <Cell key={entry.status} fill={entry.fill} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, color: '#a3a3a3' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
  href,
  linkLabel,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <article
      className={`flex flex-col rounded-[24px] border border-white/10 bg-[#0a0a0a] p-5 md:p-6 ${className ?? ''}`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>
        </div>
        {href && linkLabel ? (
          <Link href={href} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">
            {linkLabel} →
          </Link>
        ) : null}
      </div>
      <div className="min-h-[200px] flex-1">{children}</div>
    </article>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 px-6 text-center text-sm text-neutral-500">
      {message}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  valueSuffix = ' K',
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  valueSuffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/15 bg-[#111] px-3 py-2 text-xs shadow-xl">
      {label ? <p className="mb-1.5 font-medium text-neutral-300">{label}</p> : null}
      <ul className="space-y-1">
        {payload.map((item) => (
          <li key={String(item.name)} className="flex items-center gap-2 text-neutral-200">
            <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
            <span>{item.name}:</span>
            <span className="font-mono font-semibold tabular-nums text-white">
              {typeof item.value === 'number' ? `${item.value}${valueSuffix}` : item.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
