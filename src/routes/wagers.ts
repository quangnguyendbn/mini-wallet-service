import { Router } from 'express';
import { z } from 'zod';
import { HTTP_CODE } from '../constants/httpCode';
import { parsePositiveMoney } from '../lib/money';
import { wagerService } from '../services/wagerService';

export const wagersRouter = Router();

const wagerParams = z.object({
  walletId: z.string().uuid(),
});

const wagerBody = z.object({
  amount: z.string().refine((value) => {
    try {
      parsePositiveMoney(value);
      return true;
    } catch {
      return false;
    }
  }),
});

wagersRouter.post('/:walletId/wagers', async (req, res, next) => {
  try {
    const { walletId } = wagerParams.parse(req.params);
    const body = wagerBody.parse(req.body);
    const wager = await wagerService.placeWager(walletId, body.amount);
    res.status(HTTP_CODE.SUCCESSFUL.CREATED).json(wager);
  } catch (err) {
    next(err);
  }
});
