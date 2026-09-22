export type DmarcPolicy = 'none' | 'quarantine' | 'reject';

export const DMARC_POLICIES: { value: DmarcPolicy; label: string }[] = [
  { value: 'none', label: 'Tylko monitoruj (p=none)' },
  { value: 'quarantine', label: 'Do spamu (p=quarantine)' },
  { value: 'reject', label: 'Odrzucaj (p=reject)' },
];

export const isEmail = (v: string) => /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(v);

/** E-17 — ustawia politykę i adres raportów w rekordzie DMARC, zostawiając pozostałe tagi. */
export function tuneDmarc(value: string, policy: DmarcPolicy, rua: string): string {
  const tags = value
    .split(';')
    .map((t) => t.trim())
    .filter((t) => t && !/^(p|rua)=/i.test(t) && !/^v=dmarc1$/i.test(t));
  return ['v=DMARC1', `p=${policy}`, ...(rua.trim() ? [`rua=mailto:${rua.trim()}`] : []), ...tags].join('; ');
}

export function dmarcPolicyOf(value: string): DmarcPolicy {
  const p = /(?:^|;)\s*p=(none|quarantine|reject)/i.exec(value)?.[1]?.toLowerCase();
  return (p as DmarcPolicy) ?? 'quarantine';
}

export function dmarcRuaOf(value: string): string {
  return /(?:^|;)\s*rua=mailto:([^;,\s]+)/i.exec(value)?.[1] ?? '';
}
