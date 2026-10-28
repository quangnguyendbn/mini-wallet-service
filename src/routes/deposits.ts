import { Router } from 'express';
import { z } from 'zod';
import { parsePositiveMoney } from '../lib/money';
import * as fundingService from '../services/fundingService';

export const depositsRouter = Router();

const createDepositBody = z.object({
  memberId: z.string().uuid(),
  amount: z.string().refine((value) => {
    try {
      parsePositiveMoney(value);
      return true;
    } catch {
      return false;
    }
  }),
  turnoverMultiplier: z.number().int().nonnegative().default(1),
});

depositsRouter.post('/', async (req, res, next) => {
  try {
    const body = createDepositBody.parse(req.body);
    const deposit = await fundingService.createDeposit(body);
    res.status(201).json({
      id: deposit.id,
      pspRef: deposit.pspRef,
      status: fundingService.fundingStatusLabel(deposit.status),
    });
  } catch (err) {
    next(err);
  }
});
