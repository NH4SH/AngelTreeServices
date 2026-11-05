import { assessNodeRuntime } from '../src/lib/security/node-runtime.ts';

const result = assessNodeRuntime(process.version);
if (!result.supportedForBuild) {
  console.error('Use Node 22.23.4+ (22.x) or 24.22.1+ (24.x) before building the CRM. See NODE_RUNTIME_SECURITY.md.');
  process.exitCode = 1;
} else {
  console.info(`CRM build runtime: ${result.nodeVersion}; ${result.advisory} fix present in this Node release.`);
}
