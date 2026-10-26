import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

test('invoice save receipts preserve typing, payments, recovery, navigation and cookie authorization', {
  skip: process.env.INVOICE_PERF_DISPOSABLE !== '1', timeout: 240000,
}, async () => {
  const c = JSON.parse(readFileSync(process.env.INVOICE_PERF_CONFIG)), local = c.origin === 'http://127.0.0.1:3228';
  assert.ok(local || /^https:\/\/bench-20261026-[a-f0-9]{6}--angel-tree-admin-staging\.netlify\.app$/.test(c.origin));
  assert.equal(c.supabaseUrl, local ? 'http://127.0.0.1:62321' : 'https://gbyhdsuiqeslgjdnbqng.supabase.co');
  const actor = JSON.parse(readFileSync(c.credentialsFile)); assert.match(actor.email, /^bench_[a-f0-9]{12}-owner@example\.invalid$/);
  const status = local ? JSON.parse(readFileSync(c.statusFile)) : null, keys = local ? null : JSON.parse(readFileSync(c.keysFile));
  const db = createClient(c.supabaseUrl, local ? status.SERVICE_ROLE_KEY : keys.find(x => x.name === 'service_role').api_key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = r => { if (r.error) throw Error(r.error.message); return r.data; };
  const pw = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href), browser = await pw.chromium.launch({ headless: true, executablePath: process.env.BENCH_CHROMIUM_PATH });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await ctx.newPage(), form = page.locator('.quote-editor-form'), errors = [], created = [], checks = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  const editPath = '/admin/invoices/' + c.invoiceId + '/edit', receiptPath = '/api/admin/invoices/' + c.invoiceId + '/edit';
  async function ready() { await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save changes'); return b && !b.disabled && document.querySelector('.quote-editor-form')?.getAttribute('aria-busy') === 'false'; }); }
  async function saved(prior) { await page.waitForFunction(old => document.querySelector('[name="expected_updated_at"]')?.value !== old && document.querySelector('.quote-editor-form')?.getAttribute('aria-busy') === 'false', prior); await ready(); }
  async function read() { const row = ok(await db.from('invoices').select('*, invoice_line_items(*), payments(*), customers:customers!invoices_customer_id_fkey(display_name)').eq('id', c.invoiceId).single()); assert.ok(row.customers.display_name.startsWith(c.marker)); return row; }
  try {
    await page.goto(c.origin + '/login');
    if (await page.getByLabel('Staging access code', { exact: true }).count()) { await page.getByLabel('Staging access code', { exact: true }).fill(actor.gatePassword); await page.getByRole('button', { name: 'Continue to preview', exact: true }).click(); await page.goto(c.origin + '/login'); }
    await page.getByLabel('Email', { exact: true }).fill(actor.email); await page.getByLabel('Password', { exact: true }).fill(actor.password); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL('**/admin**');
    const returnTo = '/admin/invoices?q=' + c.marker;
    await page.goto(c.origin + editPath + '?returnTo=' + encodeURIComponent(returnTo)); await ready(); assert.equal(await page.locator('.data-warning').count(), 0);
    const before = await read(); let releaseRefresh, finishRefresh;
    const hold = new Promise(resolve => { releaseRefresh = resolve; }), finished = new Promise(resolve => { finishRefresh = resolve; });
    const refreshHandler = async route => { if (route.request().method() !== 'GET' || route.request().headers().rsc !== '1') return route.continue(); const response = await route.fetch(); await hold; await route.fulfill({ response }); finishRefresh(); };
    await ctx.route('**' + editPath + '**', refreshHandler);
    await page.getByRole('button', { name: 'Add line item', exact: true }).click();
    const last = page.locator('.quote-line-editor').last(); await last.locator('[name="invoice_line_item_name"]').fill('Synthetic cleanup'); await last.locator('[name="invoice_line_item_unit_price"]').fill('25.00');
    await form.locator('[name="due_date"]').fill('2026-11-18'); await page.getByRole('button', { name: 'Save changes', exact: true }).press('Enter'); await saved(before.updated_at);
    const after = await read(); assert.equal(after.total_cents, before.total_cents + 2500); assert.equal(after.balance_due_cents, before.balance_due_cents + 2500); assert.deepEqual(after.payments, before.payments);
    for (const key of ['customer_id', 'organization_id', 'job_id', 'quote_id', 'status', 'document_terms_version']) assert.deepEqual(after[key], before[key]);
    for (const line of before.invoice_line_items) assert.ok(after.invoice_line_items.some(x => x.id === line.id));
    assert.deepEqual((await form.locator('[name="invoice_line_item_id"]').evaluateAll(nodes => nodes.map(x => x.value))).sort(), after.invoice_line_items.map(x => x.id).sort());
    await form.locator('[name="due_date"]').fill('2026-11-19'); releaseRefresh(); await finished; await ctx.unroute('**' + editPath + '**', refreshHandler);
    assert.equal(await form.locator('[name="due_date"]').inputValue(), '2026-11-19'); checks.push('Keyboard save confirms totals, balances and line identities; the separate refresh preserves newer unsaved typing');
    for (const width of [1280, 390]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)); await page.screenshot({ path: c.resultsPrefix + '-' + width + '.png' }); }
    let submissions = 0; const lose = async route => { submissions++; await route.fetch(); await route.abort('failed'); };
    await ctx.route('**' + receiptPath, lose); await form.locator('[name="due_date"]').fill('2026-11-21'); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await page.locator('.form-message.error').waitFor(); await ready(); assert.equal(submissions, 1);
    const committed = await read(); assert.notEqual(committed.updated_at, after.updated_at); assert.equal(await form.locator('[name="expected_updated_at"]').inputValue(), after.updated_at);
    assert.ok(await page.evaluate(id => Object.keys(localStorage).some(k => k.includes(id)), c.invoiceId));
    await ctx.unroute('**' + receiptPath, lose); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await page.getByText('This invoice changed since you opened it. Reload before saving.', { exact: true }).waitFor(); assert.deepEqual(await read(), committed);
    checks.push('Lost receipt retains recovery and the old revision; explicit retry conflicts without duplicating a write');
    await page.reload(); await page.getByRole('button', { name: 'Discard recovery copy', exact: true }).click(); await ready(); assert.equal(await form.locator('[name="expected_updated_at"]').inputValue(), committed.updated_at);
    await form.locator('[name="due_date"]').fill('2026-11-22'); await page.getByRole('button', { name: 'Save and close', exact: true }).click(); await page.waitForURL(url => url.pathname === '/admin/invoices/' + c.invoiceId); assert.equal(new URL(page.url()).searchParams.get('returnTo'), returnTo);
    checks.push('Save and close retains the original Server Action and return context');
    const unchanged = await read(), body = { invoice_id: c.invoiceId, expected_updated_at: unchanged.updated_at, due_date: '2026-11-30', invoice_line_item_id: unchanged.invoice_line_items[0].id, invoice_line_item_client_id: 'retained', invoice_line_item_name: 'Forbidden synthetic edit', invoice_line_item_quantity: '1', invoice_line_item_unit_price: '1.00' };
    const gate = (await ctx.cookies()).filter(x => x.name.includes('ats-stage-access')), anonymous = await browser.newContext(); await anonymous.addCookies(gate);
    const unauth = await anonymous.request.post(c.origin + receiptPath, { headers: { Origin: c.origin }, multipart: body }); assert.equal((await unauth.json()).status, 'error'); assert.match(unauth.headers()['cache-control'], /private.*no-store/); await anonymous.close();
    const email = 'bench_' + randomBytes(6).toString('hex') + '-crew@example.invalid', password = randomBytes(30).toString('base64url') + 'aA1!', user = ok(await db.auth.admin.createUser({ email, password, email_confirm: true })).user; created.push(user.id);
    ok(await db.from('profiles').update({ status: 'active' }).eq('id', user.id)); ok(await db.from('employee_records').insert({ auth_user_id: user.id, legal_name: 'Synthetic invoice crew', employment_status: 'active', is_active: true }));
    const role = ok(await db.from('roles').select('id').eq('name', 'crew').single()); ok(await db.from('user_roles').insert({ user_id: user.id, role_id: role.id }));
    const crew = await browser.newContext(); await crew.addCookies(gate); const p = await crew.newPage(); await p.goto(c.origin + '/login'); await p.getByLabel('Email', { exact: true }).fill(email); await p.getByLabel('Password', { exact: true }).fill(password); await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForURL(url => /^\/(admin|crew|portal)(\/|$)/.test(url.pathname));
    const forbidden = await crew.request.post(c.origin + receiptPath, { headers: { Origin: c.origin }, multipart: body }); assert.equal((await forbidden.json()).status, 'error'); assert.deepEqual(await read(), unchanged); await crew.close();
    checks.push('Signed-out and active crew cookies cannot write through the receipt endpoint'); assert.deepEqual(errors, []);
    writeFileSync(c.resultsPrefix + '.json', JSON.stringify({ passed: true, environment: local ? 'local' : 'staging', syntheticOnly: true, checks, productionTouched: false }, null, 2), { mode: 0o600 });
  } catch (error) { writeFileSync(c.resultsPrefix + '-failure.json', JSON.stringify({ messages: await page.locator('.form-message').allTextContents(), path: new URL(page.url()).pathname }), { mode: 0o600 }); throw error; }
  finally { for (const id of created) { await db.from('profiles').update({ status: 'disabled' }).eq('id', id); await db.auth.admin.updateUserById(id, { ban_duration: '876000h' }); } await browser.close(); }
});
