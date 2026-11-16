import { createClient } from 'npm:@supabase/supabase-js@2';
export const service=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
export function headers(req:Request){
 const origin=req.headers.get('origin');const allowed=(Deno.env.get('ALLOWED_ORIGINS')??'http://localhost:8081,http://localhost:8082').split(',').map(s=>s.trim());
 return {'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(origin&&allowed.includes(origin)?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
}
export function json(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:headers(req)});}
export function invalidOrigin(req:Request){const origin=req.headers.get('origin');return origin&&!headers(req)['Access-Control-Allow-Origin'];}
export async function parse(req:Request,limit=4096){if(Number(req.headers.get('content-length')??0)>limit)throw new Error('Request too large');const text=await req.text();if(text.length>limit)throw new Error('Request too large');return JSON.parse(text);}
