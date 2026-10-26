import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

test('quote saves keep editing, line identities, uncertain recovery and save-and-close working', {
  skip: process.env.QUOTE_PERF_DISPOSABLE !== '1', timeout: 240000,
}, async () => {
  const c = JSON.parse(readFileSync(process.env.QUOTE_PERF_CONFIG));
  const local = c.origin === 'http://127.0.0.1:3228';
  assert.ok(local || /^https:\/\/bench-20261026-[a-f0-9]{6}--angel-tree-admin-staging\.netlify\.app$/.test(c.origin));
  assert.equal(c.supabaseUrl, local ? 'http://127.0.0.1:62321' : 'https://gbyhdsuiqeslgjdnbqng.supabase.co');
  const actor = JSON.parse(readFileSync(c.credentialsFile));
  assert.match(actor.email, /^bench_[a-f0-9]{12}-owner@example\.invalid$/);
  const status = local ? JSON.parse(readFileSync(c.statusFile)) : null;
  const keys = local ? null : JSON.parse(readFileSync(c.keysFile));
  const db = createClient(c.supabaseUrl, local ? status.SERVICE_ROLE_KEY : keys.find(key => key.name === 'service_role').api_key, { auth: { persistSession: false, autoRefreshToken: false } });
  const pw = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href);
  const browser = await pw.chromium.launch({ headless: true, executablePath: process.env.BENCH_CHROMIUM_PATH });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage();
  const errors = [], checks = [], created = [], form = page.locator('.quote-editor-form');
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  async function ready() {
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Save changes');
      return button && !button.disabled && document.querySelector('.quote-editor-form')?.getAttribute('aria-busy') === 'false';
    });
  }
  async function read() {
    const result = await db.from('quotes').select('id, customer_id, service_location_id, customer_message, edit_revision, total_cents, quote_line_items(id, name, sort_order)').eq('id', c.quoteId).single();
    if (result.error) throw Error(result.error.message);
    assert.ok(result.data.customer_message?.startsWith(c.marker));
    return result.data;
  }
  async function saved(prior) {
    await page.waitForFunction(revision => Number(document.querySelector('input[name="expected_revision"]')?.value) > revision && document.querySelector('.quote-editor-form')?.getAttribute('aria-busy') === 'false', prior);
    await ready();
  }
  try {
    await page.goto(c.origin + '/login');
    if (await page.getByLabel('Staging access code', { exact: true }).count()) {
      await page.getByLabel('Staging access code', { exact: true }).fill(actor.gatePassword);
      await page.getByRole('button', { name: 'Continue to preview', exact: true }).click();
      await page.goto(c.origin + '/login');
    }
    await page.getByLabel('Email', { exact: true }).fill(actor.email);
    await page.getByLabel('Password', { exact: true }).fill(actor.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/admin**');
    const returnTo = '/admin/quotes?q=' + c.marker;
    const editPath = '/admin/quotes/' + c.quoteId + '/edit';
    await page.goto(c.origin + editPath + '?returnTo=' + encodeURIComponent(returnTo));
    await ready();
    assert.equal(await page.locator('.data-warning').count(), 0);
    const before = await read();
    let releaseRefresh;
    const heldRefresh = new Promise(resolve => { releaseRefresh = resolve; });
    let refreshFinished;
    const finishedRefresh = new Promise(resolve => { refreshFinished = resolve; });
    const holdRefresh = async route => {
      if (route.request().method() !== 'GET' || route.request().headers().rsc !== '1') return route.continue();
      const response = await route.fetch(); await heldRefresh;
      await route.fulfill({ response }); refreshFinished();
    };
    await context.route('**' + editPath + '**', holdRefresh);
    await page.getByRole('button', { name: 'Add line item', exact: true }).click();
    const last = page.locator('.quote-line-editor').last();
    await last.locator('[name="line_item_name"]').fill('Synthetic cleanup');
    await last.locator('[name="line_item_unit_price"]').fill('25.00');
    await form.locator('[name="customer_message"]').fill(c.marker + ' browser saved');
    await page.getByRole('button', { name: 'Save changes', exact: true }).press('Enter');
    await saved(before.edit_revision);
    const after = await read();
    assert.equal(after.customer_message, c.marker + ' browser saved');
    assert.equal(after.total_cents, before.total_cents + 2500);
    assert.equal(after.quote_line_items.length, before.quote_line_items.length + 1);
    for (const line of before.quote_line_items) assert.ok(after.quote_line_items.some(saved => saved.id === line.id));
    const lineIds = await form.locator('[name="line_item_id"]').evaluateAll(inputs => inputs.map(input => input.value));
    assert.deepEqual(lineIds.sort(), after.quote_line_items.map(line => line.id).sort());
    checks.push('Keyboard save confirms the header, amount and retained/new line identities');
    await form.locator('[name="customer_message"]').fill(c.marker + ' newer unsaved work');
    releaseRefresh(); await finishedRefresh;
    await context.unroute('**' + editPath + '**', holdRefresh);
    assert.equal(await form.locator('[name="customer_message"]').inputValue(), c.marker + ' newer unsaved work');
    checks.push('The separate router refresh cannot overwrite newer unsaved typing');

    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
      await page.screenshot({ path: c.resultsPrefix + '-' + width + '.png' });
    }
    checks.push('Desktop/mobile editor layout and controls remain available without data warnings');

    let submissions = 0;
    const lostHandler = async route => {
      if (route.request().method() !== 'POST') return route.continue();
      submissions++;
      await route.fetch(); // Let the real synthetic transaction commit, then lose its acknowledgement.
      await route.abort('failed');
    };
    const receiptPath = '/api/admin/quotes/' + c.quoteId + '/edit';
    await context.route('**' + receiptPath, lostHandler);
    await form.locator('[name="customer_message"]').fill(c.marker + ' uncertain browser save');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.locator('.form-message.error').waitFor();
    await ready();
    assert.equal(submissions, 1);
    const committed = await read();
    assert.ok(committed.edit_revision > after.edit_revision);
    assert.equal(committed.customer_message, c.marker + ' uncertain browser save');
    assert.equal(Number(await form.locator('[name="expected_revision"]').inputValue()), after.edit_revision);
    assert.equal(await form.locator('[name="customer_message"]').inputValue(), committed.customer_message);
    assert.ok(await page.evaluate(id => Object.keys(localStorage).some(key => key.includes(id)), c.quoteId));
    await context.unroute('**' + receiptPath, lostHandler);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('region', { name: 'Saved quote changed' }).waitFor();
    assert.deepEqual(await read(), committed);
    checks.push('Lost acknowledgement retains the recovery copy; explicit retry conflicts without a duplicate write');

    await page.getByRole('button', { name: 'Reload saved quote', exact: true }).click();
    await ready();
    assert.equal(Number(await form.locator('[name="expected_revision"]').inputValue()), committed.edit_revision);
    await form.locator('[name="customer_message"]').fill(c.marker + ' save and close');
    await page.getByRole('button', { name: 'Save and close', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/admin/quotes/' + c.quoteId);
    assert.equal(new URL(page.url()).searchParams.get('returnTo'), returnTo);
    assert.equal((await read()).customer_message, c.marker + ' save and close');
    checks.push('Save and close navigates only after confirmation and retains return context');
    const unchanged = await read();
    const body = { quote_id: c.quoteId, contracting_party: 'customer:' + unchanged.customer_id, service_location_id: unchanged.service_location_id,
      expected_revision: String(unchanged.edit_revision), line_item_id: unchanged.quote_line_items[0].id, line_item_client_id: 'retained',
      line_item_name: 'Forbidden synthetic edit', line_item_quantity: '1', line_item_unit_price: '1.00' };
    const gateCookies = (await context.cookies()).filter(cookie => cookie.name.includes('ats-stage-access'));
    const anonymous = await browser.newContext(); await anonymous.addCookies(gateCookies);
    const unauth = await anonymous.request.post(c.origin + receiptPath, { headers: { Origin: c.origin }, multipart: body });
    assert.equal((await unauth.json()).status, 'error'); assert.match(unauth.headers()['cache-control'], /private.*no-store/);
    await anonymous.close();
    const email = 'bench_' + randomBytes(6).toString('hex') + '-crew@example.invalid', password = randomBytes(30).toString('base64url') + 'aA1!';
    const user = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (user.error) throw Error(user.error.message); created.push(user.data.user.id);
    for (const operation of [db.from('profiles').update({ status: 'active' }).eq('id', user.data.user.id),
      db.from('employee_records').insert({ auth_user_id: user.data.user.id, legal_name: 'Synthetic API crew', employment_status: 'active', is_active: true })]) {
      const result = await operation; if (result.error) throw Error(result.error.message);
    }
    const role = await db.from('roles').select('id').eq('name', 'crew').single();
    if (role.error) throw Error(role.error.message);
    const assignment = await db.from('user_roles').insert({ user_id: user.data.user.id, role_id: role.data.id });
    if (assignment.error) throw Error(assignment.error.message);
    const crew = await browser.newContext(); await crew.addCookies(gateCookies); const crewPage = await crew.newPage();
    await crewPage.goto(c.origin + '/login'); await crewPage.getByLabel('Email', { exact: true }).fill(email);
    await crewPage.getByLabel('Password', { exact: true }).fill(password); await crewPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await crewPage.waitForURL(url => /^\/(admin|crew|portal)(\/|$)/.test(url.pathname));
    const forbidden = await crew.request.post(c.origin + receiptPath, { headers: { Origin: c.origin }, multipart: body });
    assert.equal((await forbidden.json()).status, 'error');
    assert.deepEqual(await read(), unchanged); await crew.close();
    checks.push('Anonymous and active crew cookies cannot write through the new receipt endpoint');
    assert.deepEqual(errors, []);
    writeFileSync(c.resultsPrefix + '.json', JSON.stringify({ passed: true, environment: local ? 'local' : 'staging', syntheticOnly: true, checks, productionTouched: false }, null, 2), { mode: 0o600 });
  } catch (error) { writeFileSync(c.resultsPrefix + "-failure.json", JSON.stringify({ messages: await page.locator(".form-message").allTextContents(), urlPath: new URL(page.url()).pathname }, null, 2), {mode: 0o600}); throw error; } finally {
    for (const id of created) { await db.from('profiles').update({ status: 'disabled' }).eq('id', id); await db.auth.admin.updateUserById(id, { ban_duration: '876000h' }); }
    await browser.close();
  }
});
