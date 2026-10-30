import { createClient } from '@/lib/supabase/server';
import { getUserRoles, hasAllowedRole, platformRoleGroups } from '@/lib/auth/roles';
import { searchCommandRecords } from '@/lib/data/command-search';
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie'};
export async function GET(request:Request) {
  try {
    const db=await createClient();if(!db)return Response.json({results:[],error:'Search is unavailable.'},{status:503,headers});
    const user=(await db.auth.getUser()).data.user;
    if(!user)return Response.json({results:[],error:'Sign in to search records.'},{status:401,headers});
    if(!hasAllowedRole(await getUserRoles(db,user.id),platformRoleGroups.internalStaff))return Response.json({results:[],error:'Office access is required.'},{status:403,headers});
    const query=new URL(request.url).searchParams.get('q')??'';
    if(query.length>80)return Response.json({results:[],error:'Use up to 80 characters.'},{status:400,headers});
    return Response.json({results:await searchCommandRecords(db,query,request.signal)},{headers});
  } catch {return Response.json({results:[],error:'Record search could not load. Try again.'},{status:503,headers});}
}
