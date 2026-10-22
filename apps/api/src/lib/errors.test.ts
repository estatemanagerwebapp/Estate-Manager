import { describe, expect, it } from 'vitest';
import { AppError, NotFoundError, ValidationError } from './errors.js';

describe('AppError', () => {
  it('builds the standard envelope body', () => {
    const error = new AppError(409, 'CONFLICT', 'Already exists');
    expect(error.toBody('req-1')).toEqual({
      error: { code: 'CONFLICT', message: 'Already exists', requestId: 'req-1' },
    });
  });

  it('includes structured details when provided', () => {
    const error = new ValidationError([{ path: 'body.email', message: 'invalid' }]);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.toBody('req-2').error.details).toEqual([
      { path: 'body.email', message: 'invalid' },
    ]);
  });
});

describe('NotFoundError', () => {
  it('maps to 404 NOT_FOUND', () => {
    const error = new NotFoundError('nope');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });
});
