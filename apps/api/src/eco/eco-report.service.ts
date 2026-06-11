import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * C5 — raport energetyczny usługi liczony z REALNYCH metryk LVE
 * (`UsageMetric`: cpuUsageAvg w % rdzenia, memUsageAvgMb, bucketDurationS).
 *
 * WAŻNE (prawnie): wszystkie wartości to SZACUNKI oparte o jawne współczynniki
 * poniżej — UI musi je tak prezentować ("szacunek", z metodologią). Nie
 * składamy twierdzeń o "zielonej energii" dostawcy DC — raport pokazuje
 * zużycie i oszczędność WZGLĘDEM stałej alokacji (VPS/dedyk o parametrach
 * planu działający 24/7), co wynika wprost z arytmetyki, nie z deklaracji.
 */

/** Pobór mocy 1 rdzenia x86 pod obciążeniem (konserwatywnie, W). */
const WATTS_PER_CORE = 10;
/** Pobór RAM (W na 1 GB) — typowe DDR4. */
const WATTS_PER_GB_RAM = 0.35;
/** Power Usage Effectiveness — narzut chłodzenia/zasilania DC. */
const PUE = 1.3;
/** Średnia emisyjność energii w PL (kg CO₂e / kWh, KOBiZE 2024 ~0.597). */
const CO2_KG_PER_KWH = 0.6;
/** Roczna absorpcja CO₂ jednego drzewa (kg) — szacunek ~21 kg/rok. */
const TREE_KG_PER_YEAR = 21;

const REPORT_DAYS = 30;

export interface EcoReport {
  periodDays: number;
  samples: number;
  /** Rzeczywiste zużycie z metryk. */
  cpuCoreHours: number;
  avgRamGb: number;
  /** Szacowane zużycie energii usługi (kWh, z PUE). */
  energyKwh: number;
  co2Kg: number;
  /** Punkt odniesienia: stała alokacja parametrów planu 24/7 (VPS-like). */
  baselineEnergyKwh: number;
  savedEnergyKwh: number;
  savedCo2Kg: number;
  /** Ekwiwalent: ile "miesięcy pracy drzewa" odpowiada oszczędności. */
  treeMonthsEquivalent: number;
  ecoModeEnabled: boolean;
  methodology: string;
}

@Injectable()
export class EcoReportService {
  constructor(private readonly prisma: PrismaService) {}

  async reportForSubscription(subscriptionId: string, userId: string): Promise<EcoReport> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { plan: true, account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) {
      throw new BadRequestException('Raport EKO będzie dostępny po aktywacji konta hostingowego.');
    }

    const since = new Date(Date.now() - REPORT_DAYS * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.usageMetric.findMany({
      where: { subscriptionId, bucketStart: { gte: since } },
      select: { cpuUsageAvg: true, memUsageAvgMb: true, bucketDurationS: true },
    });

    // Rzeczywiste zużycie: Σ(cpu% / 100 × czas bucketa) → rdzenio-godziny.
    let cpuCoreSeconds = 0;
    let ramGbSeconds = 0;
    let coveredSeconds = 0;
    for (const r of rows) {
      const dur = r.bucketDurationS || 60;
      cpuCoreSeconds += (r.cpuUsageAvg / 100) * dur;
      ramGbSeconds += (r.memUsageAvgMb / 1024) * dur;
      coveredSeconds += dur;
    }
    const cpuCoreHours = cpuCoreSeconds / 3600;
    const avgRamGb = coveredSeconds > 0 ? ramGbSeconds / coveredSeconds : 0;
    const coveredHours = coveredSeconds / 3600;

    const energyKwh =
      ((cpuCoreHours * WATTS_PER_CORE + avgRamGb * WATTS_PER_GB_RAM * coveredHours) / 1000) * PUE;
    const co2Kg = energyKwh * CO2_KG_PER_KWH;

    // Baseline: plan jako stała alokacja 24/7 przez cały okres raportu
    // (tak liczy się VPS o parametrach planu).
    const periodHours = REPORT_DAYS * 24;
    const planCores = sub.plan.cpuLimit / 100;
    const planRamGb = sub.plan.ramLimitMb / 1024;
    const baselineEnergyKwh =
      ((planCores * WATTS_PER_CORE + planRamGb * WATTS_PER_GB_RAM) * periodHours / 1000) * PUE;

    const savedEnergyKwh = Math.max(0, baselineEnergyKwh - energyKwh);
    const savedCo2Kg = savedEnergyKwh * CO2_KG_PER_KWH;
    const treeMonthsEquivalent = savedCo2Kg / (TREE_KG_PER_YEAR / 12);

    return {
      periodDays: REPORT_DAYS,
      samples: rows.length,
      cpuCoreHours: round2(cpuCoreHours),
      avgRamGb: round2(avgRamGb),
      energyKwh: round3(energyKwh),
      co2Kg: round3(co2Kg),
      baselineEnergyKwh: round3(baselineEnergyKwh),
      savedEnergyKwh: round3(savedEnergyKwh),
      savedCo2Kg: round3(savedCo2Kg),
      treeMonthsEquivalent: round2(treeMonthsEquivalent),
      ecoModeEnabled: sub.ecoModeEnabled,
      methodology:
        `Szacunek z rzeczywistych metryk CloudLinux LVE (próbki co 60 s): ` +
        `CPU ${WATTS_PER_CORE} W/rdzeń, RAM ${WATTS_PER_GB_RAM} W/GB, PUE ${PUE}, ` +
        `emisyjność ${CO2_KG_PER_KWH} kg CO₂e/kWh (śr. PL). Punkt odniesienia: ` +
        `serwer o parametrach planu zaalokowany na stałe 24/7.`,
    };
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
