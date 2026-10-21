# Private photo cleanup verification — October 21, 2026

A failed mandatory photo audit rolls the photo metadata back. With attachment scanning enabled and the scanner unavailable, the newly uploaded object is held privately. Storage SELECT policies hide it, so an authenticated removal can return `data: []` and `error: null` while deleting nothing. The original application incorrectly called this confirmed deletion. This was reproduced in the existing disposable Supabase stack before editing the code.

## Resulting behavior

The upload action claims that a file was removed only when Storage returns one removal receipt whose name exactly matches the new upload path. Empty, missing, mismatched, failed and thrown cleanup responses produce a clear unconfirmed-cleanup message with administrator guidance. Provider and constraint diagnostics are not included in this message. The failed action preserves the job context.

Uncertain metadata acknowledgements still preserve the private object without attempting deletion: the metadata and audit may already have committed. Definite SQL failures still attempt cleanup through the original authenticated client. There is no new privileged cleanup operation, no permission change, no migration and no automatic purge. Existing metadata, audit, ownership, scan-state and financial boundaries remain intact.

A held orphan can therefore remain in private storage for later reviewed recovery/retention. This change makes that outcome truthful and verifies its access protection; it does not introduce an orphan-file removal service.

## Verification

- Existing CRM unit/isolated PostgreSQL suite: 2,171 passed, zero failures or skips.
- Focused photo outcome and actual-policy tests: 26 passed (included in the full suite).
- Guarded real local Auth/Storage/RLS/provider integration suite: 15 passed, zero failures or skips. It requires the existing local fixture's attachment scanning to be enabled and uses synthetic records only.
- Held-object case: metadata and mandatory audit both roll back, repeated authenticated removal returns an empty receipt, and download and signed-link creation remain denied.
- Clean-object case: only the scanner verdict is synthetic; actual Storage upload/download, hash-bound scan claim/finish, mandatory audit rollback and authenticated deletion remain real. The new clean object is removed, its deletion is tracked, and an existing photo plus its audit and bytes remain intact.
- All six photo categories, original allowed roles, disabled/cross-job denial, notification concurrency and ambiguous provider acknowledgement checks pass.
- Typecheck and production build passed in a separate current-source export with reserved synthetic settings. The active review server, real target manifests and credentials were not copied or changed. This is local build evidence, not hosted staging acceptance.

The fresh main comparison included three website-only commits through `97ca65b`. Their committed platform tree matched `08c2d9f` exactly, so the verified app source was preserved during the fast-forward.

Private local evidence is under `/Users/noelsierra/Documents/Codex/2026-10-21/home-mac-scanner-setup/`: `photo-cleanup-baseline.private.log`, `photo-cleanup-verified.private.log`, `photo-cleanup-unit.private.log`, isolated typecheck/build logs and `photo-cleanup-verification-location.json`. No credentials are included in this document.
