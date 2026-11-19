import {get,put,head,del} from "@vercel/blob";
import {createHmac,timingSafeEqual,randomUUID} from "node:crypto";
import type {NextRequest} from "next/server";
export const owner={id:"00000000-0000-4000-8000-000000000001",email:"Private Lekha owner"};
export const cookieName="lekha_session";
const secret=()=>process.env.LEKHA_OWNER_PASSWORD||"";
export function configured(){return secret().length>=16&&!!process.env.BLOB_READ_WRITE_TOKEN}
function sign(value:string){return createHmac("sha256",secret()).update(value).digest("hex")}
export function validPassword(value:unknown){return configured()&&typeof value==="string"&&timingSafeEqual(Buffer.from(sign(value)),Buffer.from(sign(secret())))}
export function session(){const value=String(Date.now()+12*3600000)+"."+randomUUID();return value+"."+sign(value)}
export function authorized(req:NextRequest){if(!configured())return false;const token=req.cookies.get(cookieName)?.value||"";const p=token.split(".");if(p.length!==3||Number(p[0])<=Date.now()||!Number.isFinite(Number(p[0])))return false;const sig=sign(p.slice(0,2).join("."));return p[2].length===sig.length&&timingSafeEqual(Buffer.from(p[2]),Buffer.from(sig))}
export function sameOrigin(req:NextRequest){const o=req.headers.get("origin");return !!o&&o===new URL(req.url).origin}
export const tables=["transactions","invoices","documents","document_periods","commission_settlements","accounts"] as const;
export type RecordRow=Record<string,any>;
const key=(table:string)=>"private-ledger/v1/"+table+".json";
export async function readTable(table:string):Promise<{rows:RecordRow[],etag?:string}>{
 const r=await get(key(table),{access:"private",useCache:false});
 if(!r)return {rows:[]};if(r.statusCode!==200||!r.stream)throw new Error("Storage read unavailable");
 const rows=JSON.parse(await new Response(r.stream).text());if(!Array.isArray(rows))throw new Error("Invalid ledger data");return {rows,etag:r.blob.etag};
}
export async function mutate(table:string,fn:(rows:RecordRow[])=>RecordRow[]){
 for(let i=0;i<5;i++){const {rows,etag}=await readTable(table);const next=fn(rows);try{await put(key(table),JSON.stringify(next),{access:"private",addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{}),contentType:"application/json",cacheControlMaxAge:60});return}catch(e){if(i===4)throw e;await new Promise(r=>setTimeout(r,100*(i+1)))}}
}
export function validPath(path:unknown):path is string{return typeof path==="string"&&path.startsWith(owner.id+"/")&&path.length<400&&/^[a-zA-Z0-9_.\/-]+$/.test(path)&&!path.split("/").includes("..")}
export const objectPath=(p:string)=>"private-documents/"+p;
export {get,put,head,del};
