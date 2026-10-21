-- ZeroGap schema (Postgres / Supabase). Every number carries its source and timestamp.

create table if not exists reserve_snapshots (
  id bigserial primary key,
  ts timestamptz not null,
  chain text not null,
  holder text,
  asset text not null,
  contract text,
  amount numeric not null,
  raw_amount numeric,
  usd_price numeric,
  usd_value numeric,
  price_source text not null,
  price_status text not null check (price_status in ('priced', 'stale', 'unpriced'))
);
create index if not exists reserve_snapshots_ts on reserve_snapshots (ts desc);

create table if not exists liability_snapshots (
  id bigserial primary key,
  ts timestamptz not null,
  started_at timestamptz not null,
  accounts_listed int not null,
  vaults_excluded int not null,
  subaccounts_discovered int not null,
  accounts_read int not null,
  failures int not null,
  margin_usd numeric not null,
  staking_rewards_usd numeric not null,
  locked_rewards_usd numeric not null,
  pending_components jsonb not null default '[]',
  vaults_audit_usd numeric,
  total_usd numeric not null
);

create table if not exists ratio_snapshots (
  id bigserial primary key,
  ts timestamptz not null,
  reserves_usd numeric not null,
  liabilities_usd numeric not null,
  ratio numeric,
  status text,
  explained_by text,
  confidence text not null,
  unpriced jsonb not null default '[]'
);

create table if not exists flow_checks (
  day date not null, chain text not null,
  reported_in numeric, onchain_in numeric, reported_out numeric, onchain_out numeric, match_pct numeric,
  primary key (day, chain)
);

create table if not exists safety_events (
  id bigserial primary key, ts timestamptz not null, chain text not null, type text not null,
  amount numeric, tx_hash text, status text, unique (chain, tx_hash, type)
);

create table if not exists alerts (
  id bigserial primary key, ts timestamptz not null, rule text not null, severity text not null,
  message text not null, key text not null, sent boolean not null default false, simulated boolean not null default false
);
