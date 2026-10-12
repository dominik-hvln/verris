import type { DaLimit, DaUserLimits } from '@verris/directadmin-sdk';
import {
  LIMITY_INDYWIDUALNE,
  POLA_LIMITOW,
  walidujLimityIndywidualne,
  type LimityIndywidualne,
  type PoleLimitu,
  type PozycjaLimitu,
} from '@verris/contracts';
import { buildDaPackageSpecFromPlan, type PlanResourceFields } from '../servers/da-package-spec.js';

/**
 * K3 (PB-53.5) — limity indywidualne jednej usługi: efektywne limity = plan + nadpisania (Subscription.limitOverrides).
 *
 * Jedno miejsce wyliczenia dla wszystkich, którzy czytają limity planu TEJ usługi: autoskalowanie (baza dysku), prognoza
 * zasobów, plan drenażu węzła, karta usługi klienta i admina. Na węzeł limity idą jednym zapisem konta
 * (`customizeUserLimits` — CMD_API_MODIFY_USER action=customize), z tego samego opisu pakietu co provisioning
 * (`buildDaPackageSpecFromPlan`), więc pola, których administrator nie nadpisał, zostają jak w planie.
 */

/** Nadpisania z bazy (JSON). Zapis zawsze przechodzi walidację — tu odczyt odrzuca tylko śmieci (wtedy: plan). */
export function nadpisaniaZBazy(json: unknown): LimityIndywidualne {
  const w = walidujLimityIndywidualne(json);
  return w.ok ? w.limity : {};
}

export const maNadpisania = (json: unknown): boolean => Object.keys(nadpisaniaZBazy(json)).length > 0;

/** Plan z podmienionym dyskiem i transferem — dla kodu, który czyta `plan.diskLimitMb` / `plan.includedTransferGb`. */
export function planZNadpisaniami<T extends { diskLimitMb: number; includedTransferGb: number | null }>(plan: T, json: unknown): T {
  const n = nadpisaniaZBazy(json);
  if (n.diskLimitMb === undefined && n.includedTransferGb === undefined) return plan;
  return {
    ...plan,
    diskLimitMb: n.diskLimitMb ?? plan.diskLimitMb,
    includedTransferGb: n.includedTransferGb ?? plan.includedTransferGb,
  };
}

/**
 * Limity konta na węźle: opis pakietu planu z nadpisaniami. Quota dysku = baza (plan albo nadpisanie) + nadwyżka
 * autoskalowania (`scaledDiskMb`) — tak samo jak Account.diskLimitMb i zapis autoskalowania (setAccountLimits).
 */
export function limityKontaNaWezle(plan: PlanResourceFields, json: unknown, scaledDiskMb: number): DaUserLimits {
  const n = nadpisaniaZBazy(json);
  const spec = buildDaPackageSpecFromPlan(planZNadpisaniami(plan, n));
  return {
    diskQuotaMb: typeof spec.diskQuotaMb === 'number' ? spec.diskQuotaMb + Math.max(0, scaledDiskMb) : spec.diskQuotaMb,
    bandwidthMb: spec.bandwidthMb,
    domains: n.domains ?? spec.domains,
    subdomains: spec.subdomains,
    emailAccounts: n.emailAccounts ?? spec.emailAccounts,
    emailForwarders: spec.emailForwarders,
    mailingLists: spec.mailingLists,
    autoresponders: spec.autoresponders,
    databases: n.databases ?? spec.databases,
    domainPointers: spec.domainPointers,
    ftpAccounts: spec.ftpAccounts,
  };
}

const zLimitu = (v: DaLimit): number | null => (v === 'unlimited' ? null : v);

/** Wartości planu dla pól formularza (`null` = bez limitu). */
export function limityPlanu(plan: PlanResourceFields): Record<PoleLimitu, number | null> {
  const spec = buildDaPackageSpecFromPlan(plan);
  return {
    diskLimitMb: plan.diskLimitMb,
    includedTransferGb: plan.includedTransferGb && plan.includedTransferGb > 0 ? plan.includedTransferGb : null,
    domains: zLimitu(spec.domains),
    emailAccounts: zLimitu(spec.emailAccounts),
    databases: zLimitu(spec.databases),
  };
}

/** Wszystkie pola: plan, nadpisanie, efektywny (karta usługi admina). */
export function opisLimitow(plan: PlanResourceFields, json: unknown): PozycjaLimitu[] {
  const p = limityPlanu(plan);
  const n = nadpisaniaZBazy(json);
  return POLA_LIMITOW.map((pole) => ({
    pole,
    etykieta: LIMITY_INDYWIDUALNE[pole].etykieta,
    plan: p[pole],
    nadpisanie: n[pole] ?? null,
    efektywny: n[pole] ?? p[pole],
  }));
}

/** Tylko nadpisane pola (panel klienta: „Limity ustalone indywidualnie”). */
export const limityIndywidualneDlaKlienta = (plan: PlanResourceFields, json: unknown): PozycjaLimitu[] =>
  opisLimitow(plan, json).filter((p) => p.nadpisanie !== null);

/**
 * Nadpisania do zapisu: pola równe planowi wypadają (to nie jest limit indywidualny). Pusty wynik = limity planu.
 */
export function nadpisaniaDoZapisu(plan: PlanResourceFields, limity: LimityIndywidualne): LimityIndywidualne {
  const p = limityPlanu(plan);
  const out: LimityIndywidualne = {};
  for (const pole of POLA_LIMITOW) {
    const v = limity[pole];
    if (v !== undefined && v !== p[pole]) out[pole] = v;
  }
  return out;
}

export const takieSame = (a: LimityIndywidualne, b: LimityIndywidualne): boolean =>
  POLA_LIMITOW.every((pole) => (a[pole] ?? null) === (b[pole] ?? null));
