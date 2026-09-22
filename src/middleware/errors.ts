import { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { HttpError } from '../utils/errors';

export const asyncHandler = <T extends RequestHandler>(handler: T): RequestHandler =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

export const notFound = (req: Request, _res: Response, next: NextFunction): void => {
  next(new HttpError(404, `Route ${req.method} ${req.originalUrl} was not found.`));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next): void => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ success: false, error: error.message });
    return;
  }

  const mongoError = error as { code?: number; name?: string; message?: string };
  if (mongoError.code === 11000) {
    res.status(409).json({ success: false, error: 'A record with that value already exists.' });
    return;
  }

  if (mongoError.name === 'ValidationError' || mongoError.name === 'CastError') {
    res.status(400).json({ success: false, error: mongoError.message || 'Invalid request data.' });
    return;
  }

  console.error(error);
  res.status(500).json({ success: false, error: 'An unexpected server error occurred.' });
};
