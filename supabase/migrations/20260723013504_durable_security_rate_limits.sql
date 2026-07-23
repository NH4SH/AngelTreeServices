create table public.security_rate_limits (
  action_name text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (action_name, key_hash, window_started_at),
  constraint security_rate_limits_key_hash_check check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint security_rate_limits_action_check check (action_name ~ '^[a-z0-9_.:-]{1,80}$')
);

create index security_rate_limits_expiry_idx on public.security_rate_limits(expires_at);
alter table public.security_rate_limits enable row level security;
revoke all on table public.security_rate_limits from public, anon, authenticated;
grant all on table public.security_rate_limits to service_role;

create or replace function public.consume_security_rate_limit(
  p_action_name text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_window timestamptz;
  current_count integer;
  window_end timestamptz;
begin
  if p_action_name !~ '^[a-z0-9_.:-]{1,80}$'
    or p_key_hash !~ '^[0-9a-f]{64}$'
    or p_limit < 1 or p_limit > 10000
    or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit parameters.' using errcode = '22023';
  end if;

  current_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  window_end := current_window + make_interval(secs => p_window_seconds);

  insert into public.security_rate_limits (
    action_name, key_hash, window_started_at, request_count, expires_at, updated_at
  ) values (
    p_action_name, p_key_hash, current_window, 1, window_end + interval '1 hour', clock_timestamp()
  )
  on conflict (action_name, key_hash, window_started_at) do update
  set request_count = public.security_rate_limits.request_count + 1,
      updated_at = clock_timestamp()
  returning request_count into current_count;

  if random() < 0.01 then
    delete from public.security_rate_limits where expires_at < clock_timestamp();
  end if;

  return query select
    current_count <= p_limit,
    greatest(0, p_limit - current_count),
    case when current_count <= p_limit then 0
      else greatest(1, ceil(extract(epoch from (window_end - clock_timestamp())))::integer)
    end;
end;
$$;

revoke all on function public.consume_security_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_security_rate_limit(text, text, integer, integer)
  to service_role;
