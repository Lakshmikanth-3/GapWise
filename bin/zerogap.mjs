#!/usr/bin/env node
// `npx zerogap verify` (from a clone, or `npx github:Lakshmikanth-3/ZeroGap verify`): runs scripts/verify.ts with tsx.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cmd = process.argv[2] ?? 'verify';
if (cmd !== 'verify') { console.error('usage: zerogap verify'); process.exit(2); }
const tsx = createRequire(import.meta.url).resolve('tsx/cli');
const r = spawnSync(process.execPath, [tsx, join(root, 'scripts', 'verify.ts')], { stdio: 'inherit', cwd: process.cwd(), env: process.env });
process.exit(r.status ?? 1);
