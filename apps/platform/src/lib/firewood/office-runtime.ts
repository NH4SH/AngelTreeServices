import 'server-only';
// Office actions use the actual authenticated session client after admission,
// never a service credential. No live schema/recovery admission is installed.
export function getFirewoodOfficeRuntime(): null { return null; }
