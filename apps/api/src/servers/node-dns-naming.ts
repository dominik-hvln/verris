/**
 * Global short branded NS hostnames under HOSTING_NS_BASE_DOMAIN:
 *   sequential — węzeł 1: ns1 + ns2, węzeł 2: ns3 + ns4, …
 *   block100   — węzeł 1: ns100 + ns101, węzeł 2: ns102 + ns103, …
 */

export type NsNumberingMode = 'sequential' | 'block100';

export function nsNumberingStart(mode: NsNumberingMode): number {
  return mode === 'block100' ? 100 : 1;
}

/** Parses `ns42.verris.pl` → 42; returns null for legacy `ns1.node-pl-01.verris.pl`. */
export function parseNsIndex(hostname: string, baseDomain: string): number | null {
  const base = baseDomain.toLowerCase();
  const host = hostname.trim().toLowerCase();
  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return null;
  const sub = host.slice(0, -suffix.length);
  const m = /^ns(\d+)$/.exec(sub);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function nsHost(index: number, baseDomain: string): string {
  return `ns${index}.${baseDomain.toLowerCase()}`;
}

export function nsSubdomain(index: number): string {
  return `ns${index}`;
}

/** True for old per-node pattern e.g. ns1.node-pl-01.verris.pl */
export function isLegacyPerNodeNs(hostname: string, baseDomain: string): boolean {
  const base = baseDomain.toLowerCase();
  const host = hostname.trim().toLowerCase();
  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) return false;
  const sub = host.slice(0, -suffix.length);
  return /^ns[12]\..+/.test(sub);
}

export function legacyZoneSubdomain(hostname: string, baseDomain: string): string | null {
  if (!isLegacyPerNodeNs(hostname, baseDomain)) return null;
  const base = baseDomain.toLowerCase();
  return hostname.trim().toLowerCase().slice(0, -`.${base}`.length);
}

/**
 * Picks the lowest free consecutive pair (n, n+1) not present in `usedIndices`.
 */
export function allocateNsPairIndices(
  usedIndices: Set<number>,
  startBase: number,
): { n1: number; n2: number } {
  for (let k = 0; k < 500; k++) {
    const n1 = startBase + k * 2;
    const n2 = n1 + 1;
    if (!usedIndices.has(n1) && !usedIndices.has(n2)) {
      return { n1, n2 };
    }
  }
  throw new Error('Brak wolnej pary numerów NS (limit 500 par).');
}

/** OVH glue API `host` must be the FQDN (ns1.verris.pl), not the zone label alone. */
export function normalizeGlueFqdn(fqdn: string, baseDomain: string): string {
  const base = baseDomain.toLowerCase();
  const host = fqdn.trim().toLowerCase();
  const suffix = `.${base}`;
  if (!host.endsWith(suffix) || host === base) {
    throw new Error(`Glue host must be FQDN under ${base}, got: ${fqdn}`);
  }
  return host;
}

/** @deprecated Use normalizeGlueFqdn — OVH rejects bare labels for glue. */
export function glueHostLabel(fqdn: string, baseDomain: string): string {
  return normalizeGlueFqdn(fqdn, baseDomain);
}
