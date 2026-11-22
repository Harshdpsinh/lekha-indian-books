import {NextRequest,NextResponse} from "next/server";
import {createHash,createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {authorized,sameOrigin,mutate,readTable,owner} from "@/lib/ledger-server";
export const runtime="nodejs";export const dynamic="force-dynamic";
const table="pdf_password_vault";
function key(){return createHash("sha256").update("lekha-pdf-vault-v1:").update(process.env.LEKHA_VAULT_KEY||process.env.BLOB_READ_WRITE_TOKEN||"").digest()}
function encrypt(p:string){const iv=randomBytes(12),c=createCipheriv("aes-256-gcm",key(),iv);return [iv,c.update(p,"utf8"),c.final(),c.getAuthTag()].map(b=>b.toString("base64")).join(".")}
function decrypt(p:string){const [iv,a,b,tag]=p.split(".").map(x=>Buffer.from(x,"base64"));const d=createDecipheriv("aes-256-gcm",key(),iv);d.setAuthTag(tag);return Buffer.concat([d.update(Buffer.concat([a,b])),d.final()]).toString("utf8")}
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req:NextRequest){
 if(!authorized(req)||!sameOrigin(req))return reply({error:"Unauthorized"},403);
 try{const q=await req.json();if(q.action==="list"){const {rows}=await readTable(table);return reply({passwords:rows.filter(r=>r.user_id===owner.id).map(r=>decrypt(r.encrypted))})}
 if(q.action==="save"){if(typeof q.password!=="string"||!q.password.length||q.password.length>256)return reply({error:"Invalid password"},400);await mutate(table,rows=>{if(rows.some(r=>decrypt(r.encrypted)===q.password))return rows;if(rows.length>=50)throw Error("Vault limit");return [...rows,{user_id:owner.id,encrypted:encrypt(q.password)}]});return reply({ok:true})}
 if(q.action==="clear"){await mutate(table,()=>[]);return reply({ok:true})}return reply({error:"Unknown operation"},400)
 }catch{return reply({error:"Password vault unavailable; retry or check storage configuration."},500)}
}
