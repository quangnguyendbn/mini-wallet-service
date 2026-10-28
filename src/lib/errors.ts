import { HTTP_CODE } from '../constants/httpCode';

type GroupCode<T> = T[keyof T];

type HttpErrorCode =
  | GroupCode<typeof HTTP_CODE.CLIENT_ERROR>
  | GroupCode<typeof HTTP_CODE.SERVER_ERROR>;

export class HttpError extends Error {
  readonly statusCode: HttpErrorCode;
  readonly body: { error: string } & Record<string, unknown>;

  constructor(statusCode: HttpErrorCode, error: string, extra?: Record<string, unknown>) {
    super(error);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.body = { error, ...extra };
  }
}

export function memberNotFound(): HttpError {
  return new HttpError(HTTP_CODE.CLIENT_ERROR.NOT_FOUND, 'member not found');
}

export function walletNotFound(): HttpError {
  return new HttpError(HTTP_CODE.CLIENT_ERROR.NOT_FOUND, 'wallet not found');
}

export function depositNotFound(): HttpError {
  return new HttpError(HTTP_CODE.CLIENT_ERROR.NOT_FOUND, 'deposit not found');
}

export function insufficientBalance(): HttpError {
  return new HttpError(HTTP_CODE.CLIENT_ERROR.UNPROCESSABLE_ENTITY, 'insufficient_balance');
}

export function insufficientTurnover(outstanding: string): HttpError {
  return new HttpError(HTTP_CODE.CLIENT_ERROR.UNPROCESSABLE_ENTITY, 'insufficient_turnover', { outstanding });
}

export function conflict(error: string): HttpError {
  return new HttpError(HTTP_CODE.CLIENT_ERROR.CONFLICT, error);
}
