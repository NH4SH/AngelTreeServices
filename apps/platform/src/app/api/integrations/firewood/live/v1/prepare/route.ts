import { getLiveHandoffDependencies } from '@/lib/firewood/handoff/live-runtime';
import { handleLiveHandoff, liveHandoffUnavailable } from '@/lib/firewood/handoff/live-handler.mjs';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const dependencies = getLiveHandoffDependencies();
  return dependencies ? handleLiveHandoff(request, dependencies) : liveHandoffUnavailable();
}
