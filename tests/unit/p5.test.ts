import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
// @ts-expect-error browser module without type declarations
import { signingMessage, sha256Hex, StrikeClient, base58, bech32, cardanoHexToBech32, hex } from '../../apps/web/assets/strike-client.js';

type Captured = { url: string; headers: Record<string, string>; body: string };
const capture = (sink: Captured[], reply = '{}') => {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sink.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
    return new Response(reply);
  }) as unknown as typeof fetch;
};

describe('T5.1 request signing (Builder Connect API wallet)', () => {
  it('message = METHOD:PATH:TIMESTAMP:NONCE:SHA256(body); empty body hashes ""', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    const body = JSON.stringify({ usd_value: '50.00', blockchain: 'solana', asset: 'USDC' });
    expect(await signingMessage('post', '/v2/withdraw/quote', '1712054096', 'n-1', body)).toBe(`POST:/v2/withdraw/quote:1712054096:n-1:${await sha256Hex(body)}`);
  });

  it('signs with the in-memory key; signature verifies with tweetnacl; documented headers', async () => {
    const seen: Captured[] = [];
    capture(seen, '{"withdraw_id":"wd_1"}');
    const c = new StrikeClient('https://api-v2-testnet.strikefinance.org', nacl);
    const pub = c.newApiWallet();
    expect(pub).toMatch(/^[0-9a-f]{64}$/);
    await c.withdrawQuote({ usd_value: '50.00', blockchain: 'solana', asset: 'USDC' });
    const { url, headers: h, body } = seen[0];
    expect(url).toBe('https://api-v2-testnet.strikefinance.org/v2/withdraw/quote');
    expect(h['X-API-Wallet-Public-Key']).toBe(pub);
    const msg = await signingMessage('POST', '/v2/withdraw/quote', h['X-API-Wallet-Timestamp'], h['X-API-Wallet-Nonce'], body);
    expect(nacl.sign.detached.verify(new TextEncoder().encode(msg), Buffer.from(h['X-API-Wallet-Signature'], 'hex'), Buffer.from(pub, 'hex'))).toBe(true);
  });

  it('T5.2 every request uses a new UUID nonce', async () => {
    const seen: Captured[] = [];
    capture(seen);
    const c = new StrikeClient('https://x', nacl); c.newApiWallet();
    for (let i = 0; i < 5; i++) await c.withdrawQuote({});
    const nonces = seen.map(s => s.headers['X-API-Wallet-Nonce']);
    expect(new Set(nonces).size).toBe(5);
    expect(nonces.every(n => /^[0-9a-f-]{36}$/.test(n))).toBe(true);
  });

  it('T5.6 the API wallet secret is never sent in any request', async () => {
    const seen: Captured[] = [];
    capture(seen);
    const c = new StrikeClient('https://x', nacl); c.newApiWallet();
    await c.withdrawQuote({ a: 1 }); await c.requestSignature({ public_key: 'p' });
    const secret = hex(c.keys.secretKey).slice(0, 64);
    expect(seen.some(s => JSON.stringify(s).includes(secret))).toBe(false);
  });
});

describe('wallet signature encodings', () => {
  it('base58 (Solana signatures)', () => {
    expect(base58(new Uint8Array([0, 0, 1]))).toBe('112');
    expect(base58(Uint8Array.from(Buffer.from('hello world')))).toBe('StV1DL6CwTryKyV');
  });
  it('bech32 (Cardano CIP-30 hex address to addr1...)', () => {
    // Strike's Cardano deposit script in raw (CIP-30) hex form.
    expect(cardanoHexToBech32('71488034c5ff5d177408deb3dda546b9a1431e2378536e954796c8db73')).toBe('addr1w9ygqdx9law3waqgm6eamf2xhxs5x83r0pfka928jmydkuc6ykls3');
    expect(bech32('a', new Uint8Array([]))).toBe('a12uel5l');
  });
});
