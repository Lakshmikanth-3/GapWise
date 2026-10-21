/** Token bucket: at most `rps` calls start in any rolling second. */
export function createRateLimiter(rps: number, now = () => Date.now(), sleep = (ms: number) => new Promise(r => setTimeout(r, ms))) {
  const starts: number[] = [];
  return async function take(): Promise<void> {
    for (;;) {
      const t = now();
      while (starts.length && t - starts[0] >= 1000) starts.shift();
      if (starts.length < rps) { starts.push(t); return; }
      await sleep(1000 - (t - starts[0]) + 1);
    }
  };
}

export async function withRetry<T>(fn: () => Promise<T>, tries = 3, baseMs = 300): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (i < tries - 1) await new Promise(r => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}
