import { Router } from 'express';
import { z } from 'zod';
import { HTTP_CODE } from '../constants/httpCode';
import { parsePositiveMoney } from '../lib/money';
import * as fundingService from '../services/fundingService';

export const pspRouter = Router();

const callbackBody = z.object({
  pspRef: z.string().min(1),
  status: z.enum(['completed', 'failed']),
  amount: z.string().refine((value) => {
    try {
      parsePositiveMoney(value);
      return true;
    } catch {
      return false;
    }
  }),
});

pspRouter.post('/callbacks', async (req, res, next) => {
  try {
    const body = callbackBody.parse(req.body);
    const deposit = await fundingService.applyDepositCallback(body);
    res.status(HTTP_CODE.SUCCESSFUL.OK).json({
      status: fundingService.fundingStatusLabel(deposit.status),
    });
  } catch (err) {
    next(err);
  }
});
