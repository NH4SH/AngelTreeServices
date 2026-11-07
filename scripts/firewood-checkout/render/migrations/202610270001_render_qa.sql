-- Applied only to a new, explicitly identified Render QA database.
CREATE TABLE firewood_render_environment (
  id text PRIMARY KEY CHECK(id='angel-firewood-render-qa'),
  origin text NOT NULL, web_id text NOT NULL, worker_id text NOT NULL,
  account_id text NOT NULL CHECK(account_id='acct_1UU9U8RAZXGe6tX0')
);
CREATE TABLE firewood_render_sessions (
  id text PRIMARY KEY, csrf text NOT NULL, expires bigint NOT NULL,
  attempt text REFERENCES firewood_test_attempts(id), lease_id text,
  lease_until bigint NOT NULL DEFAULT 0
);
CREATE TABLE firewood_render_access (id text PRIMARY KEY, expires bigint NOT NULL);
CREATE TABLE firewood_render_limits (id text PRIMARY KEY, used integer NOT NULL DEFAULT 0 CHECK(used BETWEEN 0 AND 8));
INSERT INTO firewood_render_limits(id) VALUES('attempts');
CREATE TABLE firewood_render_rate (id text PRIMARY KEY, window_start bigint NOT NULL, used integer NOT NULL);
CREATE TABLE firewood_render_reconciliation (
  attempt text PRIMARY KEY REFERENCES firewood_test_attempts(id),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','expired','review')),
  retry_at bigint NOT NULL DEFAULT 0, lease_id text, lease_until bigint NOT NULL DEFAULT 0,
  tries integer NOT NULL DEFAULT 0, last_code text
);
CREATE INDEX firewood_render_reconcile_due ON firewood_render_reconciliation(status,retry_at,lease_until);
CREATE TABLE firewood_render_events (
  id text PRIMARY KEY, attempt text NOT NULL, session_id text NOT NULL,
  reference text NOT NULL, event_type text NOT NULL, received_at bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','done','review')),
  retry_at bigint NOT NULL DEFAULT 0, lease_id text, lease_until bigint NOT NULL DEFAULT 0,
  tries integer NOT NULL DEFAULT 0, last_code text
);
CREATE INDEX firewood_render_event_due ON firewood_render_events(status,retry_at,lease_until);
CREATE TABLE firewood_render_heartbeat (id text PRIMARY KEY, started_at bigint NOT NULL, finished_at bigint, last_code text);
-- The old local/Netlify worker keeps its default ten-message budget. Only this
-- separate Render schema allows the explicitly bounded sixteen-copy QA batch.
ALTER TABLE firewood_test_email_budget DROP CONSTRAINT firewood_test_email_budget_used_check;
ALTER TABLE firewood_test_email_budget ADD CHECK(used BETWEEN 0 AND 16);
