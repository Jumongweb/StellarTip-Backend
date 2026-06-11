import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { StructuredLogger } from '../logging/logging.config';

@Injectable()
export class HttpLoggingMiddleware implements NestMiddleware {
  private readonly logger = new StructuredLogger();

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const { method, originalUrl } = req;

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;

      this.logger.log(`${method} ${originalUrl} ${statusCode}`, 'HTTP', {
        method,
        url: originalUrl,
        statusCode,
        duration,
        requestId: (req as unknown as Record<string, unknown>)['requestId'],
      });
    });

    next();
  }
}
