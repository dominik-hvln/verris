'use client';

import { useMemo, useState } from 'react';
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Zap,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { PriceRuleDto } from './types';
import { hourlyRateForResource } from './pricing-math';
import { CREDIT_SHORT } from '@/lib/credits';

interface Props {
  rules: PriceRuleDto[];
  initialCpuPercent?: number;
  initialRamGb?: number;
  initialDiskGb?: number;
}

const HOURS_PER_MONTH = 730;

export function AutoscalingCalculator({
  rules,
  initialCpuPercent = 50,
  initialRamGb = 0.5,
  initialDiskGb = 0,
}: Props) {
  const [cpuPercent, setCpuPercent] = useState(initialCpuPercent);
  const [ramGb, setRamGb] = useState(initialRamGb);
  const [diskGb, setDiskGb] = useState(initialDiskGb);

  const unit = CREDIT_SHORT;

  const breakdown = useMemo(() => {
    const cpuHourly = hourlyRateForResource(rules, 'CPU', cpuPercent);
    const ramHourly = hourlyRateForResource(rules, 'RAM', ramGb);
    const diskHourly = hourlyRateForResource(rules, 'DISK', diskGb);

    const hourly = cpuHourly + ramHourly + diskHourly;
    const daily = hourly * 24;
    const monthly = hourly * HOURS_PER_MONTH;

    return {
      cpuHourly,
      ramHourly,
      diskHourly,
      hourly,
      daily,
      monthly,
    };
  }, [rules, cpuPercent, ramGb, diskGb]);

  const noRules = rules.length === 0;

  return (
    <div className="w-full max-w-5xl mx-auto rounded-[32px] p-px relative overflow-hidden">
      <div className="bg-[#0a0a0a] relative h-full w-full rounded-[calc(32px-1px)] p-6 md:p-8 lg:flex lg:gap-10 items-stretch border border-white/10">
        <div className="lg:w-2/3 space-y-10">
          <div className="space-y-3">
            <h2 className="text-3xl font-extrabold text-white flex items-center gap-3">
              <Zap className="w-8 h-8 text-emerald-400" />
              Skonfiguruj scenariusz autoskalowania
            </h2>
            <p className="text-neutral-400 font-medium">
              Suwaki to delta ponad plan bazowy. CPU w %, RAM i dysk w GB — naliczanie
              godzinowe; gdy skalowanie spadnie, koszt też znika.
            </p>
          </div>

          <div className="space-y-8">
            <Slider
              icon={<Cpu className="w-5 h-5 text-emerald-400" />}
              label="Dodatkowa moc CPU (%)"
              hint="100% ≈ jeden rdzeń logiczny w pełnym burst"
              min={0}
              max={400}
              step={10}
              value={cpuPercent}
              setValue={setCpuPercent}
              formatValue={(v) => String(v)}
              suffix="%"
            />
            <Slider
              icon={<MemoryStick className="w-5 h-5 text-emerald-400" />}
              label="Dodatkowy RAM (GB)"
              hint="Limit pamięci ponad plan — krok 0,5 GB"
              min={0}
              max={32}
              step={0.5}
              value={ramGb}
              setValue={setRamGb}
              formatValue={(v) => v.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
              suffix=" GB"
            />
            <Slider
              icon={<HardDrive className="w-5 h-5 text-emerald-400" />}
              label="Dodatkowa przestrzeń dyskowa (GB)"
              hint="Powiększenie limitu dysku konta hostingowego — krok 1 GB"
              min={0}
              max={500}
              step={1}
              value={diskGb}
              setValue={setDiskGb}
              formatValue={(v) => String(v)}
              suffix=" GB"
            />
          </div>

          {noRules && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <div>
                <p className="font-semibold">Brak aktywnych reguł cennika</p>
                <p className="mt-0.5 text-xs text-amber-200/80">
                  Administrator nie skonfigurował jeszcze cennika autoskalowania.
                  Wszystkie kwoty pokazują 0,00 — gdy cennik zostanie dodany,
                  wartości pojawią się tutaj automatycznie.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="lg:w-1/3 mt-10 lg:mt-0">
          <div className="bg-[#121212] rounded-[24px] p-6 border border-white/5 shadow-2xl h-full flex flex-col">
            <h3 className="text-lg font-medium text-neutral-400 mb-6">
              Szacowany koszt
            </h3>

            <div className="mb-8">
              <div className="text-4xl font-extrabold text-white">
                {breakdown.monthly.toFixed(2)}{' '}
                <span className="text-2xl text-neutral-400">{unit}</span>
              </div>
              <p className="text-neutral-500 text-sm">
                / miesiąc (przy 100% utrzymaniu skalowania)
              </p>
            </div>

            <div className="space-y-3 mb-8 text-sm">
              <Row label="CPU" value={`${breakdown.cpuHourly.toFixed(4)} ${unit}/h`} />
              <Row label="RAM" value={`${breakdown.ramHourly.toFixed(4)} ${unit}/h`} />
              <Row label="Dysk" value={`${breakdown.diskHourly.toFixed(4)} ${unit}/h`} />
            </div>

            <div className="space-y-3 mb-8">
              <Bullet text="Brak długoterminowych umów" />
              <Bullet text="Skaluj w dowolnym momencie" />
              <Bullet text="Pełna izolacja zasobów między kontami" />
            </div>

            <div className="mt-auto pt-6 border-t border-white/10 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-neutral-400">Stawka godzinowa</span>
                <span className="text-white font-medium">
                  ~{breakdown.hourly.toFixed(4)} {unit}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-neutral-400">Stawka dobowa</span>
                <span className="text-white font-medium">
                  ~{breakdown.daily.toFixed(2)} {unit}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Slider({
  icon,
  label,
  hint,
  min,
  max,
  step,
  value,
  setValue,
  formatValue,
  suffix,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  setValue: (v: number) => void;
  formatValue: (v: number) => string;
  suffix: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center text-neutral-300">
        <div>
          <span className="flex items-center gap-2 font-semibold">
            {icon}
            {label}
          </span>
          {hint && (
            <span className="block ml-7 text-xs text-neutral-500 mt-0.5">{hint}</span>
          )}
        </div>
        <span className="text-xl font-bold text-white bg-white/5 px-3 py-1 rounded-xl shadow-inner border border-white/10 whitespace-nowrap">
          {formatValue(value)}
          <span className="text-sm font-medium text-neutral-400">{suffix}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-neutral-300">
      <span className="text-neutral-400">{label}</span>
      <span className="font-mono text-white text-xs">{value}</span>
    </div>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-300">
      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> {text}
    </div>
  );
}
