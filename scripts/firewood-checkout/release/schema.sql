-- Source-derived Website office-v2 DDL. Requires a fresh private schema and the separately guarded installer.
-- No source/role/admission/credential seed, identity hash, writer grant or activation is included.

CREATE TABLE IF NOT EXISTS fwofficev2_identity(id boolean PRIMARY KEY CHECK(id), hash text NOT NULL);

CREATE TABLE IF NOT EXISTS fwofficev2_sessions(id text PRIMARY KEY, csrf text NOT NULL, expires bigint NOT NULL, draft_id uuid, order_id uuid UNIQUE);

CREATE TABLE IF NOT EXISTS fwofficev2_control(id boolean PRIMARY KEY CHECK(id), paused boolean NOT NULL);

INSERT INTO fwofficev2_control VALUES(true,true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS fwofficev2_rate(id text PRIMARY KEY, at bigint NOT NULL, used integer NOT NULL);

CREATE TABLE IF NOT EXISTS fwofficev2_drafts(id uuid PRIMARY KEY, session_id text NOT NULL REFERENCES fwofficev2_sessions(id), request jsonb NOT NULL, created_at bigint NOT NULL);

CREATE TABLE IF NOT EXISTS fwofficev2_price_queue(id uuid PRIMARY KEY REFERENCES fwofficev2_drafts(id),
      status text NOT NULL CHECK(status IN ('pending','requested','review')), tries integer NOT NULL DEFAULT 0,
      retry_at bigint NOT NULL DEFAULT 0, lease uuid, lease_until bigint NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS fwofficev2_prices(id uuid PRIMARY KEY REFERENCES fwofficev2_drafts(id), revision bigint NOT NULL, receipt jsonb NOT NULL);

CREATE TABLE IF NOT EXISTS fwofficev2_price_history(id uuid NOT NULL REFERENCES fwofficev2_drafts(id), revision bigint NOT NULL, receipt jsonb NOT NULL, PRIMARY KEY(id,revision));

CREATE TABLE IF NOT EXISTS fwofficev2_orders(id uuid PRIMARY KEY, session_id text UNIQUE NOT NULL REFERENCES fwofficev2_sessions(id),
      chosen jsonb NOT NULL, request jsonb NOT NULL, office_receipt jsonb, created_at bigint NOT NULL);

CREATE TABLE IF NOT EXISTS fwofficev2_prepare(id uuid PRIMARY KEY REFERENCES fwofficev2_orders(id),
      status text NOT NULL CHECK(status IN ('pending','prepared','review')), receipt jsonb, invoice_id uuid UNIQUE,
      tries integer NOT NULL DEFAULT 0, retry_at bigint NOT NULL DEFAULT 0, lease uuid, lease_until bigint NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS fwofficev2_observations(id uuid PRIMARY KEY REFERENCES fwofficev2_orders(id), revision bigint NOT NULL, receipt jsonb NOT NULL,
      CHECK(COALESCE(receipt->>'order_state' IN ('active','cancellation_requested','cancelled')
        AND jsonb_typeof(receipt->'workflow_revision')='number' AND (receipt->>'workflow_revision')::bigint>=0
        AND jsonb_typeof(receipt->'accounting')='object' AND receipt->'accounting' ?& array['issued_at','original_principal_cents','raw_balance_due_cents','credited_principal_cents','collectible_balance_cents','credit_id'],false)));

CREATE TABLE IF NOT EXISTS fwofficev2_history(id uuid NOT NULL REFERENCES fwofficev2_orders(id), revision bigint NOT NULL, receipt jsonb NOT NULL, PRIMARY KEY(id,revision));

CREATE OR REPLACE FUNCTION fwofficev2_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable_office_history'; END $$;

DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_identity;

CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_identity FOR EACH ROW EXECUTE FUNCTION fwofficev2_immutable();

DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_drafts;

CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_drafts FOR EACH ROW EXECUTE FUNCTION fwofficev2_immutable();

DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_orders;

CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_orders FOR EACH ROW EXECUTE FUNCTION fwofficev2_immutable();

DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_price_history;

CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_price_history FOR EACH ROW EXECUTE FUNCTION fwofficev2_immutable();

DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_history;

CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_history FOR EACH ROW EXECUTE FUNCTION fwofficev2_immutable();

CREATE OR REPLACE FUNCTION fwofficev2_observation_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.revision<OLD.revision
        OR NEW.revision=OLD.revision AND NEW.receipt IS DISTINCT FROM OLD.receipt
        OR NEW.receipt->>'invoice_id' IS DISTINCT FROM OLD.receipt->>'invoice_id'
        OR (NEW.receipt->>'workflow_revision')::bigint < (OLD.receipt->>'workflow_revision')::bigint
        OR NEW.receipt->>'workflow_revision'=OLD.receipt->>'workflow_revision' AND NEW.receipt->>'order_state' IS DISTINCT FROM OLD.receipt->>'order_state'
        OR OLD.receipt->>'order_state'<>'active' AND NEW.receipt->>'order_state'='active'
        OR OLD.receipt->>'order_state'='cancelled' AND NEW.receipt->>'order_state'<>'cancelled'
        OR NEW.receipt#>'{accounting,issued_at}' IS DISTINCT FROM OLD.receipt#>'{accounting,issued_at}'
        OR NEW.receipt#>'{accounting,original_principal_cents}' IS DISTINCT FROM OLD.receipt#>'{accounting,original_principal_cents}'
        OR OLD.receipt#>'{accounting,credit_id}'='null'::jsonb AND NEW.receipt#>'{accounting,credit_id}'<>'null'::jsonb
          AND (NEW.receipt->>'workflow_revision')::bigint<=(OLD.receipt->>'workflow_revision')::bigint
        OR OLD.receipt#>'{accounting,credit_id}'<>'null'::jsonb AND
          (NEW.receipt#>'{accounting,credit_id}' IS DISTINCT FROM OLD.receipt#>'{accounting,credit_id}'
            OR NEW.receipt#>'{accounting,credited_principal_cents}' IS DISTINCT FROM OLD.receipt#>'{accounting,credited_principal_cents}')
        OR OLD.receipt->'original_paid_evidence'<>'null'::jsonb AND NEW.receipt->'original_paid_evidence' IS DISTINCT FROM OLD.receipt->'original_paid_evidence'
      THEN RAISE EXCEPTION 'immutable_office_observation'; END IF; RETURN NEW; END $$;

DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_observations;

CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_observations FOR EACH ROW EXECUTE FUNCTION fwofficev2_observation_guard();

CREATE OR REPLACE FUNCTION fwofficev2_price_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.revision<OLD.revision
        OR NEW.revision=OLD.revision AND NEW.receipt IS DISTINCT FROM OLD.receipt
      THEN RAISE EXCEPTION 'immutable_office_price'; END IF; RETURN NEW; END $$;

DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_prices;

CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_prices FOR EACH ROW EXECUTE FUNCTION fwofficev2_price_guard();

CREATE OR REPLACE FUNCTION fwofficev2_preparation_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR OLD.invoice_id IS NOT NULL AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
      THEN RAISE EXCEPTION 'immutable_office_invoice'; END IF; RETURN NEW; END $$;

DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_prepare;

CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_prepare FOR EACH ROW EXECUTE FUNCTION fwofficev2_preparation_guard();

ALTER TABLE fwofficev2_prepare ADD COLUMN IF NOT EXISTS next_status_at bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS fwofficev2_confirmations(order_id uuid PRIMARY KEY REFERENCES fwofficev2_orders(id),
      observation_revision bigint NOT NULL, paid_evidence jsonb NOT NULL, messages jsonb NOT NULL, created_at bigint NOT NULL);

CREATE TABLE IF NOT EXISTS fwofficev2_outbox(order_id uuid NOT NULL REFERENCES fwofficev2_confirmations(order_id),
      kind text NOT NULL CHECK(kind IN ('customer_order','owner_order')),recipient text NOT NULL,message jsonb NOT NULL,
      idempotency_key text NOT NULL UNIQUE,status text NOT NULL CHECK(status IN ('pending','processing','accepted','review','suppressed')),
      tries integer NOT NULL DEFAULT 0,retry_at bigint NOT NULL DEFAULT 0,lease uuid,lease_until bigint NOT NULL DEFAULT 0,
      first_send_at bigint,provider_id text UNIQUE,last_code text,created_at bigint NOT NULL,PRIMARY KEY(order_id,kind));

CREATE TABLE IF NOT EXISTS fwofficev2_heartbeat(id boolean PRIMARY KEY CHECK(id),lease uuid,lease_until bigint NOT NULL DEFAULT 0,
      started_at bigint,finished_at bigint,last_code text);

INSERT INTO fwofficev2_heartbeat(id)VALUES(true) ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_confirmations;

CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_confirmations FOR EACH ROW EXECUTE FUNCTION fwofficev2_immutable();

CREATE OR REPLACE FUNCTION fwofficev2_outbox_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='DELETE' OR (NEW.order_id,NEW.kind,NEW.recipient,NEW.message,NEW.idempotency_key,NEW.created_at)
        IS DISTINCT FROM (OLD.order_id,OLD.kind,OLD.recipient,OLD.message,OLD.idempotency_key,OLD.created_at)
        OR OLD.first_send_at IS NOT NULL AND NEW.first_send_at IS DISTINCT FROM OLD.first_send_at
        OR OLD.provider_id IS NOT NULL AND NEW.provider_id IS DISTINCT FROM OLD.provider_id
        OR OLD.status IN ('accepted','review','suppressed') AND NEW.status<>OLD.status
        OR NEW.tries<OLD.tries THEN RAISE EXCEPTION 'immutable_order_confirmation'; END IF; RETURN NEW; END $$;

DROP TRIGGER IF EXISTS fwofficev2_guard ON fwofficev2_outbox;

CREATE TRIGGER fwofficev2_guard BEFORE UPDATE OR DELETE ON fwofficev2_outbox FOR EACH ROW EXECUTE FUNCTION fwofficev2_outbox_guard();
