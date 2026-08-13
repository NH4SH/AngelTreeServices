-- Assign durable quote numbers at the database boundary so every creation path
-- shares the same concurrency-safe sequence for the business date.
create or replace function public.assign_quote_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  business_date date;
  date_stamp text;
  number_prefix text;
  next_sequence integer;
begin
  if nullif(pg_catalog.btrim(new.quote_number), '') is not null then
    return new;
  end if;

  business_date := (current_timestamp at time zone 'America/New_York')::date;
  date_stamp := pg_catalog.to_char(business_date, 'YYYYMMDD');
  number_prefix := 'Q-' || date_stamp || '-';

  -- Serialize allocation for this business date before reading the current max.
  perform pg_catalog.pg_advisory_xact_lock(415453, date_stamp::integer);

  select coalesce(
    pg_catalog.max(substring(quote.quote_number from pg_catalog.length(number_prefix) + 1)::integer),
    0
  ) + 1
  into next_sequence
  from public.quotes as quote
  where quote.quote_number like number_prefix || '%'
    and quote.quote_number ~ ('^' || number_prefix || '[0-9]+$');

  new.quote_number := number_prefix || pg_catalog.lpad(
    next_sequence::text,
    greatest(3, pg_catalog.length(next_sequence::text)),
    '0'
  );

  return new;
end;
$$;

drop trigger if exists quotes_assign_quote_number on public.quotes;
create trigger quotes_assign_quote_number
before insert on public.quotes
for each row execute function public.assign_quote_number();

revoke all on function public.assign_quote_number() from public, anon, authenticated;

comment on function public.assign_quote_number() is
  'Assigns a unique date-based quote number when a new quote does not already provide one.';
