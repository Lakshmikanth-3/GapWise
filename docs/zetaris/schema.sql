-- GapWise tables in Zetaris. Create them in a writable data source registered in Zetaris (for example the Postgres
-- that ZeroGap already supports via DATABASE_URL), exposed under the schema named in ZETARIS_SCHEMA (default gapwise).
-- Run each statement separately (Zetaris getting-started: scripts/run_sql.py, or the SQL Editor). Rows are written by
-- packages/zetaris/tables.ts after every scan; the Gap Investigator only reads them (packages/zetaris/client.ts guardSql).
CREATE TABLE gapwise.scans (scan_id VARCHAR(16), reserves_usd DOUBLE, liabilities_usd DOUBLE, ratio DOUBLE, gap_usd DOUBLE, status VARCHAR(32), ts VARCHAR(32), report_sha256 VARCHAR(64), accounts_read INT);
CREATE TABLE gapwise.reserves (scan_id VARCHAR(16), chain VARCHAR(16), address VARCHAR(128), asset VARCHAR(64), raw_amount VARCHAR(80), decimals INT, amount DOUBLE, price DOUBLE, usd DOUBLE, ts VARCHAR(32));
CREATE TABLE gapwise.liabilities (scan_id VARCHAR(16), account_id VARCHAR(80), sub_account BOOLEAN, equity DOUBLE, unrealized_pnl DOUBLE, margin_balance DOUBLE, vault_shares DOUBLE, staking DOUBLE, ts VARCHAR(32));
CREATE TABLE gapwise.prices (scan_id VARCHAR(16), asset VARCHAR(64), price DOUBLE, source VARCHAR(256), ts VARCHAR(32));
CREATE TABLE gapwise.flows (day VARCHAR(10), chain VARCHAR(16), reported_usd DOUBLE, onchain_usd DOUBLE, reported_in DOUBLE, onchain_in DOUBLE, reported_out DOUBLE, onchain_out DOUBLE);
CREATE TABLE gapwise.safety_events (chain VARCHAR(16), type VARCHAR(48), detail VARCHAR(512), tx_hash VARCHAR(100), ts VARCHAR(32));
