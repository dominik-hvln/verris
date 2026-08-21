'use client';

import { useEffect, useState } from 'react';
import type { AutoscalingCatalogResource } from './actions';
import { simulatePricingAction } from './actions';

const SAMPLE: Record<AutoscalingCatalogResource, { cpu: number; ram: number; disk: number }> = {
  CPU: { cpu: 50, ram: 0, disk: 0 },
  RAM: { cpu: 0, ram: 2, disk: 0 },
  DISK: { cpu: 0, ram: 0, disk: 10 },
};

export function PricingSimulator({
  resource,
  pricePerUnit,
  thresholdAbove,
}: {
  resource: AutoscalingCatalogResource;
  pricePerUnit: string;
  thresholdAbove: string;
}) {
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const price = Number.parseFloat(pricePerUnit.replace(',', '.'));
    const threshold = Number.parseInt(thresholdAbove, 10);
    if (Number.isNaN(price) || Number.isNaN(threshold)) {
      setResult(null);
      return;
    }

    const sample = SAMPLE[resource];
    const timer = setTimeout(() => {
      void simulatePricingAction({
        cpuPercent: sample.cpu,
        ramGb: sample.ram,
        diskGb: sample.disk,
        draftResource: resource,
        draftPricePerUnit: price,
        draftThresholdAbove: threshold,
      }).then((res) => {
        if ('ok' in res && res.ok && res.data) {
          const b = res.data.breakdown;
          setResult(
            `Przykład (Δ CPU ${sample.cpu}%, RAM ${sample.ram} GB, dysk ${sample.disk} GB): ` +
              `${b.totalHourly} PLN/h (CPU ${b.cpuHourly}, RAM ${b.ramHourly}, dysk ${b.diskHourly}) · ` +
              `~${res.data.monthly} PLN/mies.`,
          );
        } else {
          setResult(null);
        }
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [resource, pricePerUnit, thresholdAbove]);

  if (!result) return null;
  return (
    <p className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-[11px] text-indigo-100/90">
      {result}
    </p>
  );
}
