import { Express } from 'express';
import { depositsRouter } from './deposits';
import { healthRouter } from './health';
import { membersRouter } from './members';
import { pspRouter } from './psp';
import { wagersRouter } from './wagers';
import { withdrawalsRouter } from './withdrawals';

export function mountRoutes(app: Express): void {
  app.use('/health', healthRouter);
  app.use('/members', membersRouter);
  app.use('/deposits', depositsRouter);
  app.use('/psp', pspRouter);
  app.use('/wallets', wagersRouter);
  app.use('/withdrawals', withdrawalsRouter);
}
