import {get,put,head,del} from "@vercel/blob";
import type {NextRequest} from "next/server";
export const owner={id:"00000000-0000-4000-8000-000000000001",email:"Private Lekha owner"};
// Access is gated upstream by Vercel Authentication (All Deployments).
// Do not disable Deployment Protection or create public/shareable bypass links.
export function configured(){return process.env.VERCEL==="1"&&!!process.env.BLOB_READ_WRITE_TOKEN}
export function authorized(req:NextRequest){return configured()&&req.nextUrl.hostname==="lekha-online.vercel.app"}
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
