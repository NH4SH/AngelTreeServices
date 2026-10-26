import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

test('change-order save receipts preserve typing, replay recovery, navigation and cookie authorization', {
  skip: process.env.CO_PERF_DISPOSABLE !== '1', timeout: 300000,
}, async () => {
  const c = JSON.parse(readFileSync(process.env.CO_PERF_CONFIG)), local = c.origin === 'http://127.0.0.1:3228';
  assert.ok(local || /^https:\/\/bench-20261026-[a-f0-9]{6}--angel-tree-admin-staging\.netlify\.app$/.test(c.origin));
  assert.equal(c.supabaseUrl, local ? 'http://127.0.0.1:62321' : 'https://gbyhdsuiqeslgjdnbqng.supabase.co');
  const actor = JSON.parse(readFileSync(c.credentialsFile)); assert.ok(actor.email.startsWith(c.marker.toLowerCase()) && actor.email.endsWith('@example.invalid'));
  const s = local ? JSON.parse(readFileSync(c.statusFile)) : null, keys = local ? null : JSON.parse(readFileSync(c.keysFile));
  const db = createClient(c.supabaseUrl, local ? s.SERVICE_ROLE_KEY : keys.find(x => x.name === 'service_role').api_key, { auth: { persistSession: false, autoRefreshToken: false } }), ok = r => { if (r.error) throw Error(r.error.message); return r.data; };
  const pw = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href), browser = await pw.chromium.launch({ headless: true, executablePath: process.env.BENCH_CHROMIUM_PATH });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage(), form = page.locator('.change-order-editor'), errors = [], created = [], checks = [], blocked = [];
  await ctx.route('**/*', route => [c.origin, c.supabaseUrl].includes(new URL(route.request().url()).origin) ? route.continue() : (blocked.push(new URL(route.request().url()).pathname), route.abort()));
  page.on('pageerror', e => errors.push(e.message));
  const editPath = '/admin/change-orders/' + c.changeOrderId + '/edit', receiptPath = '/api/admin/change-orders/' + c.changeOrderId + '/edit';
  async function ready() { await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save changes'); return b && !b.disabled && document.querySelector('.change-order-editor')?.getAttribute('aria-busy') === 'false'; }); }
  const read = async () => { const row = ok(await db.from('change_orders').select('*, change_order_line_items(*)').eq('id', c.changeOrderId).single()); assert.ok(row.title.startsWith(c.marker)); return row; };
  const audit = async () => ok(await db.from('activity_log').select('id').eq('subject_type', 'change_order').eq('subject_id', c.changeOrderId).eq('event_type', 'change_order_edited').order('id'));
  try {
    await page.goto(c.origin + '/login');
    if (await page.getByLabel('Staging access code', { exact: true }).count()) { await page.getByLabel('Staging access code', { exact: true }).fill(actor.gatePassword); await page.getByRole('button', { name: 'Continue to preview', exact: true }).click(); await page.goto(c.origin + '/login'); }
    await page.getByLabel('Email', { exact: true }).fill(actor.email); await page.getByLabel('Password', { exact: true }).fill(actor.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL('**/admin**');
    await page.goto(c.origin + editPath); await page.waitForLoadState('networkidle'); await ready(); assert.equal(await page.locator('.data-warning').count(), 0);
    const before = await read(), jobBefore = ok(await db.from('jobs').select('*').eq('id', before.job_id).single());
    const token = ok(await db.from('change_order_portal_tokens').insert({ change_order_id: before.id, customer_id: before.customer_id, token_hash: randomBytes(32).toString('hex'), expires_at: new Date(Date.now() + 86400000).toISOString() }).select('*').single());
    let releaseRefresh, finishRefresh; const hold = new Promise(resolve => { releaseRefresh = resolve; }), finished = new Promise(resolve => { finishRefresh = resolve; });
    const refreshHandler = async route => { if (route.request().method() !== 'GET' || route.request().headers().rsc !== '1') return route.continue(); const response = await route.fetch(); await hold; await route.fulfill({ response }); finishRefresh(); };
    await ctx.route('**' + editPath + '**', refreshHandler);
    await page.getByRole('button', { name: 'Add line item', exact: true }).click(); const last = page.locator('.change-order-line').last(); await last.locator('[name="line_title"]').fill('Synthetic added cleanup'); await last.locator('[name="line_rate"]').fill('25.00');
    await form.locator('[name="reason"]').fill('Synthetic first receipt'); const reply = page.waitForResponse(r => new URL(r.url()).pathname === receiptPath && r.request().method() === 'POST'); await page.getByRole('button', { name: 'Save changes', exact: true }).press('Enter'); const saved = await (await reply).json(); assert.equal(saved.status, 'success'); await ready();
    const after = await read(); assert.equal(after.total_cents, before.total_cents + 2500); assert.equal(saved.savedRevision, after.edit_revision); assert.equal(after.change_order_line_items.length, before.change_order_line_items.length + 1);
    for (const key of ['customer_id', 'organization_id', 'job_id', 'source_quote_id', 'invoice_id', 'status', 'original_approved_amount_cents']) assert.deepEqual(after[key], before[key]);
    assert.deepEqual(ok(await db.from('jobs').select('*').eq('id', before.job_id).single()), jobBefore); assert.deepEqual(ok(await db.from('change_order_portal_tokens').select('*').eq('id', token.id).single()), token);
    assert.deepEqual((await form.locator('[name="line_id"]').evaluateAll(nodes => nodes.map(x => x.value))).sort(), after.change_order_line_items.map(x => x.id).sort());
    for (const line of before.change_order_line_items) assert.ok(after.change_order_line_items.some(x => x.id === line.id));
    await form.locator('[name="reason"]').fill('Synthetic newer unsaved typing'); releaseRefresh(); await finished; await ctx.unroute('**' + editPath + '**', refreshHandler); assert.equal(await form.locator('[name="reason"]').inputValue(), 'Synthetic newer unsaved typing');
    checks.push('Keyboard save confirms totals and exact line IDs; separate refresh preserves newer typing, parent job and active link');
    for (const width of [1280, 390]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: c.resultsPrefix + '-' + width + '.png' }); }
    let submissions = 0, lostRequest; const lose = async route => { submissions++; lostRequest = route.request().postData(); await route.fetch(); await route.abort('failed'); };
    const audits = (await audit()).length; await ctx.route('**' + receiptPath, lose); await form.locator('[name="reason"]').fill('Synthetic lost acknowledgement'); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await form.locator('[role="alert"]').waitFor(); await ready(); assert.equal(submissions, 1);
    const committed = await read(); assert.ok(committed.edit_revision > after.edit_revision); assert.equal((await audit()).length, audits + 1);
    const attemptKey = 'change-order-draft:edit:' + c.changeOrderId, attempt = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), attemptKey); assert.ok(attempt.requestId); assert.equal(attempt.revision, after.edit_revision); assert.ok(lostRequest.includes(attempt.requestId));
    await form.locator('[name="reason"]').fill('Changed during uncertainty'); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await page.getByText('An earlier save is still unconfirmed. Retry the same entries or review the current record before starting another save.', { exact: true }).waitFor(); assert.equal(submissions, 1); assert.deepEqual(await read(), committed);
    await ctx.unroute('**' + receiptPath, lose); await page.reload(); await page.waitForLoadState('networkidle'); await ready();
    const replayReply = page.waitForResponse(r => new URL(r.url()).pathname === receiptPath && r.request().method() === 'POST'); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); const replay = await (await replayReply).json(); assert.equal(replay.status, 'success'); assert.equal(replay.reviewRequired, true); assert.equal(replay.savedRevision, committed.edit_revision);
    await page.getByText('Your earlier save is confirmed. Review the current record before editing again.', { exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Save changes', exact: true }).isDisabled(), true); assert.deepEqual(await read(), committed); assert.equal((await audit()).length, audits + 1); assert.equal(await page.evaluate(key => sessionStorage.getItem(key), attemptKey), null);
    checks.push('Lost receipt retains opaque request/revision across reload; changed payload is blocked and explicit replay adds no duplicate write or audit');
    await page.reload(); await page.waitForLoadState('networkidle'); await ready(); await form.locator('[name="reason"]').fill('Synthetic save and close'); await page.getByRole('button', { name: 'Save and close', exact: true }).click(); await page.waitForURL(url => url.pathname === '/admin/change-orders/' + c.changeOrderId); assert.equal(new URL(page.url()).searchParams.get('updated'), '1'); checks.push('Save and close retains its original Server Action and detail navigation');
    const unchanged = await read(), body = { change_order_id: c.changeOrderId, request_id: randomUUID(), expected_revision: String(unchanged.edit_revision), title: c.marker + ' Forbidden edit', line_id: unchanged.change_order_line_items[0].id, line_title: 'Forbidden synthetic scope', line_quantity: '1', line_rate: '1.00', tax: '0', fees: '0' };
    const gate = (await ctx.cookies()).filter(x => x.name.includes('ats-stage-access')), anonymous = await browser.newContext(); await anonymous.addCookies(gate); const unauth = await anonymous.request.post(c.origin + receiptPath, { headers: { Origin: c.origin }, multipart: body }); assert.equal((await unauth.json()).status, 'error'); assert.match(unauth.headers()['cache-control'], /private.*no-store/); await anonymous.close();
    const email = 'bench_' + randomBytes(6).toString('hex') + '-crew@example.invalid', password = randomBytes(30).toString('base64url') + 'aA1!', user = ok(await db.auth.admin.createUser({ email, password, email_confirm: true })).user; created.push(user.id);
    ok(await db.from('profiles').update({ status: 'active' }).eq('id', user.id)); ok(await db.from('employee_records').insert({ auth_user_id: user.id, legal_name: 'Synthetic change-order crew', employment_status: 'active', is_active: true })); const role = ok(await db.from('roles').select('id').eq('name', 'crew').single()); ok(await db.from('user_roles').insert({ user_id: user.id, role_id: role.id }));
    const crew = await browser.newContext(); await crew.addCookies(gate); const p = await crew.newPage(); await p.goto(c.origin + '/login'); await p.getByLabel('Email', { exact: true }).fill(email); await p.getByLabel('Password', { exact: true }).fill(password); await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForURL(url => /^\/(admin|crew|portal)(\/|$)/.test(url.pathname)); const forbidden = await crew.request.post(c.origin + receiptPath, { headers: { Origin: c.origin }, multipart: body }); assert.equal((await forbidden.json()).status, 'error'); assert.deepEqual(await read(), unchanged); await crew.close();
    checks.push('Signed-out and active crew cookies cannot edit through the endpoint'); assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    writeFileSync(c.resultsPrefix + '.json', JSON.stringify({ passed: true, environment: local ? 'local' : 'staging', syntheticOnly: true, checks, productionTouched: false }, null, 2), { mode: 0o600 });
  } catch (error) { writeFileSync(c.resultsPrefix + '-failure.private.json', JSON.stringify({ error: String(error), messages: await page.locator('.form-message').allTextContents(), path: new URL(page.url()).pathname }), { mode: 0o600 }); throw error; }
  finally { for (const id of created) { ok(await db.from('profiles').update({ status: 'disabled' }).eq('id', id)); ok(await db.auth.admin.updateUserById(id, { ban_duration: '876000h' })); } await browser.close(); }
});
