import type { ErrorRequestHandler } from 'express';

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const candidate = error instanceof HttpError ? error.status : Number(error?.status);
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate < 600 ? candidate : 500;
  if (status >= 500) console.error(error);

  res.status(status).json({
    error: status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
  });
};
