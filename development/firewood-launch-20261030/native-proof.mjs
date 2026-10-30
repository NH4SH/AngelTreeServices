// Installed only as part of the root-owned, read-only paired runtime closure.
// No supplied callback, SQL identifier, path, environment flag or cached proof.
import { readReleasedContext } from './runtime-admission/released-context.mjs';
import { NATIVE_CONTEXT_SQL, validateVerifierBinding, combineNativeAdmission } from './native-proof-core.mjs';

export function createAdmissionVerifier(input) {
  const expected = validateVerifierBinding(input);
  return async transaction => {
    try {
      const before = readReleasedContext(expected.mode);
      if (!before || typeof transaction?.query !== 'function') throw Error('closed');
      const result = await transaction.query(NATIVE_CONTEXT_SQL);
      const after = readReleasedContext(expected.mode);
      if (!result || result.rows?.length !== 1) throw Error('closed');
      return combineNativeAdmission({ expected, before, native: result.rows[0].proof, after, nowMs: Date.now() });
    } catch { throw Error('native_admission_pending'); }
  };
}
