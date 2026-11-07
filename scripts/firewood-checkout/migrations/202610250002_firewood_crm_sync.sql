ALTER TABLE firewood_test_attempts ADD COLUMN crm_binding jsonb;
CREATE TABLE firewood_test_crm_sync (
  attempt text PRIMARY KEY REFERENCES firewood_test_attempts(id),
  request jsonb NOT NULL,
  intent_id text NOT NULL CHECK (intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','synced','review')),
  tries integer NOT NULL DEFAULT 0,
  retry_at bigint NOT NULL DEFAULT 0,
  lease_id text,
  lease_until bigint NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 0,
  processed_revision integer NOT NULL DEFAULT -1,
  receipt jsonb,
  last_code text,
  updated_at bigint NOT NULL
);
