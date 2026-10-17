import assert from 'node:assert/strict';
import test from 'node:test';
import * as crypto from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { load } from './pr10-test-helpers.mjs';
import { scanDocumentBytes } from '../src/lib/security/document-scanner.ts';
import { prepareSafeUpload } from '../src/lib/security/upload-validation.ts';

const enabled = process.env.ATTACHMENT_DISPOSABLE_STACK === '1' && Boolean(process.env.ATTACHMENT_LOCAL_STATUS_FILE) && Boolean(process.env.SCANNER_HOSTING_FIXTURE_FILE);
test('synthetic attachment recovery — bytes, metadata, fresh scans and retained business history', { skip: !enabled }, async t => {
  const c = JSON.parse(readFileSync(process.env.ATTACHMENT_LOCAL_STATUS_FILE, 'utf8'));
  assert.equal(c.API_URL, 'http://127.0.0.1:54321');
  assert.match(process.env.DOCKER_HOST ?? '', /^unix:.*pr02-disposable\/sock\/docker.sock$/);
  const host = JSON.parse(readFileSync(process.env.SCANNER_HOSTING_FIXTURE_FILE, 'utf8')); assert.equal(host.url, 'https://127.0.0.1:33443/scan'); assert.match(host.project, /^ats_host_local_/);
  const token = readFileSync(host.tokenFile, 'utf8').trim();
  const docker = (...args) => execFileSync(host.docker, args, { env: process.env, encoding: 'utf8', timeout: 25000 });
  const engine = JSON.parse(docker('inspect', host.ids.engine))[0]; assert.equal(engine.Config.Labels['com.docker.compose.project'], host.project); assert.equal(engine.Config.Labels['com.docker.compose.service'], 'engine');
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const db = createClient(c.API_URL, c.SERVICE_ROLE_KEY, opts), marker = 'RESTORE_LOCAL_' + crypto.randomUUID().slice(0, 8), actors = [], docs = [], employeeDocs = [], entries = [], results = [];
  const ok = r => { assert.ifError(r.error && Error(r.error.message)); return r.data; };
  const sql = source => docker('exec', '-i', 'supabase_db_ats_pr02_disposable', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', source).trim();
  const original = { document: sql('select enabled from app_private.document_scan_settings where singleton'), attachments: JSON.parse(sql('select json_agg(s) from app_private.attachment_scan_settings s')) };
  t.after(async () => {
    if (docs.length) ok(await db.from('documents').update({ archived_at: new Date().toISOString() }).in('id', docs));
    if (employeeDocs.length) ok(await db.from('employee_documents').update({ archived_at: new Date().toISOString() }).in('id', employeeDocs));
    if (actors.length) { ok(await db.from('profiles').update({ status: 'disabled' }).in('id', actors)); ok(await db.from('employee_records').update({ is_active: false, employment_status: 'separated' }).in('auth_user_id', actors)); }
    sql(`update app_private.document_scan_settings set enabled=${original.document === 't' ? 'true' : 'false'} where singleton`);
    for (const r of original.attachments) sql(`update app_private.attachment_scan_settings set enabled=${r.enabled ? 'true' : 'false'} where bucket_id='${r.bucket_id}'`);
    if (process.env.ATTACHMENT_RESTORE_RESULTS_FILE) writeFileSync(process.env.ATTACHMENT_RESTORE_RESULTS_FILE, JSON.stringify({ marker, results }, null, 2));
  });
  async function actor(role) {
    const password = crypto.randomUUID() + crypto.randomUUID(), u = ok(await db.auth.admin.createUser({ email: marker + '-' + role + '@example.invalid', password, email_confirm: true })).user; actors.push(u.id);
    ok(await db.from('profiles').update({ status: 'active' }).eq('id', u.id));
    const employee = ok(await db.from('employee_records').insert({ auth_user_id: u.id, legal_name: marker + ' ' + role, is_active: true, employment_status: 'active' }).select('id').single());
    const r = ok(await db.from('roles').select('id').eq('name', role).single()); ok(await db.from('user_roles').insert({ user_id: u.id, role_id: r.id }));
    const client = createClient(c.API_URL, c.ANON_KEY, opts); ok(await client.auth.signInWithPassword({ email: u.email, password })); return { id: u.id, employee: employee.id, client };
  }
  const owner = await actor('owner'), other = await actor('crew');
  sql('update app_private.document_scan_settings set enabled=true where singleton'); sql('update app_private.attachment_scan_settings set enabled=true');
  const scan = bytes => scanDocumentBytes(bytes, { url: host.url, token, production: true });
  const service = load('../src/lib/security/attachment-scan-service.ts', { 'server-only': {}, 'node:crypto': crypto, './document-scan-service': { getDocumentScanClient: () => db }, './document-scanner': { scanDocumentBytes: scan } });
  const library = load('../src/lib/security/document-scan-service.ts', { 'server-only': {}, 'node:crypto': crypto, '@supabase/supabase-js': { createClient }, './document-scanner': { scanDocumentBytes: scan } });
  const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'green' } }).png().toBuffer();
  const prepared = { bytes: image, contentType: 'image/png', fileName: 'synthetic.png', size: image.length, scanStatus: 'content_validated_not_malware_scanned' };
  const customer = ok(await db.from('customers').insert({ display_name: marker }).select('id').single());
  const location = ok(await db.from('service_locations').insert({ customer_id: customer.id, label: marker, street: '123 Synthetic Lane', city: 'Fredericksburg', state: 'VA', postal_code: '22401' }).select('id').single());
  const job = ok(await db.from('jobs').insert({ customer_id: customer.id, service_location_id: location.id, assigned_crew_user_id: owner.id, assigned_crew_employee_id: owner.employee, service_type: 'tree_removal' }).select('id').single());
  const asset = ok(await db.from('equipment_assets').insert({ asset_number: marker, name: marker, category: 'other' }).select('id').single());
  const training = ok(await db.from('training_sessions').insert({ title: marker, training_type: 'other', starts_at: new Date().toISOString() }).select('id').single());
  const buckets = ['employee-files', 'employee-program-files', 'equipment-files', 'material-files', 'job-cost-receipts', 'job-photos'];
  const row = async (table, values) => ok(await db.from(table).insert(values).select('*').single());
  for (const bucket of buckets) {
    let path = bucket === 'employee-files' ? `${owner.employee}/submitted/${crypto.randomUUID()}.png` : bucket === 'employee-program-files' ? `training/${training.id}/${crypto.randomUUID()}.png` : bucket === 'equipment-files' ? `${asset.id}/documents/${crypto.randomUUID()}.png` : bucket === 'material-files' ? `${owner.id}/purchase/${crypto.randomUUID()}.png` : `${job.id}/${owner.id}/${crypto.randomUUID()}.png`;
    let metadata, table;
    if (bucket === 'job-photos') {
      const photos = load('../src/lib/storage/job-photo-upload.ts', { 'server-only': {}, 'next/cache': { revalidatePath() {} }, '@/lib/storage/job-photo-paths': load('../src/lib/storage/job-photo-paths.ts'), '@/lib/security/attachment-scan-service': service, '@/lib/security/upload-validation': { prepareSafeUpload } });
      assert.equal((await photos.uploadJobPhotoForUser({ caption: marker, category: 'before', file: new File([image], 'synthetic.png', { type: 'image/png' }), jobId: job.id, supabase: owner.client, userId: owner.id })).status, 'success');
      table = 'job_photos'; metadata = ok(await db.from(table).select('*').eq('caption', marker).single()); path = metadata.storage_path;
    } else {
      assert.equal((await service.uploadCheckedAttachment(owner.client, bucket, path, prepared, owner.id)).scanStatus, 'clean');
      if (bucket === 'employee-files') { table = 'employee_documents'; metadata = await row(table, { employee_id: owner.employee, document_type: 'credential', title: marker, storage_path: path, mime_type: 'image/png', file_size_bytes: image.length, access_classification: 'admin_only', review_status: 'approved', uploaded_by_user_id: owner.id }); employeeDocs.push(metadata.id); }
      if (bucket === 'employee-program-files') { table = 'employee_program_files'; metadata = await row(table, { training_session_id: training.id, title: marker, storage_path: path, file_kind: 'attachment', uploaded_by_user_id: owner.id }); }
      if (bucket === 'equipment-files') { table = 'equipment_documents'; metadata = await row(table, { asset_id: asset.id, title: marker, document_type: 'other', storage_path: path, uploaded_by_user_id: owner.id }); }
      if (bucket === 'material-files') { table = 'material_purchases'; metadata = await row(table, { vendor_name: marker, receipt_storage_path: path, created_by_user_id: owner.id, idempotency_key: crypto.randomUUID() }); }
      if (bucket === 'job-cost-receipts') { table = 'job_cost_entries'; metadata = await row(table, { job_id: job.id, category: 'other', description: marker, amount_cents: 1234, incurred_on: '2026-10-16', receipt_storage_path: path, submitted_by_user_id: owner.id }); }
    }
    const state = JSON.parse(sql(`select row_to_json(s) from app_private.attachment_scans s where bucket_id='${bucket}' and storage_path='${path}'`));
    const actual = Buffer.from(await ok(await db.storage.from(bucket).download(path)).arrayBuffer());
    entries.push({ bucket, path, table, metadata, state, bytes: actual.toString('base64'), sha256: crypto.createHash('sha256').update(actual).digest('hex') });
  }
  const text = Buffer.from('ATS synthetic library recovery — no customer data.'), path = `${owner.id}/${crypto.randomUUID()}.txt`;
  const doc = ok(await owner.client.from('documents').insert({ title: marker, storage_path: path, document_type: 'other', mime_type: 'text/plain', file_size_bytes: text.length, uploaded_by_user_id: owner.id, access_classification: 'employee_sensitive' }).select('*').single()); docs.push(doc.id);
  ok(await owner.client.storage.from('platform-documents').upload(path, text, { contentType: 'text/plain', upsert: false })); assert.equal(await library.checkStoredDocument(db, doc.id, owner.id), 'clean');
  entries.push({ bucket: 'platform-documents', path, table: 'documents', metadata: doc, bytes: text.toString('base64'), sha256: crypto.createHash('sha256').update(text).digest('hex') });
  const business = () => sql(`select jsonb_build_object('job',(select to_jsonb(j) from jobs j where id='${job.id}'),'costs',(select jsonb_agg(to_jsonb(x) order by id) from job_cost_entries x where job_id='${job.id}'),'purchases',(select jsonb_agg(to_jsonb(x) order by id) from material_purchases x where vendor_name='${marker}'),'photoAudit',(select jsonb_agg(to_jsonb(x) order by id) from activity_log x where idempotency_key='job-photo-uploaded/${entries.find(e => e.bucket === 'job-photos').metadata.id}'))`);
  const beforeBusiness = business(); assert.equal(JSON.parse(beforeBusiness).photoAudit.length, 1);
  const run = (name, fn) => t.test(name, async () => { await fn(); results.push({ name, pass: true }); });
  // This is a synthetic test fixture, not a production backup format or scheduled backup service.
  const dir = mkdtempSync(join(tmpdir(), 'ats-synthetic-restore-')), key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv), plaintext = Buffer.from(JSON.stringify({ marker, entries }));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]), tag = cipher.getAuthTag();
  writeFileSync(join(dir, 'synthetic-backup.enc'), Buffer.concat([iv, tag, encrypted]), { mode: 0o600 }); writeFileSync(join(dir, 'synthetic-key.private'), key, { mode: 0o600 });
  function recover(blob, secret) { const decipher = crypto.createDecipheriv('aes-256-gcm', secret, blob.subarray(0, 12)); decipher.setAuthTag(blob.subarray(12, 28)); const manifest = JSON.parse(Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()])); assert.equal(manifest.marker, marker); for (const e of manifest.entries) assert.equal(crypto.createHash('sha256').update(Buffer.from(e.bytes, 'base64')).digest('hex'), e.sha256); return manifest.entries; }
  const backup = readFileSync(join(dir, 'synthetic-backup.enc')); let recovered;
  await run('encrypted fixture requires its key and rejects tampering before touching Storage', async () => {
    assert.throws(() => recover(backup, crypto.randomBytes(32))); const corrupt = Buffer.from(backup); corrupt[corrupt.length - 1] ^= 1; assert.throws(() => recover(corrupt, key));
    recovered = recover(backup, key); assert.equal(recovered.length, 7); assert.equal(backup.includes(plaintext), false);
  });
  for (const e of recovered) await run(`${e.bucket}: missing bytes recover under fresh authorization and fresh scanning`, async () => {
    const attemptsBefore = e.bucket === 'platform-documents' ? null : Number(sql(`select count(*) from app_private.attachment_scan_attempts where bucket_id='${e.bucket}' and storage_path='${e.path}'`));
    ok(await db.storage.from(e.bucket).remove([e.path])); assert.ok((await owner.client.storage.from(e.bucket).download(e.path)).error);
    // Metadata survives a byte loss, proving a database-only backup is insufficient.
    assert.ok(ok(await db.from(e.table).select('id').eq('id', e.metadata.id).single()));
    const restoredBytes = Buffer.from(e.bytes, 'base64'); let restoredPath = e.path, restoredId = e.metadata.id;
    if (e.bucket === 'platform-documents') {
      // Library approval binds to a document ID. Never recreate an old clean ID/path.
      ok(await owner.client.from('documents').update({ archived_at: new Date().toISOString(), archived_by_user_id: owner.id }).eq('id', restoredId));
      restoredPath = `${owner.id}/${crypto.randomUUID()}.txt`;
      const fresh = ok(await owner.client.from('documents').insert({ title: e.metadata.title, storage_path: restoredPath, document_type: e.metadata.document_type, mime_type: e.metadata.mime_type, file_size_bytes: restoredBytes.length, uploaded_by_user_id: owner.id, access_classification: e.metadata.access_classification }).select('*').single()); docs.push(fresh.id); restoredId = fresh.id; assert.notEqual(restoredId, e.metadata.id); assert.equal(fresh.scan_status, 'unscanned');
    }
    ok(await owner.client.storage.from(e.bucket).upload(restoredPath, restoredBytes, { contentType: e.bucket === 'platform-documents' ? 'text/plain' : 'image/png', upsert: false, cacheControl: '0' }));
    assert.ok((await owner.client.storage.from(e.bucket).createSignedUrl(restoredPath, 60)).error);
    if (e.bucket !== 'platform-documents') {
      const fresh = JSON.parse(sql(`select row_to_json(s) from app_private.attachment_scans s where bucket_id='${e.bucket}' and storage_path='${e.path}'`)); assert.equal(fresh.status, 'unscanned'); assert.notEqual(fresh.generation, e.state.generation); assert.notEqual(fresh.object_id, e.state.object_id); assert.equal(fresh.sha256, null);
      const oldAttempt = JSON.parse(sql(`select row_to_json(a) from app_private.attachment_scan_attempts a where bucket_id='${e.bucket}' and storage_path='${e.path}' order by started_at desc limit 1`));
      assert.equal(ok(await db.rpc('finish_attachment_scan', { p_bucket: e.bucket, p_path: e.path, p_actor: owner.id, p_token: oldAttempt.token, p_verdict: 'clean', p_sha256: e.sha256 })), false);
    }
    if (e.bucket === 'job-cost-receipts') {
      try { docker('stop', '-t', '2', host.ids.engine); assert.equal(await service.checkStoredAttachment(db, e.bucket, restoredPath, owner.id), 'unavailable'); assert.ok((await owner.client.storage.from(e.bucket).download(restoredPath)).error); }
      finally { docker('start', host.ids.engine); }
      for (let i = 0; i < 40; i++) { if ((await scan(text)).status === 'clean') break; await delay(1000); }
    }
    const verdict = e.bucket === 'platform-documents' ? await library.checkStoredDocument(db, restoredId, owner.id, e.sha256) : await service.checkStoredAttachment(db, e.bucket, restoredPath, owner.id, e.sha256); assert.equal(verdict, 'clean');
    const downloaded = ok(await owner.client.storage.from(e.bucket).download(restoredPath)); assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), restoredBytes);
    assert.ok((await other.client.storage.from(e.bucket).download(restoredPath)).error);
    assert.ok((await owner.client.storage.from(e.bucket).upload(restoredPath, restoredBytes, { upsert: false })).error, 'Recovery must not overwrite an existing object.');
    if (e.bucket !== 'platform-documents') { assert.deepEqual(ok(await db.from(e.table).select('*').eq('id', e.metadata.id).single()), e.metadata); assert.ok(Number(sql(`select count(*) from app_private.attachment_scan_attempts where bucket_id='${e.bucket}' and storage_path='${e.path}'`)) > attemptsBefore); }
  });
  await run('recovered EICAR remains quarantined, and recovery preserves financial/job/photo audit records', async () => {
    const eicar = Buffer.from(['X5O!P%@AP[4\\PZX54(P^)7CC)7}', '$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('')), p = `${asset.id}/documents/${crypto.randomUUID()}.png`;
    ok(await owner.client.storage.from('equipment-files').upload(p, eicar, { contentType: 'image/png', upsert: false }));
    await row('equipment_documents', { asset_id: asset.id, title: marker + ' EICAR', document_type: 'other', storage_path: p, uploaded_by_user_id: owner.id });
    assert.equal(await service.checkStoredAttachment(db, 'equipment-files', p, owner.id), 'quarantined');
    ok(await db.storage.from('equipment-files').remove([p])); ok(await owner.client.storage.from('equipment-files').upload(p, eicar, { contentType: 'image/png', upsert: false }));
    assert.ok((await owner.client.storage.from('equipment-files').download(p)).error); assert.equal(await service.checkStoredAttachment(db, 'equipment-files', p, owner.id), 'quarantined'); assert.ok((await owner.client.storage.from('equipment-files').download(p)).error);
    assert.equal(business(), beforeBusiness); assert.equal(sql("select app_private.effective_platform_access('55b614b2-efce-4b3a-85e5-697f4fb6b81f')"), 't'); assert.equal(sql('select automated_generation_enabled from recurring_service_settings'), 'f');
  });
});
