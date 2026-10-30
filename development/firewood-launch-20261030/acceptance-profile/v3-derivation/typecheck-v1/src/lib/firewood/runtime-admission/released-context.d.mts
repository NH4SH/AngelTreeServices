export type ReleasedMode = 'status' | 'preparation' | 'office' | 'collection' | 'sending';
export type ReleasedContext = Readonly<{
  mode: ReleasedMode; namespace: string; generation: number; sourceId: string;
  systemIdentifier: string; sourceBoot: string; databaseBoot: string; databaseStartedAtMs: number;
  topologyFingerprint: string; timeline: number; bindingSha256: string; authorityPublicKeyFingerprint: string;
  schemaSha256: string; releaseSha256: string; installationOverlaySha256: string; signingKeyId: string; signingKeyFingerprint: string;
  stripeKeyFingerprint: string; contract: string; officeContract: string; source: string;
  environment: string; account: string; portalOrigin: string; websiteOrigin: string;
  termsHash: string; paymentPolicyHash: string; modes: Readonly<Record<ReleasedMode, boolean>>;
  backupCaptureStartedAtMs: number; backupVerifiedAtMs: number; captureStartedBootMs: number;
  backupAgeMs: number; observedMonotonicMs: number; receiptComponentSha256: string;
  receiptSequence: number; receiptExpiresAtMs: number; expiresAtMs: number; observedAtMs: number;
}>;
export function readReleasedContext(mode?: ReleasedMode): ReleasedContext | null;
export function createReleasedDependenciesFactory<T extends { config: unknown }>(mode: ReleasedMode,
  privateSupplier: (context: ReleasedContext) => T | null): () => T | null;
export function getReleasedDependencies(): null;
