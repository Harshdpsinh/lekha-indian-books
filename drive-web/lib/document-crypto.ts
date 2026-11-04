import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from "node:crypto";
const PREFIX="lekha-doc-v1-";
function documentKey():Buffer{const raw=process.env.LEKHA_ENCRYPTION_KEY;if(!raw)throw Error("Encryption key missing");const value=Buffer.from(raw,"base64");if(value.length!==32)throw Error("Encryption key must be 32 bytes");return value}
const MIME:Record<string,string>={pdf:"application/pdf",csv:"text/csv",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",xls:"application/vnd.ms-excel"};
export const MAX_DOCUMENT_BYTES=2*1024*1024; // Vercel Functions 4.5MB request limit; conservative.
export type StoredDocument={id:string;name:string;month:string;kind:string;size:number;sha256:string;createdAt:string;encrypted:true;status:"needs-review"};
const monthPattern=/^20\d{2}-(0[1-9]|1[0-2])$/;
export function safeMonth(m:string){if(!monthPattern.test(m))throw Error("Invalid accounting month");return m}
function supportedName(name:string){
 const clean=name.trim().replace(/[\\/\x00-\x1f]/g,"_").slice(0,140);
 const ext=clean.split(".").pop()?.toLowerCase()??"";
 if(!clean||!Object.hasOwn(MIME,ext))throw Error("Only PDF, CSV, XLS, XLSX documents are supported");
 return {clean,ext};
}
function checkSignature(ext:string,data:Buffer){
 if(ext==="pdf"&&data.subarray(0,5).toString("ascii")!=="%PDF-")throw Error("Invalid PDF file signature");
 if(ext==="xlsx"&&data.subarray(0,2).toString("ascii")!=="PK")throw Error("Invalid XLSX file signature");
 if(ext==="xls"&&!(data[0]===0xd0&&data[1]===0xcf&&data[2]===0x11&&data[3]===0xe0))throw Error("Invalid XLS file signature");
 if(ext==="csv"&&data.includes(0))throw Error("CSV appears to contain binary data");
}
export function encryptDocument(name:string,month:string,kind:string,content:Buffer):{id:string;name:string;body:Buffer;meta:StoredDocument}{
 safeMonth(month);
 const {clean,ext}=supportedName(name);
 if(content.length===0||content.length>MAX_DOCUMENT_BYTES)throw Error("File must be between 1 byte and 2 MB");
 checkSignature(ext,content);
 if(!/^(bank|credit_card|upi|sales|purchases|gst|registration|other)$/.test(kind))throw Error("Invalid document type");
 const id=randomUUID(),createdAt=new Date().toISOString();
 const meta:StoredDocument={id,name:clean,month,kind,size:content.length,sha256:createHash("sha256").update(content).digest("hex"),createdAt,encrypted:true,status:"needs-review"};
 const header=Buffer.from(JSON.stringify(meta),"utf8");
 if(header.length>8192)throw Error("Document metadata exceeds allowed size");
 const plain=Buffer.concat([Buffer.alloc(4),header,content]);
 plain.writeUInt32BE(header.length,0);
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",documentKey(),iv);
 const payload=Buffer.concat([cipher.update(plain),cipher.final()]);
 const body=Buffer.concat([Buffer.from("LKF1"),iv,cipher.getAuthTag(),payload]);
 return {id,name:`${PREFIX}${month}-${id}.bin`,body,meta};
}
export function decryptDocument(body:Buffer):{meta:StoredDocument;content:Buffer}{
 if(body.length<40||body.subarray(0,4).toString()!=="LKF1")throw Error("Unrecognized encrypted document");
 const decipher=createDecipheriv("aes-256-gcm",documentKey(),body.subarray(4,16));
 decipher.setAuthTag(body.subarray(16,32));
 const plain=Buffer.concat([decipher.update(body.subarray(32)),decipher.final()]);
 if(plain.length<4)throw Error("Corrupt encrypted document");
 const headerLen=plain.readUInt32BE(0);
 if(headerLen<10||headerLen>8192||plain.length<4+headerLen)throw Error("Invalid document header");
 const meta=JSON.parse(plain.subarray(4,4+headerLen).toString("utf8")) as StoredDocument;
 const content=plain.subarray(4+headerLen);
 if(content.length!==meta.size||createHash("sha256").update(content).digest("hex")!==meta.sha256)throw Error("Document integrity check failed");
 return {meta,content};
}
