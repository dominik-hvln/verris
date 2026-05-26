import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { HttpMetricsService, normalizePath } from './http-metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly httpMetrics: HttpMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<{ method?: string; url?: string; route?: { path?: string } }>();
    const res = http.getResponse<{ statusCode?: number }>();

    const method = (req.method ?? 'GET').toUpperCase();
    const routePath =
      typeof req.route?.path === 'string' ? String(req.route.path) : normalizePath(req.url ?? '/');
    const started = Date.now();

    return next.handle().pipe(
      finalize(() => {
        const status = res.statusCode ?? 500;
        this.httpMetrics.record(method, routePath, status, Date.now() - started);
      }),
    );
  }
}
