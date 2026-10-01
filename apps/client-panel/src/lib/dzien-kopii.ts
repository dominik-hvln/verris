/**
 * Dzień kopii poza serwerem: pole `<input type="date">` daje `RRRR-MM-DD`, API przyjmuje i zwraca `RRRRMMDD`.
 */
export function dzienDoApi(zPola: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(zPola) ? zPola.replace(/-/g, '') : '';
}

export function dzienDoPola(zApi: string): string {
  return /^\d{8}$/.test(zApi) ? `${zApi.slice(0, 4)}-${zApi.slice(4, 6)}-${zApi.slice(6, 8)}` : '';
}

/** `20260715` → `15.07.2026`; inny format zostaje bez zmian. */
export function dzienCzytelny(zApi: string): string {
  return /^\d{8}$/.test(zApi) ? `${zApi.slice(6, 8)}.${zApi.slice(4, 6)}.${zApi.slice(0, 4)}` : zApi;
}
