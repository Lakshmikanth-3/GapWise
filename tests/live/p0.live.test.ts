import { describe, it, expect } from 'vitest';
import { env } from '../../packages/core/config';

const KNOWN = '019d0c57-6b60-75a2-8895-3fdd01cc9223';

describe('P0 live', () => {
  it('T0.3 Strike reachability: /v2/account returns 200 without auth', async () => {
    const res = await fetch(`${env.strikeApi}/v2/account?account_id=${KNOWN}`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('margin_balance');
    expect(body).toHaveProperty('sub_accounts');
  });
  // T0.4 (ratio between 0.5 and 2.0) is checked by `npm run first-ratio`; the value is recorded in README.
});
