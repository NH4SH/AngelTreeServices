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
