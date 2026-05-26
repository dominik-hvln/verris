import { Injectable } from '@nestjs/common';

/** Stałe kubełki histogramu (sekundy) — zgodne z typowymi progami API. */
const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

type StatusClass = '1xx' | '2xx' | '3xx' | '4xx' | '5xx' | 'other';

interface RouteKey {
  method: string;
  route: string;
}

interface RouteStats {
  countByStatus: Map<StatusClass, number>;
  durationSumSec: number;
  durationCount: number;
  bucketCounts: number[];
}

/**
 * Metryki HTTP dla Prometheus (p95 / error rate w Grafanie).
 * Agregacja w pamięci — reset przy restarcie API (akceptowalne przy scrape 15s).
 */
@Injectable()
export class HttpMetricsService {
  private readonly routes = new Map<string, RouteStats>();

  record(method: string, rawPath: string, statusCode: number, durationMs: number): void {
    const route = normalizePath(rawPath);
    if (route === '/metrics' || route === '/healthz' || route === '/readyz') {
      return;
    }

    const key = `${method.toUpperCase()} ${route}`;
    let stats = this.routes.get(key);
    if (!stats) {
      stats = {
        countByStatus: new Map(),
        durationSumSec: 0,
        durationCount: 0,
        bucketCounts: DURATION_BUCKETS.map(() => 0),
      };
      this.routes.set(key, stats);
    }

    const statusClass = toStatusClass(statusCode);
    stats.countByStatus.set(statusClass, (stats.countByStatus.get(statusClass) ?? 0) + 1);

    const durationSec = Math.max(0, durationMs) / 1000;
    stats.durationSumSec += durationSec;
    stats.durationCount += 1;
    for (let i = 0; i < DURATION_BUCKETS.length; i++) {
      if (durationSec <= DURATION_BUCKETS[i]) {
        stats.bucketCounts[i] += 1;
      }
    }
  }

  formatPrometheus(): string {
    const lines: string[] = [];

    writeHelpType(lines, 'verris_http_requests_total', 'HTTP requests by method, route and status class', 'counter');
    writeHelpType(
      lines,
      'verris_http_request_duration_seconds',
      'HTTP request duration histogram',
      'histogram',
    );

    for (const [key, stats] of this.routes) {
      const space = key.indexOf(' ');
      const method = key.slice(0, space);
      const route = key.slice(space + 1);
      const labels = `method="${method}",route="${escapeLabel(route)}"`;

      for (const [statusClass, count] of stats.countByStatus) {
        lines.push(
          `verris_http_requests_total{${labels},status_class="${statusClass}"} ${count}`,
        );
      }

      if (stats.durationCount > 0) {
        for (let i = 0; i < DURATION_BUCKETS.length; i++) {
          const le = DURATION_BUCKETS[i];
          lines.push(
            `verris_http_request_duration_seconds_bucket{${labels},le="${le}"} ${stats.bucketCounts[i]}`,
          );
        }
        lines.push(
          `verris_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${stats.durationCount}`,
        );
        lines.push(`verris_http_request_duration_seconds_sum{${labels}} ${stats.durationSumSec}`);
        lines.push(`verris_http_request_duration_seconds_count{${labels}} ${stats.durationCount}`);
      }
    }

    return lines.length > 0 ? `${lines.join('\n')}\n` : '';
  }
}

export function normalizePath(rawPath: string): string {
  const path = (rawPath.split('?')[0] ?? '/').replace(/\/+/g, '/') || '/';
  return path
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      '/:id',
    )
    .replace(/\/[a-z0-9]{20,}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}

function toStatusClass(code: number): StatusClass {
  if (code >= 100 && code < 200) return '1xx';
  if (code >= 200 && code < 300) return '2xx';
  if (code >= 300 && code < 400) return '3xx';
  if (code >= 400 && code < 500) return '4xx';
  if (code >= 500 && code < 600) return '5xx';
  return 'other';
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function writeHelpType(
  lines: string[],
  name: string,
  help: string,
  type: 'counter' | 'histogram',
): void {
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} ${type}`);
}
