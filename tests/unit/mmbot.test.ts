import { describe, it, expect } from 'vitest';
import { recoverTypedDataAddress } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { asterEquity, hedgeReserves, HEDGE_BOT } from '../../packages/collectors/hedge';

describe("Strike market-maker bot on external exchanges (founder, 23 Oct 18:43)", () => {
  it('Aster v3: query (user, signer, nonce) EIP-712-signed by the API wallet; equity = totalMarginBalance', async () => {
    const key = generatePrivateKey(), signer = privateKeyToAccount(key).address;
    let url = '';
    const f = (async (u: string) => { url = u; return new Response(JSON.stringify({ totalMarginBalance: '41234.5' })); }) as typeof fetch;
    expect(await asterEquity(f, signer, key, HEDGE_BOT, 1_700_000_000_000_000)).toBe(41234.5);
    const [, qs] = url.split('?'); const [query, sig] = qs.split('&signature=');
    expect(url.startsWith('https://fapi.asterdex.com/fapi/v3/account?user=')).toBe(true);
    const who = await recoverTypedDataAddress({
      domain: { name: 'AsterSignTransaction', version: '1', chainId: 1666, verifyingContract: '0x0000000000000000000000000000000000000000' },
      types: { Message: [{ name: 'msg', type: 'string' }] }, primaryType: 'Message', message: { msg: query }, signature: sig as `0x${string}`,
    });
    expect(who).toBe(signer);
  });
  it('Aster without keys is pending (undefined), never a guessed zero', async () => {
    expect(await asterEquity(fetch, undefined, undefined)).toBeUndefined();
  });
  it('Lighter row is labelled hedge and held by the bot address', async () => {
    const f = (async () => new Response(JSON.stringify({ accounts: [{ index: 1, collateral: '1', total_asset_value: '100' }] }))) as typeof fetch;
    const prev = process.env.ASTER_SIGNER; delete process.env.ASTER_SIGNER;
    const rows = await hedgeReserves(f);
    process.env.ASTER_SIGNER = prev;
    expect(rows).toEqual([{ chain: 'hedge', asset: 'USD equity (Lighter)', amount: 100, contract: 'lighter:account-equity-usd', holder: HEDGE_BOT }]);
  });
});
