// Production entry: fixed paths, actual process identity and clocks, no environment or test override.
import { readFixedSnapshot } from './release-filesystem.mjs';
import { validateReleasedSnapshot, MODES, privateConfigurationMatches, sameRelease } from './released-context-core.mjs';

export function readReleasedContext(mode = 'status') {
  return null; // Actual signed synthetic acceptance authority is not registered.

  try {
    const snapshot = readFixedSnapshot({
      platform: process.platform, uid: process.getuid?.(), pid: process.pid, wallMs: Date.now(),
    });
    snapshot.wallMs = Date.now();
    return validateReleasedSnapshot(snapshot, mode);
  } catch { return null; }
}

// Supplier is trusted composition code, synchronous and side-effect-free. It is never invoked unless
// the real fixed-path master gate is valid. This file does not install a supplier or connect providers.
export function createReleasedDependenciesFactory(mode, privateSupplier) {
  if (!MODES.includes(mode) || typeof privateSupplier !== 'function') throw new TypeError('Invalid release factory');
  return () => {
    try {
      const before = readReleasedContext(mode);
      if (!before) return null;
      const supplied = privateSupplier(before);
      if (!supplied || typeof supplied !== 'object' || typeof supplied.then === 'function'
        || !privateConfigurationMatches(before, supplied.config)) return null;
      // A supplier cannot prolong a past lease, hide a new fence or cross a release/key change.
      const after = readReleasedContext(mode);
      if (!sameRelease(before, after) || !privateConfigurationMatches(after, supplied.config)) return null;
      return supplied;
    } catch { return null; }
  };
}

// No private supplier is installed by this local source work.
export function getReleasedDependencies() { return null; }
