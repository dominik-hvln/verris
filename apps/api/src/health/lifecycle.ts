/**
 * STAB-1 — graceful drain state.
 *
 * Podczas wdrożenia kontener API dostaje SIGTERM. Zanim go zamkniemy, chcemy
 * żeby reverse-proxy (Caddy, aktywny health-check na /readyz) PRZESTAŁ kierować
 * tu nowy ruch — inaczej żądania trafiające w okno restartu zwracają 502/503.
 *
 * Flow:
 *   1. SIGTERM → beginDraining() ustawia flagę.
 *   2. /readyz natychmiast zwraca 503 (degraded) → Caddy oznacza upstream jako
 *      unhealthy po najbliższym sondowaniu i przestaje go wybierać.
 *   3. Po krótkim oknie (SHUTDOWN_DRAIN_MS) zamykamy serwer — dzięki temu
 *      żądania w locie zdążą się dokończyć, a nowe już tu nie trafiają.
 */
let draining = false;

export function beginDraining(): void {
  draining = true;
}

export function isDraining(): boolean {
  return draining;
}
