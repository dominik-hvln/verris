import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

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

  const port = config.get<number>('port')!;
  await app.listen(port);
  logger.log(`Verris API is running on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
