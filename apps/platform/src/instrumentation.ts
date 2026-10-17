import { assertCurrentDeploymentIsolation } from "./lib/security/deployment";

export function register() {
  assertCurrentDeploymentIsolation();
}
