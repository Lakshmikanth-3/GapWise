import { createPublicClient, http, erc20Abi, formatUnits, parseAbi, type Abi } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import vaultAbiJson from './abi/ethereum-vault.json' with { type: 'json' };
import { env, LOCKERS, NET, NETWORK } from '../core/config';
import type { Reserve } from './types';

export const vaultAbi = vaultAbiJson as Abi;
const chain = NET.ethChain === 'sepolia' ? sepolia : mainnet;
export const client = () => createPublicClient({ chain, transport: http(env.ethRpc()) });
/** Client for eth_getLogs (wide block ranges); state reads use `client()`. */
export const logsClient = () => createPublicClient({ chain, transport: http(env.ethLogsRpc()) });
const vault = LOCKERS.ethereum as `0x${string}`;

// Candidate tokens, filtered on-chain via isAssetWhitelisted(). TODO(P1): discover from AssetWhitelisted events.
export const CANDIDATE_TOKENS: Record<string, `0x${string}`> = NETWORK === 'testnet'
  ? { USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' } // Circle's official Sepolia test USDC (whitelisted in the Sepolia vault)
  : {
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
  // Aave V3 aUSDC (whitelisted in the vault; mapped by Strike to SCALED_AAVE_V3_ETH_aUSDC). Reported in *scaled*
  // units because Strike's Credit price is per scaled unit (it already includes the Aave liquidity index).
  if (NETWORK === 'testnet') return out; // no Aave position on the Sepolia vault
  const scaled = await c.readContract({ address: AAVE_AUSDC, abi: parseAbi(['function scaledBalanceOf(address) view returns (uint256)']), functionName: 'scaledBalanceOf', args: [vault] });
  if (scaled > 0n) out.push({ chain: 'ethereum', asset: 'aEthUSDC (scaled)', amount: Number(formatUnits(scaled, 6)), raw: scaled.toString(), decimals: 6, contract: AAVE_AUSDC, holder: vault });
  return out;
}

export const AAVE_AUSDC = '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c' as const;

export const SAFETY_EVENTS = [
  'LargeWithdrawalQueued', 'LargeWithdrawalExecuted', 'LargeWithdrawalCancelled',
  'Paused', 'Unpaused', 'ActionProposed', 'ActionFinalized', 'ActionCancelled',
  'Upgraded', 'RateLimitUpdated', 'RoleMembersUpdated', 'AdminWithdrawERC20', 'AdminWithdrawETH',
  'ValidatorsUpdated', 'ThresholdUpdated', 'TimelockConfigUpdated', 'AssetWhitelisted', 'OwnershipTransferred', 'LargeThresholdUpdated',
] as const;
