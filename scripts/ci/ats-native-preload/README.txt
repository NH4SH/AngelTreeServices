This workflow proves a narrow PostgreSQL dependency on an ephemeral GitHub ARM64
runner so that the production server does not need another test VM.

Only a digest-pinned PUBLIC vendor image and public migration are inputs. The
preload value is derived inside the runner from that migration and checked by
hash; no captured private setting is uploaded. Artifact paths/names are hashed.
No database row, production credential, provider endpoint, host mount, primary
activation file or recovery authority is an input. The container has a read-only
root, no bind mounts/capabilities, a private tmpfs and Unix socket, 512MiB memory,
one CPU and no external network. A real failed outbound connection is checked.

The proof checks the two ELF files by digest, device and inode in a real native
authenticator backend. Cleanup targets only the newly labeled fixture container.
The artifact is sanitized metadata; raw command outputs are not uploaded.

This is not complete schema replay, application/worker runtime acceptance,
backup/restore acceptance, or permission to activate a production transition.

The expanded fixture also applies the exact candidate local-primary SQL to a
small synthetic RLS schema. It checks real low-privilege writes, deferred COMMIT
under a competing maintenance hold, old-backup independence, unchanged legacy
proofs, restart rejection and exact committed SQL timestamps through the pure
JavaScript publication bridge. All role names, rows and installation identifiers
in this synthetic portion are fixture values. It does not prove original-host
activation custody, filesystem readers, restored-clone safety or full-schema
event handlers. No synthetic success authorizes production admission.

The file-control phase uses a separate private Linux mount/PID/network namespace
on this same disposable runner. Two new tmpfs mounts contain synthetic 0444
root-owned metadata. The actual Node process runs as 1000:1000, without groups
or capabilities and with no_new_privs. It checks the fixed-path reader and local
validator with the cloud authority PEM absent, then rejects wrong UID, writable
files/mounts, runtime-owned files, symlinks, hardlinks, a hold latch and a legacy
descriptor without its required PEM. Native /proc evidence is read directly.
No host bind mount or production file is supplied. The owned mounts/directories
are removed and the namespace process is joined before acceptance. This phase
does not emulate the production rootless user namespace or prove its overflow
owner IDs, original-host activation custody, reboot orchestration or clone safety.
