import {NextRequest,NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {authorized,configured,validPassword,session,cookieName,owner,sameOrigin,tables,readTable,mutate,validPath,objectPath,del,type RecordRow} from "@/lib/ledger-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(data:unknown=null,error:string|null=null,status=200)=>NextResponse.json({data,error:error?{message:error}:null},{status,headers:{"Cache-Control":"private, no-store"}});
const unique:Record<string,string[]>={transactions:["user_id","fingerprint"],documents:["id"],document_periods:["user_id","document_id","month"],invoices:["user_id","kind","invoice_no","party"],commission_settlements:["user_id","payer","invoice_no"],accounts:["user_id","label","entity"]};
function matches(row:RecordRow,filters:any[]){return filters.every(f=>typeof f.key==="string"&&(f.in?Array.isArray(f.value)&&f.value.includes(row[f.key]):row[f.key]===f.value))}
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return reply(null,"Invalid origin",403);
 try{
  const q=await req.json();
  if(q.action==="session")return reply({user:authorized(req)?owner:null,configured:configured()});
  if(q.action==="login"){if(!configured())return reply(null,"Set the private owner password in Vercel before signing in.",503);if(!validPassword(q.password))return reply(null,"Invalid password",401);const res=reply({user:owner});res.cookies.set(cookieName,session(),{httpOnly:true,secure:true,sameSite:"strict",path:"/",maxAge:43200});return res}
  if(q.action==="logout"){const res=reply(null);res.cookies.delete(cookieName);return res}
  if(!authorized(req))return reply(null,"Sign in required",401);
  if(q.action==="removeFiles"){if(!Array.isArray(q.paths)||!q.paths.every(validPath))return reply(null,"Invalid path",400);await del(q.paths.map(objectPath));return reply([])}
  if(!tables.includes(q.table))return reply(null,"Unknown table",400);
  const filters=Array.isArray(q.filters)?q.filters:[];
  if(q.action==="select"){const {rows}=await readTable(q.table);let result=rows.filter(r=>r.user_id===owner.id&&matches(r,filters));if(q.order){const k=q.order.key,dir=q.order.ascending?1:-1;result.sort((a,b)=>String(a[k]??"").localeCompare(String(b[k]??""))*dir||String(a.id??"").localeCompare(String(b.id??"")))}if(q.range){const a=Math.max(0,Number(q.range.from)||0),b=Math.min(a+999,Number(q.range.to)||0);result=result.slice(a,b+1)}return reply(result)}
  if(q.action==="insert"||q.action==="upsert"){const incoming=(Array.isArray(q.data)?q.data:[q.data]).map((r:RecordRow)=>({...r,user_id:owner.id,id:r.id||randomUUID(),created_at:r.created_at||new Date().toISOString()}));await mutate(q.table,rows=>{const out=[...rows];for(const r of incoming){const keys=unique[q.table];const i=out.findIndex(x=>keys.every(k=>x[k]===r[k]));if(i>=0){if(q.action==="insert")throw new Error("Duplicate record");if(!q.options?.ignoreDuplicates)out[i]={...out[i],...r,id:out[i].id}}else out.push(r)}return out});return reply(incoming)}
  if(q.action==="update"){if(!filters.length)return reply(null,"Update requires a filter",400);const {id,user_id,created_at,...updates}=q.data;await mutate(q.table,rows=>rows.map(r=>r.user_id===owner.id&&matches(r,filters)?{...r,...updates}:r));return reply([])}
  return reply(null,"Unknown operation",400)
 }catch(e){return reply(null,e instanceof Error&&e.message==="Duplicate record"?"Duplicate record":"Ledger operation failed; retry without re-uploading originals.",500)}
}
