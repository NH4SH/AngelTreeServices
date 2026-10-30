import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { officeWorkspace, officePriceReview, officeAcceptedOrder } from './fixtures/firewood-office-ui-fixture.mjs';
const require = createRequire(import.meta.url), jsx = require('react/jsx-runtime'), ts = require('typescript');
function load(file, dependencies) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => { assert.ok(name in dependencies, `Unexpected import ${name}`); return dependencies[name]; }, module, module.exports);
  return module.exports;
}

function harness({ actionState, pending = false, submitAction } = {}) {
  const actions = [], changes = [], refreshes = [];
  const hooks = {
    useState: initial => [initial, value => changes.push(value)],
    useRef: initial => ({ current: initial }), useEffect() {},
  };
  const { FirewoodOfficeWorkspace } = load('../src/components/firewood-office-workspace.tsx', {
    react: hooks, 'react/jsx-runtime': jsx, 'next/link': { __esModule: true, default: ({ children, ...props }) => jsx.jsx('a', { ...props, children }) },
    'next/navigation': { useRouter: () => ({ refresh: () => refreshes.push(true) }) },
    '@/hooks/use-reliable-action-state': { useReliableActionState: (callback, initial) => { actions.push(callback); return [actionState ?? initial, callback, pending]; } },
    './firewood-office-workspace.css': {},
  });
  function expand(node) {
    if (Array.isArray(node)) return node.flatMap(expand);
    if (!node || typeof node !== 'object' || !('props' in node)) return node;
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  }
  const render = model => expand(FirewoodOfficeWorkspace({ model, submitAction }));
  return { render, actions, changes, refreshes };
}
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  return node && typeof node === 'object' && node.props ? [node, ...elements(node.props.children)] : [];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(' ');
  return node && typeof node === 'object' && node.props ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
const names = tree => elements(tree).filter(x => x.type === 'input' || x.type === 'textarea' || x.type === 'select').map(x => x.props.name);
const buttons = tree => elements(tree).filter(x => x.type === 'button');
const action = async () => ({ status: 'success', message: 'Saved locally.' });

test('inactive and failed reads expose no operational form or fictional customer', () => {
  const h = harness({ submitAction: action });
  for (const status of ['unavailable', 'error']) {
    const tree = h.render({ status, message: 'Website office tools are not activated. Existing invoices remain available.' });
    assert.match(text(tree), /Website orders/); assert.match(text(tree), /not activated/);
    assert.equal(elements(tree).some(x => x.type === 'form'), false);
    assert.doesNotMatch(text(tree), /Synthetic Firewood Customer|Approve price|Confirm cancellation/);
  }
});

test('price review shows accepted customer context and catalog totals without posting a raw order', () => {
  const h = harness({ submitAction: action }), tree = h.render(officeWorkspace());
  assert.match(text(tree), /Synthetic Firewood Customer/); assert.match(text(tree), /Full cord with stacking/);
  assert.match(text(tree), /\$600\.00/); assert.match(text(tree), /once per delivery/);
  assert.deepEqual(names(tree).filter(x => ['order', 'payload', 'contact', 'account_id', 'source_id', 'paid', 'send_email'].includes(x)), []);
  assert.ok(names(tree).includes('draft_hash')); assert.ok(names(tree).includes('expected_revision'));
  for (const input of elements(tree).filter(x => ['wood_price', 'stacking_price'].includes(x.props.name))) assert.equal(input.props.inputMode, 'decimal');
  assert.ok(elements(tree).find(x => x.props.name === 'reason').props.required);
  assert.ok(elements(tree).find(x => x.props.name === 'office_price_confirmed').props.required);
});

test('veterans helper applies exactly five percent to wood and stacking before fees, never compounds', () => {
  const h = harness({ submitAction: action }), tree = h.render(officeWorkspace());
  const veterans = buttons(tree).find(x => text(x).includes('Apply 5%'));
  assert.equal(veterans.props.type, 'button'); veterans.props.onClick(); veterans.props.onClick();
  assert.deepEqual(h.changes, ['427.50', '142.50', '427.50', '142.50']);
  assert.match(text(tree), /Confirm eligibility/); assert.match(text(tree), /Only one discount/);
  assert.equal(names(tree).some(name => /stripe|payment_method|surcharge|card_number/.test(name ?? '')), false);
});

test('invalid price blocks submission while keeping currency inputs recoverable', () => {
  const h = harness({ submitAction: action }), row = officePriceReview(); row.woodCents = 0;
  const tree = h.render(officeWorkspace(row));
  assert.ok(buttons(tree).find(x => text(x) === 'Approve price').props.disabled);
  assert.equal(elements(tree).find(x => x.type === 'fieldset').props.disabled, false);
  assert.match(text(tree), /valid prices/);
});

test('non-admin or missing runtime action cannot submit an otherwise visible price review', async () => {
  let called = false; const h = harness({ submitAction: async () => { called = true; return action(); } });
  const tree = h.render({ ...officeWorkspace(), canManage: false });
  assert.ok(elements(tree).filter(x => x.type === 'fieldset').every(x => x.props.disabled));
  const result = await h.actions[0]({ status: 'idle', message: '' }, new FormData());
  assert.equal(result.status, 'error'); assert.equal(called, false);
  const missing = harness().render(officeWorkspace());
  assert.ok(buttons(missing).find(x => text(x) === 'Approve price').props.disabled);
});

test('available approval can only be revoked with a reason; accepted or expired approval is not silently reissued', () => {
  for (const status of ['available', 'accepted', 'expired', 'revoked']) {
    const row = officePriceReview(); row.approval = { id: 'approval-ui-1', status, woodCents: 42750, stackingCents: 14250, expiresLabel: 'Expires Oct 30 at 2 PM Eastern' };
    const tree = harness({ submitAction: action }).render(officeWorkspace(row));
    assert.match(text(tree), /\$570\.00/); assert.equal(buttons(tree).some(x => text(x) === 'Approve price'), false);
    assert.equal(buttons(tree).some(x => text(x) === 'Revoke approval'), status === 'available');
  }
});

test('expired or revoked price never substitutes catalog totals for unavailable approval history', () => {
  const row = officePriceReview(); row.approval = { id: 'approval-ui-1', status: 'expired', woodCents: null, stackingCents: null, expiresLabel: 'Expired Oct 30 at 2 PM Eastern' };
  const tree = harness({ submitAction: action }).render(officeWorkspace(row));
  assert.match(text(tree), /Previous approved amount is not shown/);
  assert.doesNotMatch(text(tree), /\$600\.00 total|\$0\.00 total/);
  assert.equal(buttons(tree).some(x => text(x) === 'Approve price'), false);
});

test('unknown financial reads show uncertainty rather than false zero balances', () => {
  const row = officeAcceptedOrder(); row.moneyConfirmed = false; row.paymentLabel = 'Payment needs review'; row.paymentWarnings = ['A bank payment is still processing.'];
  const tree = harness({ submitAction: action }).render(officeWorkspace(row));
  assert.ok((text(tree).match(/Not confirmed/g) ?? []).length >= 4); assert.match(text(tree), /bank payment is still processing/);
  assert.match(text(tree), /\$600\.00/);
  assert.equal(buttons(tree).some(x => /refund|charge|send|void/i.test(text(x))), false);
});

test('requesting cancellation requires an explicit hold and never supplies a cancellation timestamp', () => {
  const tree = harness({ submitAction: action }).render(officeWorkspace(officeAcceptedOrder()));
  const select = elements(tree).find(x => x.type === 'select');
  assert.equal(select.props.name, 'cancellation_reason'); assert.ok(select.props.required);
  assert.deepEqual(elements(select).filter(x => x.type === 'option' && x.props.value).map(x => x.props.value), ['customer_request', 'angel_cancelled', 'cannot_fulfill', 'declined_angel_reschedule']);
  assert.ok(elements(tree).find(x => x.props.name === 'confirm_hold').props.required);
  assert.ok(names(tree).includes('ledger_hash')); assert.equal(names(tree).includes('cancelled_at'), false);
  assert.match(text(tree), /Pending payments remain under review/);
  assert.match(text(tree), /Nothing is refunded automatically/);
});

test('held cancellation cannot be confirmed around open checkout, pending money or incomplete review', () => {
  const row = officeAcceptedOrder(); row.cancellation = { status: 'requested', revision: 3, reasonLabel: 'Customer requested cancellation', policyLabel: 'Full refund before scheduling',
    refundLabel: 'Refund needs office review', refundDueCents: 61800, blockers: ['An existing checkout may still collect payment. Review it before confirming.'], canConfirm: false };
  const tree = harness({ submitAction: action }).render(officeWorkspace(row));
  assert.ok(buttons(tree).find(x => text(x) === 'Confirm cancellation').props.disabled);
  assert.equal(buttons(tree).some(x => text(x) === 'Request cancellation'), false);
  assert.match(text(tree), /may still collect payment/); assert.match(text(tree), /no money is moved here/);
  assert.ok(elements(tree).find(x => x.props.name === 'confirm_cancellation').props.required);
  assert.ok(names(tree).includes('expected_cancellation_revision'));
});

test('confirmed cancellation retains payment and office history without new collection, refund or scheduling controls', () => {
  const row = officeAcceptedOrder(); row.cancellation = { status: 'confirmed', revision: 4, reasonLabel: 'Angel cannot fulfill', refundLabel: 'Refund requires office action', refundDueCents: 61800, blockers: [], canConfirm: false };
  const tree = harness({ submitAction: action }).render(officeWorkspace(row));
  assert.match(text(tree), /Order cancelled/); assert.match(text(tree), /Office history/); assert.match(text(tree), /\$618\.00/);
  assert.equal(elements(tree).some(x => x.type === 'form'), false);
  assert.match(text(tree), /Full invoice and delivery history is retained/);
});

test('verified never-collected void retains invoice history without requesting the raw stored balance', () => {
  const row = officeAcceptedOrder(); Object.assign(row, { invoiceVoided: true, paymentLabel: 'Invoice voided', paidPrincipalCents: 0, surchargeCents: 0, refundedCents: 0, balanceDueCents: 60000 });
  row.cancellation = { status: 'confirmed', revision: 4, reasonLabel: 'Customer cancellation before scheduling', refundLabel: 'No payment collected; no refund to issue', blockers: [], canConfirm: false };
  const tree = harness({ submitAction: action }).render(officeWorkspace(row));
  assert.match(text(tree), /Voided — no payment due/); assert.match(text(tree), /Order total \$600\.00/);
  assert.match(text(tree), /No payment collected; no refund to issue/); assert.match(text(tree), /Office history/);
  assert.equal(row.balanceDueCents, 60000); assert.equal(elements(tree).some(x => x.type === 'form'), false);
});

test('eligible historical cancellation shows a separate balance-release action with a required reason and confirmation', () => {
  const row = officeAcceptedOrder(); row.paymentLabel = 'Refund recorded'; row.refundedCents = 61800; row.balanceDueCents = 60000;
  row.accounting.rawBalanceDueCents = 60000; row.accounting.collectibleBalanceCents = 60000;
  row.cancellation = { status: 'requested', revision: 3, blockers: [], canConfirm: false, canCredit: true, creditBlockers: [] };
  const tree = harness({ submitAction: action }).render(officeWorkspace(row));
  assert.match(text(tree), /Invoice issued/); assert.match(text(tree), /Email delivery is recorded separately/);
  assert.ok(buttons(tree).some(x => text(x) === 'Release invoice balance'));
  assert.ok(elements(tree).find(x => x.props.name === 'confirm_credit').props.required);
  assert.ok(elements(tree).filter(x => x.props.name === 'reason').every(x => x.props.required));
  assert.match(text(tree), /does not send a refund/); assert.match(text(tree), /\$600\.00/);
  assert.equal(names(tree).some(name => ['credit_amount', 'paid', 'refund_amount', 'sent_at'].includes(name)), false);
});

test('released cancellation balance is never presented as a payment or refund', () => {
  const row = officeAcceptedOrder(); row.paymentLabel = 'Invoice balance released — no further payment due';
  row.paidPrincipalCents = 0; row.surchargeCents = 0; row.refundedCents = 0; row.balanceDueCents = 0;
  row.accounting = { ...row.accounting, rawBalanceDueCents: 60000, creditedPrincipalCents: 60000, collectibleBalanceCents: 0, creditId: 'credit-fixture' };
  row.cancellation = { status: 'confirmed', revision: 4, blockers: [], canConfirm: false, canCredit: false };
  const tree = harness({ submitAction: action }).render(officeWorkspace(row));
  assert.match(text(tree), /Cancellation credit \$600\.00/); assert.match(text(tree), /Amount still owed \$0\.00/);
  assert.match(text(tree), /Principal received \$0\.00/); assert.match(text(tree), /Refunded \$0\.00/);
  assert.doesNotMatch(text(tree), /Payment received|\bPaid\b/); assert.equal(elements(tree).some(x => x.type === 'form'), false);
});

test('pending, error and successful states expose usable feedback and stop repeated editing during submission', () => {
  const pending = harness({ pending: true, submitAction: action }).render(officeWorkspace());
  assert.ok(elements(pending).find(x => x.type === 'form').props['aria-busy']);
  assert.ok(buttons(pending).find(x => text(x) === 'Approving…').props.disabled);
  const error = harness({ actionState: { status: 'error', message: 'This review changed. Refresh before approving.' }, submitAction: action }).render(officeWorkspace());
  assert.ok(elements(error).find(x => x.props.role === 'alert')); assert.match(text(error), /Refresh before approving/);
  assert.equal(elements(error).find(x => x.type === 'fieldset').props.disabled, false);
  const saved = harness({ actionState: { status: 'success', message: 'Price approved.' }, submitAction: action }).render(officeWorkspace());
  assert.ok(elements(saved).find(x => x.props.role === 'status')); assert.ok(buttons(saved).find(x => text(x) === 'Approve price').props.disabled);
});

test('uncertain retries retain the same request identity and success refreshes the verified read', async () => {
  const submitted = []; let succeed = false;
  const h = harness({ submitAction: async (_previous, form) => { submitted.push({ request: form.get('request_id'), price: form.get('wood_price') }); return { status: succeed ? 'success' : 'error', message: succeed ? 'Saved.' : 'Refresh to check the previous attempt.' }; } });
  const tree = h.render(officeWorkspace());
  let preventedReset = false;
  elements(tree).find(x => x.type === 'form').props.onReset({ preventDefault() { preventedReset = true; } });
  assert.equal(preventedReset, true, 'React completed actions must not erase an unsuccessful office form');
  const form = new FormData(); form.set('wood_price', '427.50');
  await h.actions[0](initial(), form); succeed = true; await h.actions[0](initial(), form);
  assert.equal(submitted.length, 2); assert.match(submitted[0].request, /^[a-f0-9-]{36}$/); assert.equal(submitted[0].request, submitted[1].request); assert.equal(submitted[1].price, '427.50'); assert.equal(h.refreshes.length, 1);
});

test('paging and record links stay in the dedicated office workspace', () => {
  const model = officeWorkspace(); model.page = 2; model.hasMore = true;
  const tree = harness().render(model), links = elements(tree).filter(x => x.type === 'a');
  assert.ok(links.every(x => x.props.href.startsWith('/admin/firewood/office')));
  assert.match(links[0].props.href, /office_order=[a-f0-9-]+&office_page=2/);
  assert.ok(links.some(x => x.props.href === '/admin/firewood/office?office_page=1#website-orders'), JSON.stringify(links.map(x => ({ label: text(x), href: x.props.href }))));
  assert.ok(links.some(x => x.props.href === '/admin/firewood/office?office_page=3#website-orders'));
});
function initial() { return { status: 'idle', message: '' }; }
