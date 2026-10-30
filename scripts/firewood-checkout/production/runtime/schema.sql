CREATE TABLE IF NOT EXISTS fw_identity(id text PRIMARY KEY,account text NOT NULL,mode text NOT NULL CHECK(mode IN ('sandbox','live')),origin text NOT NULL,policy_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS fw_control(id boolean PRIMARY KEY DEFAULT true CHECK(id),paused boolean NOT NULL DEFAULT true,updated_at bigint NOT NULL);
INSERT INTO fw_control(id,paused,updated_at) VALUES(true,true,0) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS fw_access(id text PRIMARY KEY,expires bigint NOT NULL);
CREATE TABLE IF NOT EXISTS fw_sessions(id text PRIMARY KEY,csrf text NOT NULL,expires bigint NOT NULL,order_id uuid,lease text,lease_until bigint NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS fw_orders(id uuid PRIMARY KEY,session_id text NOT NULL REFERENCES fw_sessions(id),number text NOT NULL UNIQUE,
 quote jsonb NOT NULL,contact jsonb NOT NULL,terms jsonb NOT NULL,created_at bigint NOT NULL,payment_id text UNIQUE,payment_url text,payment_intent text UNIQUE,
 payment_status text NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','refunded')),fulfillment text NOT NULL DEFAULT 'awaiting-payment',
 delivery_start bigint,delivery_end bigint,version integer NOT NULL DEFAULT 0,refund_cents integer NOT NULL DEFAULT 0 CHECK(refund_cents>=0),disputed boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS fw_events(id text PRIMARY KEY,object_id text NOT NULL,event_type text NOT NULL,attempt uuid,
 payload jsonb NOT NULL,created_at bigint NOT NULL,status text NOT NULL DEFAULT 'pending',tries integer NOT NULL DEFAULT 0,retry_at bigint NOT NULL DEFAULT 0,
 lease text,lease_until bigint NOT NULL DEFAULT 0,last_code text);
CREATE INDEX IF NOT EXISTS fw_events_due ON fw_events(status,retry_at,lease_until);
CREATE TABLE IF NOT EXISTS fw_reconcile(id uuid PRIMARY KEY REFERENCES fw_orders(id),created_at bigint NOT NULL,status text NOT NULL DEFAULT 'pending',
 tries integer NOT NULL DEFAULT 0,retry_at bigint NOT NULL DEFAULT 0,lease text,lease_until bigint NOT NULL DEFAULT 0,last_code text);
CREATE TABLE IF NOT EXISTS fw_outbox(id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES fw_orders(id),audience text NOT NULL CHECK(audience IN ('customer','owner')),
 message jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',tries integer NOT NULL DEFAULT 0,retry_at bigint NOT NULL DEFAULT 0,lease text,
 lease_until bigint NOT NULL DEFAULT 0,last_code text,first_send bigint,provider_id text,UNIQUE(order_id,audience));
CREATE TABLE IF NOT EXISTS fw_refunds(id uuid PRIMARY KEY,order_id uuid NOT NULL UNIQUE REFERENCES fw_orders(id),amount integer NOT NULL CHECK(amount>0),
 reason text NOT NULL,created_at bigint NOT NULL,status text NOT NULL DEFAULT 'pending',tries integer NOT NULL DEFAULT 0,retry_at bigint NOT NULL DEFAULT 0,
 lease text,lease_until bigint NOT NULL DEFAULT 0,last_code text,provider_id text UNIQUE);
CREATE TABLE IF NOT EXISTS fw_quotes(id text PRIMARY KEY,email_hash text NOT NULL,quantity text NOT NULL,stacking boolean NOT NULL,quote jsonb NOT NULL,expires bigint NOT NULL,used_by uuid UNIQUE);
CREATE TABLE IF NOT EXISTS fw_audit(id uuid PRIMARY KEY,order_id uuid,action text NOT NULL,detail jsonb NOT NULL,created_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS fw_rate(id text PRIMARY KEY,window_start bigint NOT NULL,used integer NOT NULL);
CREATE TABLE IF NOT EXISTS fw_heartbeat(id boolean PRIMARY KEY DEFAULT true CHECK(id),started bigint,finished bigint);
CREATE OR REPLACE FUNCTION fw_freeze_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id<>OLD.id OR NEW.session_id<>OLD.session_id OR NEW.quote<>OLD.quote OR NEW.contact<>OLD.contact OR NEW.terms<>OLD.terms OR NEW.created_at<>OLD.created_at OR NEW.number<>OLD.number
 OR (OLD.payment_id IS NOT NULL AND NEW.payment_id IS DISTINCT FROM OLD.payment_id)
 OR (OLD.payment_intent IS NOT NULL AND NEW.payment_intent IS DISTINCT FROM OLD.payment_intent)
 OR (OLD.payment_status IN ('paid','refunded') AND NEW.payment_status='pending')
 OR (OLD.payment_status='refunded' AND NEW.payment_status<>'refunded') OR NEW.refund_cents<OLD.refund_cents
 THEN RAISE EXCEPTION 'immutable_firewood_order'; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS fw_order_immutable ON fw_orders;
CREATE TRIGGER fw_order_immutable BEFORE UPDATE ON fw_orders FOR EACH ROW EXECUTE FUNCTION fw_freeze_order();
