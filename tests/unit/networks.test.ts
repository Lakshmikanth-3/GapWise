import { describe, it, expect, vi, afterEach } from 'vitest';

const load = async (network?: string) => {
  vi.resetModules();
  if (network) process.env.ZEROGAP_NETWORK = network; else delete process.env.ZEROGAP_NETWORK;
  return import('../../packages/core/config');
};
afterEach(() => { delete process.env.ZEROGAP_NETWORK; vi.resetModules(); });

describe('network selection (mainnet published, testnet labelled)', () => {
  it('defaults to mainnet with the founder-confirmed lockers', async () => {
    const c = await load();
    expect(c.NETWORK).toBe('mainnet');
    expect(c.env.strikeApi).toBe(process.env.STRIKE_API ?? 'https://api.strikefinance.org');
    expect(c.LOCKERS.ethereum).toBe('0xbF4cFccd11257e568A936a7867D138f54A43cffa');
    expect(c.LOCKERS.cardano).toHaveLength(2);
    expect(c.EXPLORERS.ethereum('0x1')).toBe('https://etherscan.io/address/0x1');
  });

  it('testnet switches API, lockers, chains and explorers together', async () => {
    const c = await load('testnet');
    expect(c.NETWORK).toBe('testnet');
    expect(c.env.strikeApi).toMatch(/api-v2-testnet\.strikefinance\.org/);
    expect(c.LOCKERS).toMatchObject({
      ethereum: '0x879e450F2482a2DEcbd27176A4c177e69Bd7A0E6',
      solana: 'Di862rQJwGgMLtrchoBfkcehEKXPpYnppeA9Gmxtasin',
      solanaProgram: 'FSNjjtrZP2BiuPfyRjTWQUybN8QNnEQgUogho79SMzXt',
      cardano: ['addr_test1wpuakhm8ftcwy2t00vhxp3rmqev90cs5xqf6ynu7f7rxrrg4rlm70'],
    });
    expect(c.NET.ethChain).toBe('sepolia');
    expect(c.EXPLORERS.ethereum('0x1')).toBe('https://sepolia.etherscan.io/address/0x1');
    expect(c.EXPLORERS.solana('X')).toBe('https://solscan.io/account/X?cluster=devnet');
    expect(c.EXPLORERS.cardano('a')).toBe('https://preprod.cardanoscan.io/address/a');
  });

  it('testnet never uses the mainnet RPC keys from .env', async () => {
    process.env.ETH_RPC_URL = 'https://eth-mainnet.g.alchemy.com/v2/realmainnetkey123';
    const c = await load('testnet');
    expect(c.env.ethRpc()).toBe('https://ethereum-sepolia-rpc.publicnode.com');
  });
});
