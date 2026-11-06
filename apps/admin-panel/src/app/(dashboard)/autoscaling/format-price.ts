/**
 * Stawka z API (Decimal(12, 6) jako tekst, np. "0.123456") tak, jak jest zapisana — bez zer na końcu.
 * Uwaga 6.11.2026: wcześniej stawki od 0,01 skracane do 4 miejsc (0.123456 → "0.1235"), więc tabela
 * pokazywała inną stawkę niż ta, po której API nalicza dopłaty.
 */
export function formatPrice(value: string): string {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString("en-US", { maximumFractionDigits: 6, useGrouping: false });
}
