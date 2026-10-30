import{getHandoffDependencies}from"@/lib/firewood/handoff/config";
import{handleHandoff}from"@/lib/firewood/handoff/handler.mjs";
export const runtime="nodejs";
export async function POST(request:Request){const deps=getHandoffDependencies();if(!deps)return Response.json({code:"handoff_unavailable",retryable:false,payment_retry_required:false},{status:503,headers:{"Cache-Control":"no-store"}});return handleHandoff(request,deps);}
