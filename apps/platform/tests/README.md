# CRM Usability Regression Checks

Run from `apps/platform`:

```sh
node --test tests/detail-loading.test.mjs
npm run test:notifications
npm run test:schedule
npm run test:address
npm run typecheck
npm run build
```

`detail-loading.test.mjs` exercises the actual page-loading blocks with deferred
readers, checking concurrency, missing-record behavior and existing role gates.
It does not connect to Supabase or measure live latency.

`crm-usability.browser.mjs` bundles the real navigation, modal, address and
notification components into an isolated fixture. All requests are mocked;
it does not authenticate, read CRM data or perform business actions.

It requires optional `esbuild` and `playwright` testing tools plus their Chromium
and Firefox browsers. These are not production dependencies. If they are supplied
by an external toolchain, set `ESBUILD_MODULE` and `PLAYWRIGHT_MODULE` to their
absolute module entry paths. Then run:

```sh
node tests/crm-usability.browser.mjs
```

`UI_BROWSERS` optionally selects engines, for example `firefox`. Screenshots go to
the ignored `output/playwright/crm-usability` directory. The matrix covers widths
320, 390, 768 and 1440, keyboard navigation, Escape/focus return, nested modals,
scroll containment, address suggestions and notification failure/retry.

These checks supplement, not replace, an authenticated Safari/Firefox smoke test
of scheduling, employee review and quote/invoice/customer details.

## Shared UI Conventions

- Use `PlatformModal` for the existing full-viewport overlay patterns. Provide a
  label or heading ID, and either `onDismiss` or a protected `closeHref`.
- Mark the preferred initial target with `data-modal-initial-focus`. Native
  dialogs handle background inertness and keyboard containment; the component
  coordinates nested scroll locks and focus restoration.
- Popovers belonging to a modal must portal into that dialog, not outside its
  inert boundary. Address suggestions follow this rule.
- Use `review-field` for labeled compact review controls and `--control-touch-size`
  for touch targets. Navigation colors use the shared semantic navigation tokens.
