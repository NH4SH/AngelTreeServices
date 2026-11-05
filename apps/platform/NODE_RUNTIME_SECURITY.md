# CRM runtime floor

The November 4 consolidation preserves the already reviewed live runtime guards. Use Node 22.23.4 or later in the 22.x line, or Node 24.22.1 or later in the 24.x line. `.node-version` selects 22.23.4; both supported lanes remain in the regression workflow. The guard is advisory-specific and does not claim that future vulnerabilities are resolved.

The framework is pinned to Next 16.4.3, matching the frozen live candidate. Main was previously on 16.4.2. Keep the package and lockfile aligned; do not downgrade to rebuild an older snapshot.

`predev`, `prebuild` and `prestart` check the runtime before starting work. Worker diagnostics report only a fixed allowlist of runtime facts and never fail a worker if logging is unavailable. The public liveness response remains free of runtime/credential details.

These source and CI settings do not select a provider runtime, update a host or deploy an application. A release still needs its actual installed runtime verified separately.
