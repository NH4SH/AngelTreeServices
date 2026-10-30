import 'server-only';
import { readReleasedContext } from './runtime-admission/released-context.mjs';
// Office actions retain their actual authenticated session, authorization and RLS.
export function getFirewoodOfficeRuntime() { return readReleasedContext('office'); }
