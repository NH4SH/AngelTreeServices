import { handleOfficeHandoff, officeUnavailable } from '@/lib/firewood/handoff/office-handler.mjs';
import { classifyOfficeHandoffRequest, getProtectedOfficeDependencies } from '@/lib/firewood/handoff/protected-runtime.mjs';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const operation = classifyOfficeHandoffRequest(request);
  if (!operation) return officeUnavailable();
  const dependencies = getProtectedOfficeDependencies(operation);
  return dependencies ? handleOfficeHandoff(request, dependencies) : officeUnavailable();
}
