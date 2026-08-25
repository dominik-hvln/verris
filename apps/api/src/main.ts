import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { beginDraining } from './health/lifecycle';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // rawBody: true keeps a Buffer copy of the request body on every request so
  // the Stripe webhook handler can verify the HMAC signature against it.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // Audit F-10: exactly one trusted proxy (Caddy) sits in front of the API in
  // prod — with this set, `req.ip` is the real client IP (taken from the XFF
  // entry appended by Caddy, not the spoofable left-most value).
  app.set('trust proxy', 1);

  // Minimal security headers for a JSON API (HSTS/CSP terminate at Caddy).
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    next();
  });

  app.enableCors({
    origin: [
      config.get<string>('clientPanelUrl')!,
      config.get<string>('staffPanelUrl')!,
      config.get<string>('adminPanelUrl')!,
    ],
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // STAB-1 — pozwól Nestowi wywołać onModuleDestroy/onApplicationShutdown
  // (np. zamknięcie połączeń Prisma/Redis) przy zamykaniu.
  app.enableShutdownHooks();

  const port = config.get<number>('port')!;
  await app.listen(port);
  logger.log(`Verris API is running on http://localhost:${port}`);

  // STAB-1 — graceful drain: na SIGTERM (wdrożenie) najpierw oznacz /readyz jako
  // 503, odczekaj aż reverse-proxy przestanie kierować ruch, dopiero potem zamknij.
  const drainMs = Number.parseInt(process.env.SHUTDOWN_DRAIN_MS ?? '8000', 10) || 8000;
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`${signal} received — drenowanie ruchu przez ${drainMs}ms…`);
    beginDraining();
    await new Promise((resolve) => setTimeout(resolve, drainMs));
    logger.log('Zamykanie serwera HTTP…');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  // `console.error`, nie logger Nesta — bootstrap właśnie padł, więc logger
  // może nie istnieć. Stała tu dyrektywa wyciszająca `no-console`; reguła nie
  // jest już włączona, więc `eslint --fix` ją usunął (X-42). Powód zostaje.
  console.error('Fatal startup error:', err);
  process.exit(1);
});
