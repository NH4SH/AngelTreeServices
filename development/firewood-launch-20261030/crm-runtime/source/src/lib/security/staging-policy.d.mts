export type StagingManifest = { mode?: string; staging?: Record<string, string | boolean | null | undefined> };
export type DeploymentEnvironment = Record<string, string | undefined>;
export const production: Readonly<{ supabaseProjectRef: string; netlifySiteId: string; websiteSiteId: string; appOrigin: string; websiteOrigin: string }>;
export function httpsOrigin(value: string | null | undefined): string | null;
export function isStagingDeployment(manifest: StagingManifest, env?: DeploymentEnvironment): boolean;
export function checkStaging(manifest: StagingManifest, env?: DeploymentEnvironment): { ready: boolean; profile: string; errors: string[]; networkRequests: number; changesApplied: boolean };
export function assertDeploymentIsolation(manifest: StagingManifest, env?: DeploymentEnvironment): void;
