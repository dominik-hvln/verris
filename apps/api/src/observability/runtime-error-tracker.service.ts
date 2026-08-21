import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';

/**
 * CYBER-9 / OBS-1 — monitoring błędów runtime (Sentry-kompatybilny).
 *
 * Trzy funkcje w jednym miejscu, bez ciężkiego SDK (obraz API zostaje lekki):
 *   1. RING BUFFER ostatnich błędów 5xx — źródło dla widoku w panelu admin/staff.
 *   2. LICZNIKI błędów wg typu — eksponowane w /metrics dla Grafany + alertów.
 *   3. FORWARD do GlitchTip (self-hosted, Sentry-compatible) przez protokół
 *      envelope po HTTP — pełna historia/triage w UI GlitchTip (RODO: dane u nas).
 *
 * GlitchTip/Sentry DSN: `https://<publicKey>@<host>/<projectId>`.
 */
export interface CapturedError {
  id: string;
  at: string;
  type: string;
  message: string;
  method?: string;
  path?: string;
  status?: number;
  userId?: string;
  fingerprint: string;
  stack?: string;
}

interface Dsn {
  publicKey: string;
  host: string;
  protocol: string;
  projectId: string;
  port?: string;
}

@Injectable()
export class RuntimeErrorTracker {
  private readonly logger = new Logger(RuntimeErrorTracker.name);
  private readonly ring: CapturedError[] = [];
  private readonly maxRing = 200;
  private readonly counts = new Map<string, number>();
  private total = 0;
  private readonly dsn: Dsn | null;
  private readonly environment: string;
  private readonly release: string;

  constructor(private readonly config: ConfigService) {
    this.dsn = this.parseDsn(
      this.config.get<string>('sentryDsn') || process.env.SENTRY_DSN || process.env.GLITCHTIP_DSN,
    );
    this.environment = this.config.get<string>('nodeEnv') || 'development';
    this.release = process.env.APP_RELEASE || process.env.IMAGE_TAG || 'dev';
    if (this.dsn) {
      this.logger.log(`Runtime error forwarding → GlitchTip/Sentry (${this.dsn.host}).`);
    } else {
      this.logger.log('SENTRY_DSN/GLITCHTIP_DSN brak — błędy tylko lokalnie (ring + /metrics).');
    }
  }

  /** Rejestruje błąd: ring buffer + licznik + (opcjonalnie) forward do GlitchTip. */
  capture(
    error: unknown,
    ctx?: { method?: string; path?: string; status?: number; userId?: string },
  ): void {
    const err = error instanceof Error ? error : new Error(String(error));
    const type = err.name || 'Error';
    const message = (err.message || 'Unknown error').slice(0, 500);
    const fingerprint = createHash('sha1')
      .update(`${type}|${message}|${ctx?.path ?? ''}`)
      .digest('hex')
      .slice(0, 16);

    const entry: CapturedError = {
      id: randomUUID(),
      at: new Date().toISOString(),
      type,
      message,
      method: ctx?.method,
      path: ctx?.path,
      status: ctx?.status,
      userId: ctx?.userId,
      fingerprint,
      stack: err.stack?.slice(0, 4000),
    };

    this.ring.unshift(entry);
    if (this.ring.length > this.maxRing) this.ring.pop();
    this.counts.set(type, (this.counts.get(type) ?? 0) + 1);
    this.total += 1;

    if (this.dsn) {
      // best-effort, nie blokujemy odpowiedzi HTTP
      void this.forward(entry, err).catch((e) =>
        this.logger.warn(`GlitchTip forward failed: ${(e as Error).message}`),
      );
    }
  }

  /** Ostatnie błędy (dla panelu admin/staff). */
  recent(limit = 50): CapturedError[] {
    return this.ring.slice(0, Math.max(1, Math.min(limit, this.maxRing)));
  }

  /** Zagregowane liczniki wg typu + suma (dla panelu). */
  summary(): { total: number; byType: Array<{ type: string; count: number }> } {
    return {
      total: this.total,
      byType: [...this.counts.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  /** Linie Prometheus dla /metrics (Grafana + alerty). */
  prometheusLines(): string[] {
    const lines: string[] = [
      '# HELP verris_runtime_errors_total Cumulative runtime errors captured, by type',
      '# TYPE verris_runtime_errors_total counter',
    ];
    if (this.counts.size === 0) {
      lines.push('verris_runtime_errors_total{type="none"} 0');
    } else {
      for (const [type, count] of this.counts) {
        lines.push(`verris_runtime_errors_total{type="${escapeLabel(type)}"} ${count}`);
      }
    }
    return lines;
  }

  // --- GlitchTip/Sentry envelope (bez SDK) -----------------------------------

  private async forward(entry: CapturedError, err: Error): Promise<void> {
    if (!this.dsn) return;
    const eventId = entry.id.replace(/-/g, '');
    const ingestUrl =
      `${this.dsn.protocol}://${this.dsn.host}${this.dsn.port ? ':' + this.dsn.port : ''}` +
      `/api/${this.dsn.projectId}/envelope/`;

    const sentAt = new Date().toISOString();
    const header = JSON.stringify({
      event_id: eventId,
      sent_at: sentAt,
      dsn: `${this.dsn.protocol}://${this.dsn.publicKey}@${this.dsn.host}${
        this.dsn.port ? ':' + this.dsn.port : ''
      }/${this.dsn.projectId}`,
    });
    const event = {
      event_id: eventId,
      timestamp: entry.at,
      platform: 'node',
      level: 'error',
      environment: this.environment,
      release: this.release,
      logger: 'verris-api',
      transaction: entry.path,
      fingerprint: [entry.fingerprint],
      exception: {
        values: [
          {
            type: entry.type,
            value: entry.message,
            stacktrace: entry.stack
              ? { frames: parseStack(entry.stack) }
              : undefined,
          },
        ],
      },
      tags: {
        method: entry.method ?? '',
        status: String(entry.status ?? ''),
      },
      user: entry.userId ? { id: entry.userId } : undefined,
    };
    const itemHeader = JSON.stringify({ type: 'event', content_type: 'application/json' });
    const body = `${header}\n${itemHeader}\n${JSON.stringify(event)}\n`;

    const res = await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth':
          `Sentry sentry_version=7, sentry_client=verris-api/1.0, ` +
          `sentry_key=${this.dsn.publicKey}`,
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok && res.status !== 429) {
      throw new Error(`ingest HTTP ${res.status}`);
    }
  }

  private parseDsn(dsn?: string | null): Dsn | null {
    if (!dsn) return null;
    try {
      const u = new URL(dsn);
      const projectId = u.pathname.replace(/^\//, '');
      if (!u.username || !projectId) return null;
      return {
        publicKey: u.username,
        host: u.hostname,
        protocol: u.protocol.replace(':', ''),
        projectId,
        port: u.port || undefined,
      };
    } catch {
      this.logger.warn('Nieprawidłowy SENTRY_DSN/GLITCHTIP_DSN — forwarding wyłączony.');
      return null;
    }
  }
}

function escapeLabel(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function parseStack(stack: string): Array<{ function?: string; filename?: string; lineno?: number }> {
  const frames: Array<{ function?: string; filename?: string; lineno?: number }> = [];
  for (const line of stack.split('\n').slice(1, 30)) {
    const m = line.match(/at\s+(.*?)\s+\(?(.*?):(\d+):(\d+)\)?/);
    if (m) {
      frames.push({ function: m[1], filename: m[2], lineno: Number(m[3]) });
    }
  }
  // Sentry oczekuje ramek od najstarszej do najnowszej
  return frames.reverse();
}
