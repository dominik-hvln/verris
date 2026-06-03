/**
 * Ustalenie głównej domeny konta hostingowego na podstawie listy z DA
 * (CMD_API_SHOW_DOMAINS) i opcjonalnie pola `domain` z CMD_API_SHOW_USER_CONFIG.
 */
export function resolveHostingPrimaryDomain(input: {
  storedDomain: string;
  daConfigDomain: string | null;
  daDomains: string[];
}): string {
  const stored = input.storedDomain.trim();
  const list = input.daDomains.map((d) => d.trim()).filter(Boolean);
  if (!stored && list.length === 0) return '';

  const norm = (d: string) => d.toLowerCase();
  const inList = (d: string) => list.some((x) => norm(x) === norm(d));
  const pickCase = (d: string) => list.find((x) => norm(x) === norm(d)) ?? d;

  const config = input.daConfigDomain?.trim() ?? '';
  if (config && inList(config)) return pickCase(config);
  if (stored && inList(stored)) return pickCase(stored);
  if (list.length === 1) return list[0]!;
  if (list.length > 1) return list[0]!;
  return stored;
}
