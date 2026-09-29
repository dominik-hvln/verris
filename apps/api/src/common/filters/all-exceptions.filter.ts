import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { DirectAdminApiError } from '@verris/directadmin-sdk';
import { dlaKlienta } from '../biala-etykieta.js';

/** Trasy zespołu i węzłów — tam pełna treść błędu zostaje (diagnoza). Reszta to trasy klienta. */
const TRASA_ZESPOLU = /^\/(?:admin|staff|agent|node|servers)(?:[/?]|$)/;

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // DA odmówił (np. „domena już istnieje”, brak miejsca) — to odpowiedź dla człowieka, nie awaria API.
    // Bez tego serwisy wołające SDK wprost (createDomain, bazy, pliki) zwracały 500 i klient nie wiedział dlaczego.
    const odmowaDa = exception instanceof DirectAdminApiError;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : odmowaDa
          ? HttpStatus.BAD_REQUEST
          : HttpStatus.INTERNAL_SERVER_ERROR;

    const surowy = normalizeExceptionMessage(
      exception instanceof HttpException
        ? exception.getResponse()
        : odmowaDa
          ? exception.daText
          : 'Wewnętrzny błąd serwera',
    );
    // White label: klient nie dostaje tekstu z nazwą panelu serwera, jego komendą ani portem
    // (np. BladEtapuProvisioningu „DirectAdmin package … is missing”, powód odmowy DA).
    const message =
      typeof surowy === 'string' && !TRASA_ZESPOLU.test(request.url) ? dlaKlienta(surowy) : surowy;

    if (status >= 500) {
      this.logger.error(`[${request.method}] ${request.url}`, exception instanceof Error ? exception.stack : exception);
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} - Status: ${status}${message !== surowy ? ` - ${String(surowy)}` : ''}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      // Odmowa serwera hostingu: panel klienta tłumaczy ją na polski (`daErrorMessage`).
      ...(odmowaDa ? { zrodlo: 'serwer-hostingu' } : {}),
    });
  }
}

function normalizeExceptionMessage(response: string | object): string | object {
  if (typeof response === 'string') return response;
  if (typeof response !== 'object' || response === null) return 'Wewnętrzny błąd serwera';
  const m = (response as { message?: unknown }).message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m)) {
    return m.filter((x): x is string => typeof x === 'string').join(', ');
  }
  return response;
}
