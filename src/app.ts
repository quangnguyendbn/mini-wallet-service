import express, { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpCode, HttpError } from './lib/errors';
import { depositsRouter } from './routes/deposits';
import { healthRouter } from './routes/health';
import { membersRouter } from './routes/members';

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(HttpCode.BadRequest).json({ error: 'validation_error', details: err.issues });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.statusCode).json(err.body);
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(HttpCode.InternalServerError).json({ error: 'internal_error' });
};

export function createApp() {
  const app = express();
  app.use(express.json());

  app.use('/health', healthRouter);
  app.use('/members', membersRouter);
  app.use('/deposits', depositsRouter);
  // Mount your new routes here.

  app.use(errorHandler);
  return app;
}
