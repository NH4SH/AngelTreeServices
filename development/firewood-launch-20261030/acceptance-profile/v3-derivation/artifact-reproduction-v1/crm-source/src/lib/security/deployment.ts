import targets from "../../../staging/targets.json" with { type: "json" };
import { assertDeploymentIsolation } from "./staging-policy.mjs";

// The reviewed target travels with the build. Clearing APP_ENV at runtime cannot
// turn an assigned staging artifact into a production artifact.
export { targets };
export function assertCurrentDeploymentIsolation() {
  assertDeploymentIsolation(targets, process.env);
}
