import { createPublicClient, http, erc20Abi, formatUnits, type Abi } from 'viem';
import { mainnet } from 'viem/chains';
import vaultAbiJson from './abi/ethereum-vault.json' with { type: 'json' };
import { env, LOCKERS } from '../core/config';
import type { Reserve } from './types';

export const vaultAbi = vaultAbiJson as Abi;
export const client = () => createPublicClient({ chain: mainnet, transport: http(env.ethRpc()) });
const vault = LOCKERS.ethereum as `0x${string}`;

// Candidate tokens, filtered on-chain via isAssetWhitelisted(). TODO(P1): discover from AssetWhitelisted events.
export const CANDIDATE_TOKENS: Record<string, `0x${string}`> = {
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDe: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3',
  PYUSD: '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
};

export async function ethReserves(): Promise<Reserve[]> {
  const c = client();
  const eth = await c.getBalance({ address: vault });
  const out: Reserve[] = [{ chain: 'ethereum', asset: 'ETH', amount: Number(formatUnits(eth, 18)), raw: eth.toString(), decimals: 18, holder: vault }];
  for (const [sym, token] of Object.entries(CANDIDATE_TOKENS)) {
    const [raw, dec] = await Promise.all([
      c.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [vault] }),
      c.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
    ]);
    if (raw > 0n) out.push({ chain: 'ethereum', asset: sym, amount: Number(formatUnits(raw, dec)), raw: raw.toString(), decimals: dec, contract: token, holder: vault });
  }
  return out;
}

export async function ethSafetyState() {
  const c = client();
  const [paused, cfg] = await Promise.all([
    c.readContract({ address: vault, abi: vaultAbi, functionName: 'isPaused' }),
    c.readContract({ address: vault, abi: vaultAbi, functionName: 'largeWithdrawalConfig' }),
  ]) as [boolean, readonly [bigint, bigint, bigint, bigint]];
  return { paused, queueDelaySecs: Number(cfg[1]), maxPending: Number(cfg[2]), pendingCount: Number(cfg[3]) };
}

export const SAFETY_EVENTS = [
  'LargeWithdrawalQueued', 'LargeWithdrawalExecuted', 'LargeWithdrawalCancelled',
  'Paused', 'Unpaused', 'ActionProposed', 'ActionFinalized', 'ActionCancelled',
  'Upgraded', 'RateLimitUpdated', 'RoleMembersUpdated', 'AdminWithdrawERC20', 'AdminWithdrawETH',
] as const;

export async function ethSafetyEvents(fromBlock: bigint, toBlock: bigint) {
  const c = client();
  const logs = await c.getContractEvents({ address: vault, abi: vaultAbi, fromBlock, toBlock });
  return logs.filter(l => (SAFETY_EVENTS as readonly string[]).includes((l as { eventName?: string }).eventName ?? ''));
}
