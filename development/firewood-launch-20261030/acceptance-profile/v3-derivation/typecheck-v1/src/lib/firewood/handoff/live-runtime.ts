import 'server-only';

import { getProtectedLiveDependencies, type LiveRuntimeMode, type LiveRuntimeOperation } from './protected-runtime.mjs';

// Operative candidate only. Missing actual root mounts or paired admission stays closed.
export function getLiveHandoffDependencies(mode: LiveRuntimeMode, operation: LiveRuntimeOperation) {
  return getProtectedLiveDependencies(mode, operation);
}
