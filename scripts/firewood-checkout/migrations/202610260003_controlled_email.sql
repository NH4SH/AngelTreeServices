-- Separate from local confirmation captures. Only the hosted test worker uses it.
CREATE TABLE firewood_test_environment (
  id text PRIMARY KEY CHECK (id='website-firewood-isolated-test'),
  site_id text NOT NULL CHECK (site_id='88db4909-b179-4f0f-a3a5-fa00860c0a9a')
);
INSERT INTO firewood_test_environment VALUES ('website-firewood-isolated-test','88db4909-b179-4f0f-a3a5-fa00860c0a9a');
CREATE TABLE firewood_test_email_delivery (
  id text PRIMARY KEY REFERENCES firewood_test_outbox(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','review')),
  payload jsonb,
  first_attempt_at bigint,
  tries integer NOT NULL DEFAULT 0,
  retry_at bigint NOT NULL DEFAULT 0,
  lease_id text,
  lease_until bigint NOT NULL DEFAULT 0,
  provider_id text UNIQUE,
  accepted_at bigint,
  last_code text
);
CREATE INDEX firewood_test_email_due ON firewood_test_email_delivery(status,retry_at,lease_until);
CREATE TABLE firewood_test_email_budget (
  id integer PRIMARY KEY CHECK (id=1),
  used integer NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND 10)
);
INSERT INTO firewood_test_email_budget(id) VALUES(1);
