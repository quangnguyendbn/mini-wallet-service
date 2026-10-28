export const HttpCode = {
  NotFound: 404,
  Conflict: 409,
  UnprocessableEntity: 422,
} as const;

export type HttpCode = (typeof HttpCode)[keyof typeof HttpCode];

export class HttpError extends Error {
  readonly statusCode: HttpCode;
  readonly body: { error: string } & Record<string, unknown>;

  constructor(statusCode: HttpCode, error: string, extra?: Record<string, unknown>) {
    super(error);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.body = { error, ...extra };
  }
}

export function memberNotFound(): HttpError {
  return new HttpError(HttpCode.NotFound, 'member not found');
}

export function walletNotFound(): HttpError {
  return new HttpError(HttpCode.NotFound, 'wallet not found');
}

export function depositNotFound(): HttpError {
  return new HttpError(HttpCode.NotFound, 'deposit not found');
}

export function insufficientBalance(): HttpError {
  return new HttpError(HttpCode.UnprocessableEntity, 'insufficient_balance');
}

export function insufficientTurnover(outstanding: string): HttpError {
  return new HttpError(HttpCode.UnprocessableEntity, 'insufficient_turnover', { outstanding });
}

export function conflict(error: string): HttpError {
  return new HttpError(HttpCode.Conflict, error);
}
