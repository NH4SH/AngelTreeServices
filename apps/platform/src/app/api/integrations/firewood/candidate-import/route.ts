import {getFirewoodCandidateDependencies} from "@/lib/firewood/candidate-config";
import {handleFirewoodCandidateImport} from "@/lib/firewood/candidate-handler";
export const runtime="nodejs";
export async function POST(request:Request){
 const deps=getFirewoodCandidateDependencies();
 if(!deps)return Response.json({code:"candidate_import_unavailable",retryable:false},{status:503,headers:{"Cache-Control":"no-store"}});
 return handleFirewoodCandidateImport(request,deps);
}
