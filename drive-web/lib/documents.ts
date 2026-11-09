import "server-only";
import {Readable} from "node:stream";
import {google} from "googleapis";
import {encryptDocument,decryptDocument,safeMonth,type StoredDocument} from "./document-crypto";
export {MAX_DOCUMENT_BYTES,safeMonth,type StoredDocument} from "./document-crypto";
const PREFIX="lekha-doc-v1-";
type Drive=ReturnType<typeof google.drive>;
async function bytesFromDrive(drive:Drive,id:string):Promise<Buffer>{
 const response=await drive.files.get({fileId:id,alt:"media"},{responseType:"arraybuffer"});
 return Buffer.from(response.data as ArrayBuffer);
}
export async function saveDocument(drive:Drive,name:string,month:string,kind:string,buffer:Buffer):Promise<StoredDocument>{
 const packed=encryptDocument(name,month,kind,buffer);
 const response=await drive.files.create({
  requestBody:{name:packed.name,parents:["appDataFolder"],mimeType:"application/octet-stream"},
  media:{mimeType:"application/octet-stream",body:Readable.from(packed.body)},
  fields:"id,name"
 });
 if(!response.data.id)throw Error("Google Drive did not confirm upload");
 return packed.meta;
}
export async function listDocuments(drive:Drive,month:string):Promise<StoredDocument[]>{
 safeMonth(month);
 const docs:StoredDocument[]=[];let token:string|undefined,pages=0;
 do{
  if(++pages>10)throw Error("Too many documents to list in preview");
  const response=await drive.files.list({spaces:"appDataFolder",q:`name contains '${PREFIX}${month}-' and trashed = false`,fields:"nextPageToken,files(id,name,size)",pageSize:100,pageToken:token});
  for(const item of response.data.files??[]){
   if(!item.id||!item.name?.startsWith(PREFIX+month+"-"))continue;
   const {meta}=decryptDocument(await bytesFromDrive(drive,item.id));
   if(meta.month!==month)throw Error("Document month mismatch");
   docs.push(meta);
  }
  token=response.data.nextPageToken??undefined;
 }while(token);
 return docs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function getDocument(drive:Drive,month:string,documentId:string){
 safeMonth(month);
 if(!/^[0-9a-f-]{36}$/.test(documentId))throw Error("Invalid document ID");
 const expected=`${PREFIX}${month}-${documentId}.bin`;
 const response=await drive.files.list({spaces:"appDataFolder",q:`name = '${expected}' and trashed = false`,fields:"files(id,name)",pageSize:2});
 const found=(response.data.files??[]).find(x=>x.name===expected&&x.id);
 if(!found?.id)throw Error("Document not found in this month");
 const result=decryptDocument(await bytesFromDrive(drive,found.id));
 if(result.meta.id!==documentId||result.meta.month!==month)throw Error("Document ID mismatch");
 return result;
}
