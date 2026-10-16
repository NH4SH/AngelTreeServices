# Reversible website sender blocking

Implemented locally after PR17, on `codex/reversible-sender-blocking`, based on
main `b2d4c781c29f1b7058f171ab62bd5fad8a987bc6`. This feature is not pushed or
deployed. Its migration has been exercised only in disposable local databases.

## Office workflow

1. Mark an unwanted website lead as spam in **Leads & Communications**.
2. Open **Spam**, then choose **Block sender** on that lead.
3. Review the exact email and phone shown. Select the contact or contacts to
   block and enter a reason. Email starts selected when available; phone does
   not. A matching email **or** matching phone is sufficient when both are
   selected. Shared contacts will also match other people using them.
4. Confirm **Block selected contacts**. Read the result, then choose **Done**.
5. To reverse a block, expand **Blocked senders**, find the exact contact, choose
   **Unblock**, and give a reason. Each contact is unblocked separately.

Active blocks are the default register view. **All blocks and history** retains
reasons, dates, original-lead links, unblock reasons, and the number of retained
blocked requests matching each block. Both views are paginated, 25 rows at a time.
An empty register and a failed read have different, explicit states.

Spam classification, restoring a lead, and blocking a sender are separate actions.
Restoring a lead does not unblock its sender. Unblocking does not restore spam
leads, replay blocked requests, or send old messages. Existing manual delivery
review remains governed by PR14's current-source and provider-evidence checks.

## What a block does

- Match exact normalized email addresses or phone numbers explicitly selected by
  an active owner or administrator. Reuse the public intake's lowercase-email
  and digit/country-code phone conventions.
- Check inside the existing PR13 transaction before creating a customer,
  organization, contact, location, job, note, activity entry, or notice intent.
- Retain only the submission ID, payload hash, matching block IDs and timestamp
  for a blocked request. Do not copy its message, address, name or contact data
  into new CRM records. Blocked request IDs remain consumed after unblocking.
- Return the same new-request public HTTP status and response body as an accepted
  request. Never return a match, block reason, CRM ID, or blocklist membership.
- Prevent a later website office-notice dispatch or supervised resend from
  bypassing a currently matching block, using PR14's existing eligibility gate.

A sender block is scoped to website intake and its office notices. It does not
disable a customer account, delete records, merge customers, change existing
financial work, or suppress legitimate quote/invoice/payment mail. It does not
infer matches from names, addresses, domains, shared households or IP addresses.
Someone who changes every selected identifier can submit again. Existing
honeypots, validation, origin checks, shared rate limits and duplicate warnings
continue to operate.

An email already claimed for provider I/O cannot be recalled by a later block.
No database lock is held during provider calls. Accepted or uncertain delivery
facts remain available for PR14 review; blocking never rewrites those facts.

## Transaction and authorization boundaries

Migration: `supabase/migrations/20261016210536_reversible_website_sender_blocks.sql`.
It is additive; no old migration, public/storage RLS policy, financial command or
employee interface is changed.

`app_private.website_sender_blocks` retains block/unblock history;
`app_private.blocked_website_submissions` retains minimal blocked decisions.
Both have RLS enabled and no direct table privileges for `anon`, `authenticated`
or `service_role`. Intentional private-table RLS-without-client-policy INFO
advisories do not represent public access.

The four public staff RPCs are invoker wrappers. Their private privileged
implementations check the live profile, employee and owner/admin role state.
Service-role callers and anonymous callers cannot operate the staff controls.
Writes take PR02's role-management lock and check authority after waiting, so a
queued operation cannot rely on an offboarded administrator's old token.

Intake, block and unblock acquire the same ordered contact advisory locks, sorted
by the actual lock keys. The existing submission-ID and fingerprint locks remain
intact. Blocks commit with their mandatory audit entry or roll back together.
Confirmation IDs make response-loss retries idempotent, including after a later
unblock. Reusing a confirmation ID for different inputs is rejected.

The original saved PR14 submission supplies the contacts to block. Older leads
without that snapshot use their exact current customer/organization contacts.
The command compares the reviewed contacts before saving and rejects a changed
preview. It never silently substitutes another recipient.

The confirmation remains mounted until Done. This page reads uncached data and
refreshes on close; server-side revalidation during the action would otherwise
remove the final active register row before its success could be read.

## Intake paths and rollout boundary

The current website enhancement in `ats-form-enhancements.js` posts to the
configured `/api/leads` endpoint; `index.html` sets the CRM intake URL.
`apps/platform/src/app/api/leads/route.ts` uses `submit_website_lead`, so retries and
all calls through that command receive the same blocking decision. PR14 notice
repair reuses the saved submission and its shared delivery eligibility check.

The HTML form also retains its existing **Netlify Forms fallback** for browsers
without JavaScript. This feature does not configure a Netlify blocklist, remove
that fallback, or claim to filter Netlify's separate submission inbox. No other
live Netlify-to-CRM import was verified or enabled in this local work. Before a
future production rollout, confirm any external form handlers, imports, or
automations also use the canonical CRM intake command. This is a release check,
not an authorization to deploy or alter production configuration.

Production rollout still requires the established migration reconciliation
process and an explicitly authorized application release. No hosted migration,
production change, provider send, secret edit or deployment was performed.

## Verification

- 23 local integration scenarios plus their parent test, with real disposable
  PostgreSQL, Auth, API permissions, row security and the running Next endpoint.
- Normalization, email-only/phone-only/commercial requests, unrelated/shared
  contacts, duplicate races, submission-ID collisions, held transactions,
  rollback on audit failure, idempotent response-loss replay and partial unblock.
- Disabled/separated actors with issued tokens and an operation queued behind
  access revocation are denied. Raw block tables remain inaccessible.
- PR14 notice preparation, dispatch admission and supervised repair cannot bypass
  a block; existing quote mail remains eligible and no real provider is called.
- Existing PR13 intake, PR14 delivery and PR17 reporting integration suites pass.
- Full unit/PostgreSQL suite, typecheck and production build pass.
- Fresh replay of all 87 repository migrations, SQL lint, and security advisors.
  All 86 prior migrations and existing public/storage RLS are preserved. Of 210
  prior application functions, only the two documented private intake/eligibility
  bodies change. New definitions and grants match the fresh replay.
- Native dialogs checked at desktop and 390px: Cancel-first focus, Escape focus
  return, wrapped identifiers, pending controls, success/error and empty states.
- Independent UI review scored its single selected-filter fix resolved (`ship`
  for that fix). Existing CRM design artifacts are preserved.

See `tests/README.md` for the opt-in local integration command. Detailed run logs,
file hashes and screenshots are retained outside tracked application files in
the local setup evidence folder.
