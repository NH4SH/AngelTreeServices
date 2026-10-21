-- Deliberate stale-version/snapshot rejections are business conflicts, not
-- transient database serialization failures. PostgREST14 retries manual40001.
-- Only error-code tokens change in the exact reviewed100-migration preimage.
-- CREATE OR REPLACE preserves OIDs/ACLs/owners; no grants, RLS, locks or branches change.
DO $conflicts$
DECLARE target record; routine oid; source text; revised text;
BEGIN
 FOR target IN SELECT * FROM (VALUES
    ('app_private.approve_quote_locked(uuid, integer, text)','dbf9c687f0fb1764572383fa8d6ee121','923768656a13ec09daca992aae5c2633'),
    ('app_private.assert_stripe_snapshot(uuid, text, uuid, uuid)','cf20e9928f15ce484cf879451603acb7','c5359e1daf19ae9ac24bc0abc8d24ff9'),
    ('app_private.change_website_sender_block(uuid, jsonb, boolean, boolean, uuid, text, uuid)','22f23c2ddd9469084da690897b4efb85','517a54377cbf427aefa2139b324072ad'),
    ('app_private.claim_attachment_scan(text, text, uuid, text)','c7c2ec26d637213d9be6357b3ecbdb9e','4d3c44afaffe27674332196b62822425'),
    ('app_private.lock_job_completion(uuid, integer, jsonb, boolean, boolean)','9304617726e6fa1fbb2aa9cd39df7859','a0941f5d72cfcd1c6a46139543bfdff9'),
    ('app_private.read_report_dataset(text, timestamp with time zone, timestamp with time zone, jsonb, integer, integer, text, boolean)','b789a65c2cc59514acecb4c01bee5717','3bea6685f89c7873714c0e87d353760d'),
    ('app_private.request_quote_changes_locked(uuid, text, integer, text)','23ad556f510ab5762448170bb30b539b','073950fd9f6ec7eacf407cb2038f152f'),
    ('app_private.save_schedule_event_locked(uuid, integer, jsonb, uuid[], text, boolean, uuid[], text)','1aa9b2b1e49ad27ab62064028a9e8e03','0e8b5d48c947ca1ac94c86de064b6691'),
    ('public.approve_change_order(uuid, text, uuid, text, uuid, text)','488b3f0820965efc634dd818a2247417','6516ed32302eed8a2e0d47ceec644d1a'),
    ('public.approve_recurring_generation(uuid, jsonb)','e599fc16ffe8102ee198ec4ce9dc516d','118e0e19fe5df2abc36c3ab3151a02d2'),
    ('public.finish_outbound_delivery(uuid, uuid, text, text)','83341e4b633d589fc9a4c4e61242c1aa','aef215ac8c91811aefba30a8c1798583'),
    ('public.prepare_outbound_delivery(text, jsonb, jsonb, jsonb)','df7918962ad7a505b1d03808e34b146d','7098d668df59e1b9caeafaeb684ab73e'),
    ('public.prepare_website_notice_batch(uuid, uuid, jsonb)','46b507ef0b46d8ae64bd98c4945cbf12','344a314a860ab295d2c40b53e05a4153'),
    ('public.respond_to_change_order_by_portal(uuid, text, timestamp with time zone, text, text)','de88468ed7a3a883c0cb5d7e891624b8','ecd5cca2f64ef87e57eaa79f238e3809'),
    ('public.retry_calendar_operation(text, bigint, timestamp with time zone, text)','e2f8a7c450a391aec9652b322769a819','f2409d5680ceea2c2204115414c4918e'),
    ('public.review_outbound_delivery(uuid, text, text, uuid)','4563ae9140c898f0cfc6f418d4f78909','682c2d4b6eb14e529f65749a35c29f5b'),
    ('public.save_invoice_details(uuid, timestamp with time zone, timestamp with time zone, jsonb)','95706a1b768849a4a758c2a2cb31f930','daf61172054df582526801a1baf33632'),
    ('public.save_job_employee_work_sessions(uuid, jsonb, text, jsonb, text, boolean)','f1f1326d098f9bebecdacb4ec47806fa','f9aae90c9648876f72137671b64da87f'),
    ('public.save_legacy_appointment(uuid, uuid, integer, jsonb, text, text)','d06dd5a3ea1c667f022421d2b195253b','4f535a4bb66d11f3ec1244203226b79e'),
    ('public.save_quote_details(uuid, integer, jsonb, jsonb, boolean)','44d0953ae0bb307dbeab500c38bee367','d755a4c162a1ba5b1fb54ea4dfe97cf0'),
    ('public.schedule_lead_estimate(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, timestamp with time zone, timestamp with time zone, uuid, text, integer)','f8c6c177811b8ab2eea6f7b02aeef357','559f29f10d6137a9f5d1716b09bd161d'),
    ('public.schedule_party_estimate(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, timestamp with time zone, timestamp with time zone, uuid, text, integer)','ed5741d70d068432cf2ddb4f555b122d','ef34fd710dd59df4674a7640c1e73f40'),
    ('public.update_office_handoff(uuid, timestamp with time zone, uuid, timestamp with time zone)','d87ae2a27e848f6702848bf9709a754d','09ef75da9b60d60a3058d04ffb8ca6bd')
 ) AS reviewed(signature,before_hash,after_hash) LOOP
  routine := to_regprocedure(target.signature);
  IF routine IS NULL THEN RAISE EXCEPTION 'Missing reviewed conflict function: %',target.signature; END IF;
  SELECT prosrc INTO source FROM pg_proc WHERE oid=routine;
  IF md5(source)=target.after_hash THEN CONTINUE; END IF;
  IF md5(source)<>target.before_hash THEN RAISE EXCEPTION 'Unexpected conflict function preimage: %',target.signature; END IF;
  SELECT pg_get_functiondef(routine) INTO revised;
  revised:=regexp_replace(revised,$rx$(errcode[[:space:]]*=[[:space:]]*)'40001'$rx$,$re$\1'PT409'$re$,'gi');
  EXECUTE revised;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid=routine)<>target.after_hash THEN
   RAISE EXCEPTION 'Unexpected conflict function result: %',target.signature;
  END IF;
 END LOOP;
END
$conflicts$;
