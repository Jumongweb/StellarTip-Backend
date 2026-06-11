import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId: string =
      (req.headers['x-request-id'] as string) || uuidv4();
    (req as unknown as Record<string, unknown>)['requestId'] = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
