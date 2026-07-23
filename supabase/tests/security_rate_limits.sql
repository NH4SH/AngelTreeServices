begin;

select plan(8);

select is((select allowed from public.consume_security_rate_limit('test.portal', repeat('a', 64), 2, 1)), true, 'first request is allowed');
select is((select remaining from public.consume_security_rate_limit('test.portal', repeat('a', 64), 2, 1)), 0, 'second request consumes the shared quota');
select is((select allowed from public.consume_security_rate_limit('test.portal', repeat('a', 64), 2, 1)), false, 'request over the shared quota is denied');
select ok((select retry_after_seconds >= 1 from public.consume_security_rate_limit('test.portal', repeat('a', 64), 2, 1)), 'denied request receives a retry window');
select is((select sum(request_count)::integer from public.security_rate_limits where action_name = 'test.portal'), 4, 'all attempts are recorded atomically in one aggregate bucket');
do $$ begin perform pg_sleep(1.1); end $$;
select is((select allowed from public.consume_security_rate_limit('test.portal', repeat('a', 64), 2, 1)), true, 'quota resets in the next fixed window');
select ok(not has_function_privilege('authenticated', 'public.consume_security_rate_limit(text,text,integer,integer)', 'EXECUTE'), 'browser users cannot invoke the internal limiter directly');
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and tablename = 'security_rate_limits' and indexname = 'security_rate_limits_expiry_idx'), 'rate-limit rows have a bounded-retention index');

select * from finish();
rollback;
