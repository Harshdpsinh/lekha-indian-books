import {google} from "googleapis";
import {getToken} from "next-auth/jwt";
import type {NextRequest} from "next/server";
import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {googleCredentials} from "./auth";
import {Readable} from "node:stream";
const FOLDER="appDataFolder";
export type Entry={id:string;kind:"transaction"|"invoice"|"settlement";month:string;createdAt:string;payload:Record<string,string|number|boolean|null>};
export function key():Buffer{const raw=process.env.LEKHA_ENCRYPTION_KEY;if(!raw)throw Error("Missing LEKHA_ENCRYPTION_KEY");const buf=Buffer.from(raw,"base64");if(buf.length!==32)throw Error("LEKHA_ENCRYPTION_KEY must be base64-encoded 32 bytes");return buf}
export function encrypt(data:unknown):Buffer{
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv);
 const plain=Buffer.from(JSON.stringify(data),"utf-8");const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);
 return Buffer.concat([Buffer.from("LKD1"),iv,cipher.getAuthTag(),ciphertext]);
}
export function decrypt(blob:Buffer):unknown{
 if(blob.subarray(0,4).toString()!=="LKD1")throw Error("Invalid Lekha encrypted record");
 const iv=blob.subarray(4,16),tag=blob.subarray(16,32);
 const decipher=createDecipheriv("aes-256-gcm",key(),iv);decipher.setAuthTag(tag);
 return JSON.parse(Buffer.concat([decipher.update(blob.subarray(32)),decipher.final()]).toString("utf-8"));
}
export async function driveForRequest(req:NextRequest){
 const token=await getToken({req,secret:process.env.NEXTAUTH_SECRET});
 if(!token||!token.googleRefreshToken)throw Error("Not authenticated with Google Drive");
 if(token.email?.toLowerCase()!==process.env.LEKHA_ALLOWED_EMAIL?.toLowerCase())throw Error("Not authorized");
 return google.drive({version:"v3",auth:googleCredentials(token)});
}
export async function listEntries(drive:ReturnType<typeof google.drive>,month:string):Promise<Entry[]>{
 const entries:Entry[]=[];let nextPageToken:string|undefined;let pages=0;
 do{
  if(++pages>30)throw Error("Too many Drive pages: close period or archive older records");
  const response=await drive.files.list({spaces:FOLDER,q:"name contains 'lekha-v1-' and trashed = false",fields:"nextPageToken,files(id,name,size)",pageSize:1000,pageToken:nextPageToken});
  for(const f of response.data.files??[]){
   if(!f.id||!f.name||!f.name.startsWith("lekha-v1-"))continue;
   if(month!=="all"&&!f.name.startsWith("lekha-v1-"+month+"-"))continue;
   const downloaded=await drive.files.get({fileId:f.id,alt:"media"},{responseType:"arraybuffer"});
   const data=downloaded.data as ArrayBuffer;
   const parsed=decrypt(Buffer.from(data)) as Entry;
   if(parsed.month!==month&&month!=="all")continue;
   entries.push(parsed);
  }
  nextPageToken=response.data.nextPageToken??undefined;
 }while(nextPageToken);
 return entries.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
}
export async function appendEntry(drive:ReturnType<typeof google.drive>,entry:Entry){
 const bytes=encrypt(entry);
 const name=`lekha-v1-${entry.month}-${entry.id}.bin`;
 await drive.files.create({requestBody:{name,parents:[FOLDER],mimeType:"application/octet-stream"},media:{mimeType:"application/octet-stream",body:Readable.from(bytes)},fields:"id"});
}
export function makeEntry(kind:Entry["kind"],month:string,payload:Entry["payload"]):Entry{
 return {id:crypto.randomUUID(),kind,month,createdAt:new Date().toISOString(),payload};
}
