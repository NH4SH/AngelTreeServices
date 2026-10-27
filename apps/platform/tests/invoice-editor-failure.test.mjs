import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url), ts = require('typescript'), id = 'a0000000-0000-4000-8000-000000000001';
test('incomplete invoice reads show a recovery link and never expose a saveable partial form', async () => {
  // The repository runner enables React Server Components. DOM's static renderer
  // is intentionally tested in its supported React entry point in a child process.
  if (process.execArgv.includes('--conditions=react-server')) {
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--test', fileURLToPath(import.meta.url)], { encoding: 'utf8' });
    assert.equal(child.status, 0, child.stdout + child.stderr); return;
  }
  const { renderToStaticMarkup } = await import('react-dom/server');
  for (const fault of ['detail', 'categories']) {
    let mounted = 0;
    const deps = {
      'react/jsx-runtime': require('react/jsx-runtime'),
      'lucide-react': {},
      'next/link': ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children),
      '../../InvoiceForm': { EditInvoiceForm: () => { mounted++; return React.createElement('form', null, 'Save changes'); } },
      '@/components/PlatformFrame': { PlatformFrame: ({ children }) => React.createElement('main', null, children) },
      '@/components/SetupRequired': {},
      '@/lib/auth/pageContext': { getAuthenticatedPlatformContext: async () => ({ configured: true, user: { email: 'synthetic@example.invalid' }, roles: ['owner'] }) },
      '@/lib/auth/roles': { hasAllowedRole: () => true, platformRoleGroups: { financialReporting: ['owner'] } },
      '@/lib/data/invoices': { getInvoiceForEditing: async () => ({ data: { id, status: 'draft' }, error: fault === 'detail' ? 'Billing lines could not load' : null }) },
      '@/lib/invoices/status': { getInvoiceDisplayNumber: () => 'Synthetic invoice' },
      '@/lib/drafts/return-context': { safeReturnTo: () => '/admin/invoices', withReturnTo: path => path },
      '@/lib/data/reports': { getServiceCategories: async () => ({ data: [], error: fault === 'categories' ? 'Categories could not load' : null }) },
    };
    const code = ts.transpileModule(readFileSync(new URL('../src/app/admin/invoices/[invoiceId]/edit/page.tsx', import.meta.url), 'utf8'), { fileName: 'page.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, m = { exports: {} };
    new Function('require', 'module', 'exports', code)(name => { assert.ok(name in deps, name); return deps[name]; }, m, m.exports);
    const html = renderToStaticMarkup(await m.exports.default({ params: Promise.resolve({ invoiceId: id }), searchParams: Promise.resolve({}) }));
    assert.equal(mounted, 0); assert.match(html, /Invoice editor unavailable/); assert.match(html, /role="status"/); assert.ok(html.includes('href="/admin/invoices/' + id + '/edit"')); assert.doesNotMatch(html, /<form/);
  }
});
