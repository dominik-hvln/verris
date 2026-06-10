import type { Plan } from '@verris/database';
import type { DaLimit, DaPackageSpec } from '@verris/directadmin-sdk';

/**
 * Per-plan product policy for the count-based DirectAdmin limits that are not
 * stored on the `Plan` model (domains, mailboxes, databases, …). Disk quota,
 * transfer and CloudLinux LVE limits always come from the `Plan` row itself.
 *
 * Keep this in sync with the customer-facing plan comparison. Unknown slugs
 * fall back to {@link DEFAULT_PACKAGE_POLICY} — a bounded, safe tier (never
 * "everything unlimited", which was the Node-PL-01 defect).
 */
export interface DaPackagePolicy {
  domains: DaLimit;
  subdomains: DaLimit;
  emailAccounts: DaLimit;
  emailForwarders: DaLimit;
  mailingLists: DaLimit;
  autoresponders: DaLimit;
  databases: DaLimit;
  domainPointers: DaLimit;
  ftpAccounts: DaLimit;
}

const DEFAULT_PACKAGE_POLICY: DaPackagePolicy = {
  domains: 1,
  subdomains: 25,
  emailAccounts: 25,
  emailForwarders: 25,
  mailingLists: 5,
  autoresponders: 25,
  databases: 5,
  domainPointers: 5,
  ftpAccounts: 10,
};

const PACKAGE_POLICY_BY_SLUG: Record<string, DaPackagePolicy> = {
  starter: {
    domains: 1,
    subdomains: 25,
    emailAccounts: 25,
    emailForwarders: 50,
    mailingLists: 5,
    autoresponders: 25,
    databases: 5,
    domainPointers: 5,
    ftpAccounts: 10,
  },
  pro: {
    domains: 10,
    subdomains: 100,
    emailAccounts: 200,
    emailForwarders: 'unlimited',
    mailingLists: 25,
    autoresponders: 100,
    databases: 25,
    domainPointers: 25,
    ftpAccounts: 50,
  },
  business: {
    domains: 'unlimited',
    subdomains: 'unlimited',
    emailAccounts: 'unlimited',
    emailForwarders: 'unlimited',
    mailingLists: 100,
    autoresponders: 'unlimited',
    databases: 'unlimited',
    domainPointers: 'unlimited',
    ftpAccounts: 'unlimited',
  },
};

/** Default DirectAdmin panel language for Verris nodes (product requirement: PL). */
export const DA_DEFAULT_LANGUAGE = 'pl';

/** Fields used by the audit layer to report Plan resource values. */
export interface PlanResourceFields {
  slug: string;
  diskLimitMb: number;
  includedTransferGb: number | null;
  cpuLimit: number;
  ramLimitMb: number;
  ioLimitKbps: number;
  iopsLimit: number;
  entryProcesses: number;
  nprocLimit: number;
  /** B6 — SSH/Git shell access per plan (off by default; CageFS isolates). */
  sshAccess?: boolean;
}

export function packagePolicyForSlug(slug: string): DaPackagePolicy {
  return PACKAGE_POLICY_BY_SLUG[slug] ?? DEFAULT_PACKAGE_POLICY;
}

/**
 * Maps a Verris `Plan` to a complete DirectAdmin package definition with real,
 * non-unlimited limits everywhere the plan defines one. This is the single
 * source of truth shared by provisioning (`ensureUserPackage`) and the node
 * audit/repair layer (`upsertUserPackage`).
 */
export function buildDaPackageSpecFromPlan(
  plan: PlanResourceFields,
  opts: { language?: string; skin?: string } = {},
): DaPackageSpec {
  const policy = packagePolicyForSlug(plan.slug);
  const bandwidthMb: DaLimit =
    plan.includedTransferGb && plan.includedTransferGb > 0
      ? plan.includedTransferGb * 1024
      : 'unlimited';

  return {
    name: plan.slug,
    diskQuotaMb: plan.diskLimitMb,
    bandwidthMb,
    domains: policy.domains,
    subdomains: policy.subdomains,
    emailAccounts: policy.emailAccounts,
    emailForwarders: policy.emailForwarders,
    mailingLists: policy.mailingLists,
    autoresponders: policy.autoresponders,
    databases: policy.databases,
    domainPointers: policy.domainPointers,
    ftpAccounts: policy.ftpAccounts,
    features: {
      cgi: true,
      php: true,
      ssl: true,
      spam: true,
      cron: true,
      dnscontrol: true,
      // A6 — Redis (object cache, np. dla WordPress); A4 — instalator WordPress;
      // B6 — Git deploy. CageFS izoluje konta, więc bezpieczne do włączenia
      // platformowo. SSH pozostaje per-plan (pole Plan.sshAccess), domyślnie off.
      redis: true,
      git: true,
      wordpress: true,
      ssh: plan.sshAccess === true,
    },
    lve: {
      cpuPercent: plan.cpuLimit,
      memoryMb: plan.ramLimitMb,
      ioKbps: plan.ioLimitKbps,
      iops: plan.iopsLimit,
      entryProcesses: plan.entryProcesses,
      nproc: plan.nprocLimit,
    },
    // DirectAdmin systemd-cgroup limits — the active per-user limiter on nodes
    // without CloudLinux LVE integration (CageFS). Mirrors the plan 1:1 so the
    // package editor shows real values and systemd enforces the same ceilings
    // as LVE. CPU% == LVE SPEED, RAM == pmem, IO == LVE io, Tasks == NPROC.
    cgroup: {
      cpuQuotaPercent: plan.cpuLimit,
      memoryHighMb: plan.ramLimitMb,
      memoryMaxMb: plan.ramLimitMb,
      ioReadBandwidthKbps: plan.ioLimitKbps,
      ioWriteBandwidthKbps: plan.ioLimitKbps,
      ioReadIops: plan.iopsLimit,
      ioWriteIops: plan.iopsLimit,
      tasksMax: plan.nprocLimit,
    },
    language: opts.language ?? DA_DEFAULT_LANGUAGE,
    skin: opts.skin ?? 'evolution',
  };
}

/** Narrow a full Prisma `Plan` to the fields needed for package mapping. */
export function planResourceFields(plan: Plan): PlanResourceFields {
  return {
    slug: plan.slug,
    diskLimitMb: plan.diskLimitMb,
    includedTransferGb: plan.includedTransferGb,
    cpuLimit: plan.cpuLimit,
    ramLimitMb: plan.ramLimitMb,
    ioLimitKbps: plan.ioLimitKbps,
    iopsLimit: plan.iopsLimit,
    entryProcesses: plan.entryProcesses,
    nprocLimit: plan.nprocLimit,
    sshAccess: plan.sshAccess ?? false,
  };
}
