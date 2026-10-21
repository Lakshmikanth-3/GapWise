// Browser-side Strike Builder Connect client (docs.strikefinance.org/api/builder-codes.md).
// The API-wallet Ed25519 private key is generated here and NEVER leaves this tab (kept in memory only).
// Strike allows CORS from any origin, so requests go straight from the browser to Strike.

const enc = new TextEncoder();
export const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
export const unhex = (h) => new Uint8Array((h.replace(/^0x/, '').match(/../g) ?? []).map((x) => parseInt(x, 16)));

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = '1' + s; }
  return s;
}

// --- bech32 (Cardano addresses arrive from CIP-30 as hex) ---
const CS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(v) { const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; let c = 1; for (const x of v) { const t = c >> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((t >> i) & 1) c ^= G[i]; } return c; }
function convert(data, from, to) { let acc = 0, bits = 0; const out = []; const max = (1 << to) - 1; for (const v of data) { acc = (acc << from) | v; bits += from; while (bits >= to) { bits -= to; out.push((acc >> bits) & max); } } if (bits > 0) out.push((acc << (to - bits)) & max); return out; }
export function bech32(hrp, bytes) {
  const data = convert(bytes, 8, 5);
  const hv = [...hrp].map((c) => c.charCodeAt(0) >> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31));
  const mod = polymod(hv.concat(data, [0, 0, 0, 0, 0, 0])) ^ 1;
  const chk = [0, 1, 2, 3, 4, 5].map((i) => (mod >> (5 * (5 - i))) & 31);
  return `${hrp}1${data.concat(chk).map((d) => CS[d]).join('')}`;
}
export const cardanoHexToBech32 = (h) => { const b = unhex(h); return bech32((b[0] & 0x0f) === 1 ? 'addr' : 'addr_test', b); };

export async function sha256Hex(text) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))); }

/** Message format from the docs: {METHOD}:{PATH}:{TIMESTAMP}:{NONCE}:{BODY_HASH}. */
export async function signingMessage(method, path, ts, nonce, body) {
  return `${method.toUpperCase()}:${path}:${ts}:${nonce}:${await sha256Hex(body ?? '')}`;
}

export class StrikeClient {
  constructor(base, nacl) { this.base = base; this.nacl = nacl; this.keys = null; }

  newApiWallet() { this.keys = this.nacl.sign.keyPair(); return hex(this.keys.publicKey); }

  async raw(method, path, body, headers = {}) {
    const res = await fetch(this.base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!res.ok) throw new Error(json.error || json.message || `${res.status} ${text.slice(0, 160)}`);
    return json;
  }

  /** Authenticated request signed with the in-memory API wallet key. */
  async authed(method, path, body) {
    if (!this.keys) throw new Error('Not connected');
    const payload = body === undefined ? '' : JSON.stringify(body);
    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();
    const msg = await signingMessage(method, path, ts, nonce, payload);
    const sig = this.nacl.sign.detached(enc.encode(msg), this.keys.secretKey);
    return this.raw(method, path, body, {
      'X-API-Wallet-Public-Key': hex(this.keys.publicKey), 'X-API-Wallet-Signature': hex(sig),
      'X-API-Wallet-Timestamp': ts, 'X-API-Wallet-Nonce': nonce,
    });
  }

  requestSignature(p) { return this.raw('POST', '/auth/builder/request-signature', p); }
  verifySignature(p) { return this.raw('POST', '/auth/builder/verify-signature', p); }
  account(accountId) { return this.raw('GET', `/v2/account?account_id=${encodeURIComponent(accountId)}`); }
  balances(accountId) { return this.raw('GET', `/v2/balances?account_id=${encodeURIComponent(accountId)}`); }
  withdrawQuote(p) { return this.authed('POST', '/v2/withdraw/quote', p); }
  withdraw(p) { return this.authed('POST', '/v2/withdraw', p); }
}

// --- Wallet adapters: each returns { chain, address, label, signMessage(text) → signature in Strike's format } ---
export const WALLETS = {
  phantom: {
    label: 'Phantom (Solana)', chain: 'solana', available: () => !!window.phantom?.solana || !!window.solana?.isPhantom,
    async connect() {
      const p = window.phantom?.solana ?? window.solana;
      const { publicKey } = await p.connect();
      return { address: publicKey.toString(), signMessage: async (t) => base58((await p.signMessage(enc.encode(t), 'utf8')).signature) };
    },
  },
  evm: {
    label: 'MetaMask / Rabby (Ethereum)', chain: 'ethereum', available: () => !!window.ethereum,
    async connect() {
      const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' });
      return { address, signMessage: (t) => window.ethereum.request({ method: 'personal_sign', params: ['0x' + hex(enc.encode(t)), address] }) };
    },
  },
  cardano: {
    label: 'Cardano (CIP-30)', chain: 'cardano', available: () => !!window.cardano && Object.values(window.cardano).some((w) => w?.enable),
    async connect() {
      const name = ['eternl', 'lace', 'nami', 'yoroi', 'typhoncip30', 'vespr', 'begin'].find((n) => window.cardano?.[n]?.enable) ?? Object.keys(window.cardano).find((n) => window.cardano[n]?.enable);
      const api = await window.cardano[name].enable();
      const addrHex = (await api.getUsedAddresses())[0] ?? (await api.getChangeAddress());
      const address = cardanoHexToBech32(addrHex);
      return { address, label: name, signMessage: async (t) => { const r = await api.signData(addrHex, hex(enc.encode(t))); return `${r.signature}:${r.key}`; } };
    },
  },
};
