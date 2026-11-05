import * as legacyTerms from '../../src/lib/documents/terms/legacy-2026-10-22.ts';
import * as legacyFirewoodTerms from '../../src/lib/documents/terms/firewood-2026-10-24.ts';
import * as liveFirewoodTerms from '../../src/lib/documents/terms/firewood-household-live-2026-10-29-v1.ts';
import * as handoffFirewoodTerms from '../../src/lib/documents/terms/firewood-handoff-test-2026-10-29.ts';
// Real document and accounting projection; all invoice rows and server reads are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as accounting from '../../src/lib/documents/firewood-invoice-accounting.mjs';
import * as contract from '../../src/lib/firewood/handoff/live-contract.mjs';
const require = createRequire(import.meta.url), ts = require('typescript');
const id = '00000000-0000-4000-8000-000000000010', order = '00000000-0000-4000-8000-000000000020';
const invoice = {
  id, invoice_number: 'INV-FW-' + order.toUpperCase(), document_terms_version: contract.LIVE_TERMS_POLICY.version,
  status: 'credited', total_cents: 60000, subtotal_cents: 60000, tax_cents: 0, balance_due_cents: 60000,
  created_at: '2026-11-04T12:00:00Z', due_at: null, customers: { display_name: 'Synthetic customer' },
  organizations: null, service_locations: { street: '123 Synthetic Lane', city: 'Fredericksburg', state: 'VA', postal_code: '22407' },
  invoice_line_items: [{ id: 'line', sort_order: 0, description: 'Firewood delivered', quantity: 1, unit_price_cents: 60000, total_cents: 60000 }],
};
function source(paid = 0, credit = 60000) {
  return { managed: true, invoice_id: id, order_id: order, source_id: contract.LIVE_HANDOFF_SOURCE,
    environment_id: contract.LIVE_HANDOFF_ENVIRONMENT, account_id: contract.LIVE_ACCOUNT,
    contract: contract.LIVE_HANDOFF_CONTRACT, mode: 'live', livemode: true, receipt_authority: 'crm',
    terms_hash: contract.LIVE_TERMS_HASH, payment_policy_hash: contract.LIVE_PAYMENT_POLICY_HASH,
    allowed: false, review_required: false, order_state: 'cancelled', paid_principal_cents: paid,
    accounting: { issued_at: '2026-11-04T12:00:00Z', original_principal_cents: 60000,
      raw_balance_due_cents: 60000 - paid, credited_principal_cents: credit, collectible_balance_cents: Math.max(0, 60000 - paid - credit),
      credit_id: credit ? '00000000-0000-4000-8000-000000000030' : null } };
}
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join(' ')
  : typeof node !== 'object' ? String(node) : typeof node.type === 'function' ? text(node.type(node.props)) : text(node.props?.children);
function moduleFor(model) {
  const shell = [], terms = [], serverReads = [];
  const deps = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@/lib/documents/firewood-invoice-accounting.mjs': accounting,
    '@/lib/documents/firewood-invoice-accounting-server': { async getFirewoodInvoiceDocumentAccounting(value) { serverReads.push(value.id); return model; } },
    '@/components/documents/document-shell': { DocumentShell(props) { shell.push(props); return props.children; }, DocumentMeta() { return null; } },
    '@/components/documents/document-terms': { DocumentTerms(props) { terms.push(props); return null; } },
    '@/lib/documents/terms': { getInvoiceTerms: version => ({ version }) },
    '../../lib/documents/terms/firewood-2026-10-24.ts': { FIREWOOD_TERMS_VERSION: 'firewood-2026-10-24' },
    '@/lib/email/config': { getEmailSetupState: () => ({ replyTo: 'office@example.invalid' }) },
    '@/lib/business-time': { formatBusinessDateTime: () => 'Nov 4, 2026' },
    '@/lib/invoices/status': { formatInvoiceStatus: value => value, getInvoiceDisplayNumber: value => value },
  };
  const src = readFileSync(new URL('../../src/components/documents/invoice-document.tsx', import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { fileName: 'invoice-document.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => { assert.ok(name in deps, name); return deps[name]; }, module, module.exports);
  return { ...module.exports, shell, terms, serverReads };
}

test('cancellation credit never becomes a fabricated payment and retained cash remains separate', () => {
  const value = accounting.firewoodInvoiceDocumentAccounting(invoice, source(10000));
  assert.equal(value.kind, 'credited'); assert.equal(value.paidCents, 0); assert.equal(value.creditCents, 60000);
  assert.equal(value.retainedCents, 10000); assert.equal(value.balanceDueCents, 0); assert.equal(value.canRequestPayment, false);
});
test('unconfirmed source balances close payment requests instead of falling back to the invoice row', () => {
  const current = source(); current.accounting.collectible_balance_cents = 1;
  const value = accounting.firewoodInvoiceDocumentAccounting(invoice, current);
  assert.equal(value.kind, 'unconfirmed'); assert.equal(value.balanceDueCents, null); assert.equal(value.canRequestPayment, false);
  assert.equal(accounting.firewoodInvoiceDocumentAccounting({ ...invoice, invoice_number: 'INV-ORDINARY', document_terms_version: 'legacy' }, current), null);
});
test('real invoice document labels a cancellation credit separately, preserving main branding and Firewood headings', async () => {
  const model = accounting.firewoodInvoiceDocumentAccounting(invoice, source());
  const render = moduleFor(model), output = text(await render.InvoiceDocument({ invoice, firewoodAccounting: model }));
  assert.match(output, /Cancellation credit/); assert.match(output, /Firewood and delivery/);
  assert.match(output, /No further payment is requested/); assert.doesNotMatch(output, /Paid -\$600/);
  assert.equal(render.serverReads.length, 0); assert.equal(render.shell[0].contactEmail, 'office@example.invalid');
  assert.equal(render.shell[0].statusLabel, 'Balance credited'); assert.equal(render.terms[0].title, 'Firewood order terms');
});
test('ordinary document keeps its existing payment arithmetic and does not make a Firewood server read', async () => {
  const render = moduleFor(null), ordinary = { ...invoice, status: 'sent', invoice_number: 'INV-ORDINARY', document_terms_version: 'legacy', balance_due_cents: 50000 };
  const output = text(await render.InvoiceDocument({ invoice: ordinary }));
  assert.match(output, /Paid - \$100\.00/); assert.match(output, /Balance due \$500\.00/);
  assert.doesNotMatch(output, /Cancellation credit|NaN/); assert.equal(render.serverReads.length, 0);
});
test('real Firewood document displays an unknown balance without requesting payment', async () => {
  const model = accounting.unconfirmedFirewoodDocument(), render = moduleFor(model);
  const output = text(await render.InvoiceDocument({ invoice, firewoodAccounting: model }));
  assert.match(output, /Not confirmed/); assert.match(output, /before paying/); assert.doesNotMatch(output, /Balance due: \$600\.00/);
});

test('versioned registry adds the exact accepted live terms while preserving every main legacy/default boundary', () => {
  const src = readFileSync(new URL('../../src/lib/documents/terms.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = { './terms/legacy-2026-10-22.ts': legacyTerms, './terms/firewood-2026-10-24.ts': legacyFirewoodTerms,
    './terms/firewood-household-live-2026-10-29-v1.ts': liveFirewoodTerms, './terms/firewood-handoff-test-2026-10-29.ts': handoffFirewoodTerms,
    '@/lib/business-time': { formatBusinessDate: () => 'Synthetic deadline' } };
  const m = { exports: {} }; new Function('require', 'module', 'exports', js)(name => { assert.ok(name in deps, name); return deps[name]; }, m, m.exports);
  assert.equal(m.exports.getInvoiceTerms(contract.LIVE_TERMS_POLICY.version), contract.LIVE_TERMS_CLAUSES);
  assert.equal(m.exports.getInvoiceTerms(), legacyTerms.legacyInvoiceTerms);
  assert.equal(m.exports.getInvoiceTerms(legacyFirewoodTerms.FIREWOOD_TERMS_VERSION), legacyFirewoodTerms.firewoodInvoiceTerms);
  assert.throws(() => m.exports.getInvoiceTerms('unknown-future-policy'));
  assert.equal(m.exports.getQuoteTerms()[0], legacyTerms.legacyQuoteTerms[0]);
  assert.match(m.exports.getQuoteTerms('2026-11-05')[0].text, /Synthetic deadline/);
});
