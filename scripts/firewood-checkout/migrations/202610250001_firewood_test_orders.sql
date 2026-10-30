CREATE TABLE firewood_test_attempts (
  id text PRIMARY KEY,
  reference text NOT NULL,
  order_number text NOT NULL UNIQUE,
  quote jsonb NOT NULL,
  contact jsonb NOT NULL,
  payment_id text UNIQUE,
  payment_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_at bigint NOT NULL,
  paid_at bigint,
  confirmed_by text,
  CHECK (payment_id IS NULL OR payment_id LIKE 'cs_test_%' OR payment_id LIKE 'local_%'),
  CHECK ((quote->>'deliveryCents')::integer = 0)
);
CREATE INDEX firewood_test_attempt_reference ON firewood_test_attempts(reference);

CREATE TABLE firewood_test_browser_sessions (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  expires bigint NOT NULL
);

CREATE TABLE firewood_test_payment_events (
  id text PRIMARY KEY,
  attempt text NOT NULL REFERENCES firewood_test_attempts(id),
  received_at bigint NOT NULL
);

CREATE TABLE firewood_test_outbox (
  id text PRIMARY KEY,
  attempt text NOT NULL REFERENCES firewood_test_attempts(id),
  audience text NOT NULL CHECK (audience IN ('customer', 'owner')),
  message jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'captured')),
  tries integer NOT NULL DEFAULT 0,
  retry_at bigint NOT NULL DEFAULT 0,
  UNIQUE (attempt, audience)
);

-- A test sink, not an email delivery log. Nothing leaves this database.
CREATE TABLE firewood_test_confirmations (
  id text PRIMARY KEY REFERENCES firewood_test_outbox(id),
  message jsonb NOT NULL,
  captured_at bigint NOT NULL
);
