import express, { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HTTP_CODE } from './constants/httpCode';
import { HttpError } from './lib/errors';
import { depositsRouter, healthRouter, membersRouter, pspRouter, wagersRouter } from './routes';

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(HTTP_CODE.CLIENT_ERROR.BAD_REQUEST).json({ error: 'validation_error', details: err.issues });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.statusCode).json(err.body);
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(HTTP_CODE.SERVER_ERROR.INTERNAL_SERVER_ERROR).json({ error: 'internal_error' });
};

export function createApp() {
  const app = express();
  app.use(express.json());

  app.use('/health', healthRouter);
  app.use('/members', membersRouter);
  app.use('/deposits', depositsRouter);
  app.use('/psp', pspRouter);
  app.use('/wallets', wagersRouter);
  // Mount your new routes here.

  app.use(errorHandler);
  return app;
}
