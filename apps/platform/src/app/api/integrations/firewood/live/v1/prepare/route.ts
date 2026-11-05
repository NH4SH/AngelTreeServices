import { getLiveHandoffDependencies } from '@/lib/firewood/handoff/live-runtime';
import { handleLiveHandoff, liveHandoffUnavailable } from '@/lib/firewood/handoff/live-handler.mjs';
import { classifyLiveHandoffRequest } from '@/lib/firewood/handoff/protected-runtime.mjs';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const operation = classifyLiveHandoffRequest(request);
  if (!operation) return liveHandoffUnavailable();
  const dependencies = getLiveHandoffDependencies(operation.mode, operation.operation);
  return dependencies ? handleLiveHandoff(request, dependencies) : liveHandoffUnavailable();
}
