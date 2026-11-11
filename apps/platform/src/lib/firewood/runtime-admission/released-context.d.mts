export type ReleasedMode = 'status' | 'preparation' | 'office' | 'collection' | 'sending';
type SharedReleasedContext = Readonly<{
  mode: ReleasedMode; namespace: string; generation: number; sourceId: string;
  systemIdentifier: string; sourceBoot: string; databaseBoot: string; databaseStartedAtMs: number;
  topologyFingerprint: string; timeline: number; bindingSha256: string;
  schemaSha256: string; releaseSha256: string; installationOverlaySha256: string; signingKeyId: string; signingKeyFingerprint: string;
  stripeKeyFingerprint: string; contract: string; officeContract: string; source: string;
  environment: string; account: string; portalOrigin: string; websiteOrigin: string;
  termsHash: string; paymentPolicyHash: string; modes: Readonly<Record<ReleasedMode, boolean>>;
  observedMonotonicMs: number; expiresAtMs: number; observedAtMs: number;
}>;
export type LegacyReleasedContext = SharedReleasedContext & Readonly<{
  admissionProtocol?: undefined; primaryInstallationId?: never;
  authorityPublicKeyFingerprint: string; backupCaptureStartedAtMs: number; backupVerifiedAtMs: number;
  captureStartedBootMs: number; backupAgeMs: number; receiptComponentSha256: string;
  receiptSequence: number; receiptExpiresAtMs: number;
  operationSequence?: never; operationObservedAtMs?: never; operationObservedBootMs?: never; operationAgeMs?: never;
}>;
export type LocalReleasedContext = SharedReleasedContext & Readonly<{
  admissionProtocol: 'local-primary-operation-v1'; primaryInstallationId: string;
  operationSequence: number; operationObservedAtMs: number; operationObservedBootMs: number; operationAgeMs: number;
  authorityPublicKeyFingerprint?: never; backupCaptureStartedAtMs?: never; backupVerifiedAtMs?: never;
  captureStartedBootMs?: never; backupAgeMs?: never; receiptComponentSha256?: never;
  receiptSequence?: never; receiptExpiresAtMs?: never;
}>;
export type ReleasedContext = LegacyReleasedContext | LocalReleasedContext;
export function readReleasedContext(mode?: ReleasedMode): ReleasedContext | null;
export function createReleasedDependenciesFactory<T extends { config: unknown }>(mode: ReleasedMode,
  privateSupplier: (context: ReleasedContext) => T | null): () => T | null;
export function getReleasedDependencies(): null;
