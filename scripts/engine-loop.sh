#!/usr/bin/env bash
# Engine loop for GitHub Actions: one real cycle every ~5 minutes (mainnet, then labelled testnet), each published to the
# `zerogap-data` branch the Vercel site serves. GitHub's own cron fires only every few hours, so one job keeps cycling for
# LOOP_MINUTES and the workflow then starts its own next run.
set -u
LOOP_MINUTES=${LOOP_MINUTES:-330}
PERIOD=${PERIOD_SECONDS:-300}
REMOTE="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
end=$(( $(date +%s) + LOOP_MINUTES * 60 ))

mkdir -p data
if git fetch --depth=1 origin zerogap-data 2>/dev/null; then
  git --work-tree=data checkout origin/zerogap-data -- . && git reset -q
fi

while [ "$(date +%s)" -lt "$end" ]; do
  start=$(date +%s)
  ZEROGAP_DATA_DIR=data npx tsx scripts/engine-once.ts || echo "mainnet cycle failed"
  mkdir -p data/testnet
  ZEROGAP_NETWORK=testnet ZEROGAP_DATA_DIR=data/testnet PUBLIC_URL="${PUBLIC_URL}/dashboard?network=testnet" \
    TELEGRAM_BOT_TOKEN= TELEGRAM_CHAT_ID= npx tsx scripts/engine-once.ts || echo "testnet cycle failed"
  (
    cd data && rm -rf .git && rm -f ./*.jsonl testnet/*.jsonl
    git init -q -b zerogap-data
    git config user.name "zerogap-engine"
    git config user.email "zerogap-engine@users.noreply.github.com"
    git add -A && git commit -qm "state $(date -u +%FT%TZ)" && git push -q --force "$REMOTE" zerogap-data
  ) || echo "publish failed"
  left=$(( PERIOD - ($(date +%s) - start) ))
  [ "$left" -gt 0 ] && sleep "$left"
done
