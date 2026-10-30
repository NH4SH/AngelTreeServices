import { assertCurrentDeploymentIsolation } from "./lib/security/deployment";

export async function register() {
  assertCurrentDeploymentIsolation();
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logNodeRuntimeOnce } = await import("./lib/security/node-runtime");
    logNodeRuntimeOnce("crm-server");
  }
}
