import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
        
    const message = normalizeExceptionMessage(
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Wewnętrzny błąd serwera',
    );

    if (status >= 500) {
      this.logger.error(`[${request.method}] ${request.url}`, exception instanceof Error ? exception.stack : exception);
    } else {
      this.logger.warn(`[${request.method}] ${request.url} - Status: ${status}`);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
