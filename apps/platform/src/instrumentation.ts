import { assertCurrentDeploymentIsolation } from "./lib/security/deployment";
import { logNodeRuntimeOnce } from "./lib/security/node-runtime";

export function register() {
  assertCurrentDeploymentIsolation();
  if (process.env.NEXT_RUNTIME !== "edge") logNodeRuntimeOnce("crm-server");
}
