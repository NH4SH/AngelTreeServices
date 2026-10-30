# Firewood launch source preservation

This directory preserves the October 30 installation, receipt, recovery, acceptance and runtime source that was outside the application Git worktrees. It is an archival development snapshot, not an installed or production-ready release. Production activation and end-to-end acceptance remain pending in the CRM and Website chats.

Credential files, private account/readback descriptors, database contents, captures and generated artifacts are excluded. Synthetic credentials in test fixtures and schema-name references were manually reviewed after credential scanning. The matching application worktree snapshots are on codex/local-preservation-20261030 branches. These files are retained outside build entrypoints so this preservation commit does not install or enable them.
