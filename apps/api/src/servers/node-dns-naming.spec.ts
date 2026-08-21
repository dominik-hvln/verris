import {
  allocateNsPairIndices,
  normalizeGlueFqdn,
  isLegacyPerNodeNs,
  nsNumberingStart,
  parseNsIndex,
} from './node-dns-naming';

describe('node-dns-naming', () => {
  const base = 'verris.pl';

  it('parses short global NS hostnames', () => {
    expect(parseNsIndex('ns1.verris.pl', base)).toBe(1);
    expect(parseNsIndex('ns101.verris.pl', base)).toBe(101);
    expect(parseNsIndex('ns1.node-pl-01.verris.pl', base)).toBeNull();
  });

  it('allocates sequential pairs', () => {
    expect(allocateNsPairIndices(new Set([1, 2]), 1)).toEqual({ n1: 3, n2: 4 });
    expect(allocateNsPairIndices(new Set(), 1)).toEqual({ n1: 1, n2: 2 });
  });

  it('allocates block100 pairs', () => {
    expect(nsNumberingStart('block100')).toBe(100);
    expect(allocateNsPairIndices(new Set([100, 101]), 100)).toEqual({ n1: 102, n2: 103 });
  });

  it('detects legacy per-node hostnames', () => {
    expect(isLegacyPerNodeNs('ns1.node-pl-01.verris.pl', base)).toBe(true);
    expect(isLegacyPerNodeNs('ns1.verris.pl', base)).toBe(false);
  });

  it('normalizes glue FQDN for OVH API', () => {
    expect(normalizeGlueFqdn('NS3.Verris.PL', base)).toBe('ns3.verris.pl');
  });
});
