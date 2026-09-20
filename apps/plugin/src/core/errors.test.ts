import { ERROR_CODES } from '@share-note/contracts/lite';
import { describe, expect, it } from 'vitest';
import { describeError, ShareApiError } from './errors';

describe('describeError', () => {
  it('has a sentence for every contract error code', () => {
    for (const code of ERROR_CODES) {
      const message = describeError(new ShareApiError(code, 'raw'));
      expect(message).toMatch(/^[A-Z].*\.$/);
    }
  });

  it('has a sentence for the two local codes', () => {
    expect(describeError(new ShareApiError('NETWORK_ERROR', 'raw'))).toContain('server URL');
    expect(describeError(new ShareApiError('BAD_RESPONSE', 'raw'))).toContain('share-note server');
  });

  it('tells the user what to do about a rejected key', () => {
    expect(describeError(new ShareApiError('UNAUTHORIZED', 'raw'))).toContain('settings');
  });

  it('never shows the raw server message, which may be technical', () => {
    const message = describeError(new ShareApiError('INTERNAL_ERROR', 'ECONNREFUSED 10.0.0.5'));
    expect(message).not.toContain('10.0.0.5');
  });

  it('falls back for an unknown throwable', () => {
    expect(describeError(new Error('boom'))).toContain('Something went wrong');
    expect(describeError('boom')).toContain('Something went wrong');
  });
});
