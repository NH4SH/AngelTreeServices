import { officeUnavailable } from '@/lib/firewood/handoff/office-handler.mjs';
export const runtime = 'nodejs';
export async function POST() { return officeUnavailable(); }
