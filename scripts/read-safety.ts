// Live read of the Ethereum vault's safety controls (M3).
import { client, vaultAbi } from '../packages/collectors/ethereum';
import { LOCKERS } from '../packages/core/config';
const c = client(); const address = LOCKERS.ethereum as `0x${string}`;
const r = (functionName: string, args: unknown[] = []) => c.readContract({ address, abi: vaultAbi, functionName, args } as any).then(v => v, e => `ERR ${e.shortMessage ?? e.message}`);
const j = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x);
for (const f of ['isPaused', 'pauseEpoch', 'largeWithdrawalConfig', 'globalRateLimit', 'defaultPerAssetRateLimit', 'timelockConfig', 'guardianThreshold', 'governorThreshold', 'signatureThreshold', 'validatorCount', 'owner', 'governanceModule', 'MIN_QUEUE_DELAY'])
  console.log(f, j(await r(f)));
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
console.log('perAssetRateLimit USDC', j(await r('perAssetRateLimit', [USDC])), 'weight', j(await r('assetWeight', [USDC])), 'whitelisted', j(await r('isAssetWhitelisted', [USDC])));
for (const [asset, g] of [[USDC, false], ['0x0000000000000000000000000000000000000000', true]] as const) for (const w of [1, 24])
  console.log('rateLimitBucket', asset.slice(0, 6), g, w, j(await r('rateLimitBucket', [asset, g, w])));
console.log('ETH whitelisted', j(await r('isAssetWhitelisted', ['0x0000000000000000000000000000000000000000'])));
