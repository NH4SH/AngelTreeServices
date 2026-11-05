const fixedVersions: Record<number, readonly [number, number]> = {
  22: [23, 4],
  24: [22, 1],
  26: [12, 1],
};

/** Advisory-specific evidence, not a claim about all future Node vulnerabilities. */
export function assessNodeRuntime(version: string) {
  const parsed = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  const major = parsed ? Number(parsed[1]) : 0;
  const minor = parsed ? Number(parsed[2]) : 0;
  const patch = parsed ? Number(parsed[3]) : 0;
  const minimum = fixedVersions[major];
  const patched = Boolean(minimum && (minor > minimum[0] || (minor === minimum[0] && patch >= minimum[1])));
  return {
    advisory: "CVE-2026-111497",
    nodeVersion: parsed ? `v${major}.${minor}.${patch}` : "unknown",
    patched,
    supportedForBuild: patched && (major === 22 || major === 24),
  };
}

const logged = new Set<string>();
const components = new Set([
  "crm-server", "Communication processing", "Scheduled job processing",
  "Manager notifications", "Calendar processing", "System health monitoring",
]);

export function logNodeRuntimeOnce(component: string) {
  component = components.has(component) ? component : "crm-worker";
  if (logged.has(component)) return;
  logged.add(component);
  // Fixed field allowlist: never include credentials, request data or all env.
  const deployId = process.env.DEPLOY_ID;
  const record = {
    event: "ats_runtime_security",
    component,
    ...assessNodeRuntime(process.version),
    architecture: process.arch,
    platform: process.platform,
    ...(deployId && /^[a-f0-9]{24}$/.test(deployId) ? { deployId } : {}),
  };
  // Observability must not interrupt a worker or replay its side effects.
  try { console.info(JSON.stringify(record)); } catch { /* Keep existing behavior. */ }
}
