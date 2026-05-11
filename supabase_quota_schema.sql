create table if not exists public.anonymous_quota_usage (
  user_key text not null,
  usage_date date not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_key, usage_date)
);

create index if not exists anonymous_quota_usage_usage_date_idx
  on public.anonymous_quota_usage (usage_date);
