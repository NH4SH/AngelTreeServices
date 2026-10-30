import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const script = await readFile(new URL('./browser.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const unpaid = () => ({ connectionVersion: 'firewood-office-live-v2', csrf: 'csrf', status: 'saved', termsHash: 'terms', paymentPolicyHash: 'policy', paused: false,
  order: { reference: 'FW-TEST', quote: { label: 'Full cord', stacking: true, totalCents: 57000 },
    contact: { address: '123 Synthetic Lane', city: 'Fredericksburg', state: 'VA', postal: '22407', email: 'customer@checkout.invalid', notes: 'Line one\nLine two' } },
  preparation: 'prepared', verificationPending: false, canCheckPayment: true, paymentExecutionReady: false,
  payment: { state: 'unpaid', orderState: 'active', pending: false, review: false,
    accounting: { creditCents: 0, balanceDueCents: 57000, creditRecorded: false },
    totals: { invoice_principal_cents: 57000, surcharge_collected_cents: 0, gross_collected_cents: 0, gross_refunded_cents: 0, balance_due_cents: 57000 } } });
const paid = () => { const v = unpaid(); v.canCheckPayment = false; v.payment.state = 'paid'; v.payment.totals.balance_due_cents = 0; v.payment.accounting.balanceDueCents = 0; return v; };
function browser(fetch, { draft = false } = {}) {
  const nodes = new Map();
  class Element {
    constructor(id) { this.id = id; this.hidden = false; this.disabled = false; this.textContent = ''; this.dataset = {}; this.listeners = {}; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    focus() {} setAttribute() {} removeAttribute() {} scrollIntoView() {}
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, new Element(id)); return nodes.get(id); };
  const fields = [];
  if (draft) for (const name of ['quantity', 'stacking', 'name', 'email', 'phone', 'address', 'address2', 'city', 'state', 'postal', 'notes', 'termsAccepted']) {
    const field = new Element(name); field.name = name; field.value = name === 'quantity' ? 'half' : ''; field.checked = false; field.required = true;
    fields.push(field); fields[name] = field;
  }
  fields.namedItem = name => fields.find(field => field.name === name) ?? null;
  get('order-form').elements = fields; get('order-form').reportValidity = () => true;
  if (draft) get('quantity-options').children = ['half', 'full', 'two'].map(value => {
    const detail = new Element('detail'), saving = new Element('saving');
    return { querySelector(selector) { if (selector === 'input') return { value, get checked() { return fields.quantity.value === value; } };
      return selector === '.detail' ? detail : saving; } };
  });
  get('order-terms').dataset = { termsHash: 'terms', paymentPolicyHash: 'policy' };
  get('saved-error').hidden = true; get('form-error').hidden = true;
  vm.runInNewContext(script, { document: { getElementById: get }, HTMLElement: Element,
    window: { addEventListener() {} }, location: { reload() {}, assign() { assert.fail('No payment navigation expected'); } },
    fetch, setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; }, clearTimeout, AbortController, URL, Intl, console });
  return { get, click: id => get(id).listeners.click() };
}
test('successful saved-order refresh clears a prior payment-options error without resetting order details', async () => {
  let current = unpaid();
  const b = browser(async (url, options) => Response.json(options.method === 'POST' ? { held: true, next: null } : current));
  await flush(); await b.click('resume-payment'); await flush();
  assert.equal(b.get('saved-error').hidden, false); assert.match(b.get('saved-error').textContent, /not available yet/);
  current = paid(); b.click('refresh-order'); await flush();
  assert.equal(b.get('saved-error').hidden, true); assert.equal(b.get('resume-payment').hidden, true);
  assert.match(b.get('result-detail').textContent, /Payment is recorded/); assert.match(b.get('saved-instructions').textContent, /Line one\nLine two/);
});
const officeDraftState = () => ({ connectionVersion: 'firewood-office-live-v2', csrf: 'csrf', status: 'draft', order: null, termsHash: 'terms', paymentPolicyHash: 'policy', paused: false,
  catalog: { quantities: [{ id: 'half', label: 'Half cord', cents: 30000 }, { id: 'full', label: 'Full cord', cents: 45000 },
    { id: 'two', label: 'Two cords', cents: 84000 }], stackingCents: 15000, stackingAccess: 'Wheelbarrow access.' },
  officeDraft: { reference: 'FW-OLD', status: 'approved', prices: { wood_cents: 42750, stacking_cents: 14250, principal_cents: 57000 },
    quoteReviewHash: 'approved-old', expiresAt: new Date(Date.now() + 3600000).toISOString(),
    draft: { quantity: 'full', stacking: true, contact: { name: 'Review Customer', email: 'review@checkout.invalid', phone: '2025550194',
      address: '123 Original Lane', address2: '', city: 'Fredericksburg', state: 'VA', postal: '22407', notes: 'Original instructions' } } } });
for (const kind of ['validation failure with old saved request', 'interrupted reply with a newly saved request']) {
  test('edited details survive office resend ' + kind + ' without reusing an old approval', async () => {
    let current = officeDraftState(), posts = [];
    const b = browser(async (url, options) => {
      if (options.method === 'POST') {
        const input = JSON.parse(options.body); posts.push({ url, input });
        if (kind.startsWith('interrupted')) {
          current = structuredClone(current); current.officeDraft = { ...current.officeDraft, status: 'pending', prices: null, quoteReviewHash: null, expiresAt: null,
            draft: { quantity: input.quantity, stacking: input.stacking, contact: { ...current.officeDraft.draft.contact,
              address: input.address.trim(), phone: '2025550194', notes: input.notes.trim() } } };
          throw Error('Reply interrupted after saving');
        }
        return Response.json({ error: 'Please check your phone number.', field: 'phone' }, { status: 400 });
      }
      return Response.json(current);
    }, { draft: true });
    await flush(); b.click('edit-office');
    const fields = b.get('order-form').elements;
    fields.address.value = '456 Edited Lane'; fields.phone.value = kind.startsWith('validation') ? 'bad phone' : '(202) 555-0194';
    fields.notes.value = '  New instructions\nKeep these details  ';
    b.click('request-office'); await flush();
    assert.equal(fields.address.value, '456 Edited Lane'); assert.equal(fields.notes.value, '  New instructions\nKeep these details  ');
    assert.equal(fields.phone.value, kind.startsWith('validation') ? 'bad phone' : '(202) 555-0194');
    assert.equal(fields.address.disabled, false); assert.equal(b.get('continue').disabled, true);
    assert.equal(b.get('request-office').disabled, false); assert.equal(b.get('form-error').hidden, false);
    assert.equal(posts.length, 1); assert.match(posts[0].url, /office-request$/); assert.equal(posts[0].input.address, '456 Edited Lane');
  });
}
test('a late old status response cannot replace a newer cancellation hold or restore a payment button', async () => {
  let calls = 0, first, second;
  const b = browser(async () => { if (++calls === 1) return Response.json(unpaid());
    return new Promise(resolve => { if (calls === 2) first = resolve; else second = resolve; }); });
  await flush(); b.click('refresh-order'); b.click('refresh-order'); await flush();
  const held = paid(); held.payment.orderState = 'cancellation_requested';
  second(Response.json(held)); await flush(); first(Response.json(unpaid())); await flush();
  assert.equal(b.get('resume-payment').hidden, true); assert.match(b.get('result-detail').textContent, /Cancellation has been requested/);
});
test('an interrupted request gives recovery instructions rather than a technical abort message', async () => {
  const b = browser(async (url, options) => {
    if (options.method === 'POST') { const error = Error('signal is aborted without reason'); error.name = 'AbortError'; throw error; }
    return Response.json(unpaid());
  });
  await flush(); await b.click('resume-payment'); await flush();
  assert.equal(b.get('saved-error').hidden, false);
  assert.match(b.get('saved-error').textContent, /connection was interrupted.*Keep this page open.*check the order/i);
  assert.doesNotMatch(b.get('saved-error').textContent, /signal|abort/i);
  assert.match(b.get('saved-instructions').textContent, /Line one\nLine two/);
});
test('cancellation credit closes debt separately from the actual refund without showing paid or enabling repayment', async () => {
  const current = paid(); current.payment.state = 'refunded'; current.payment.orderState = 'cancelled';
  current.payment.totals = { invoice_principal_cents: 57000, surcharge_collected_cents: 1710,
    gross_collected_cents: 58710, gross_refunded_cents: 58710, balance_due_cents: 57000 };
  current.payment.accounting = { creditCents: 57000, balanceDueCents: 0, creditRecorded: true };
  const b = browser(async () => Response.json(current)); await flush();
  assert.equal(b.get('resume-payment').hidden, true); assert.equal(b.get('cancellation-credit-row').hidden, false);
  assert.equal(b.get('credit-note').hidden, false); assert.equal(b.get('paid-balance-row').hidden, false);
  assert.equal(b.get('cancellation-credit').textContent, '$570.00'); assert.equal(b.get('paid-balance').textContent, '$0.00');
  assert.equal(b.get('paid-refund').textContent, '$587.10'); assert.equal(b.get('paid-gross').textContent, '$587.10');
  assert.match(b.get('result-detail').textContent, /cancelled.*cancellation credit.*Refunds are shown separately/);
  assert.doesNotMatch(b.get('result-detail').textContent, /Payment is recorded|delivery date/);
});
test('a missing accounting result hides money and payment controls until a fresh confirmed response', async () => {
  const current = unpaid(); delete current.payment.accounting;
  const b = browser(async () => Response.json(current)); await flush();
  assert.equal(b.get('resume-payment').hidden, true); assert.equal(b.get('paid-breakdown').hidden, true);
  assert.match(b.get('result-detail').textContent, /could not be confirmed/);
});
test('old or unversioned customer responses cannot silently fall back to the previous connection', async () => {
  const current = unpaid(); delete current.connectionVersion;
  const b = browser(async () => Response.json(current)); await flush();
  assert.equal(b.get('order-view').hidden, true); assert.equal(b.get('result-view').hidden, true);
  assert.equal(b.get('retry-load').hidden, false); assert.match(b.get('loading').textContent, /Reload this page/);
});
