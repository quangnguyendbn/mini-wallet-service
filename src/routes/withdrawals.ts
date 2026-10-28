import { Router } from 'express';
import { z } from 'zod';
import { HTTP_CODE } from '../constants/httpCode';
import { parsePositiveMoney } from '../lib/money';
import { fundingService } from '../services/fundingService';

export const withdrawalsRouter = Router();

const createWithdrawalBody = z.object({
  memberId: z.string().uuid(),
  amount: z.string().refine((value) => {
    try {
      parsePositiveMoney(value);
      return true;
    } catch {
      return false;
    }
  }),
});

withdrawalsRouter.post('/', async (req, res, next) => {
  try {
    const body = createWithdrawalBody.parse(req.body);
    const withdrawal = await fundingService.createWithdrawal(body);
    res.status(HTTP_CODE.SUCCESSFUL.CREATED).json({
      id: withdrawal.id,
      status: fundingService.fundingStatusLabel(withdrawal.status),
    });
  } catch (err) {
    next(err);
  }
});
