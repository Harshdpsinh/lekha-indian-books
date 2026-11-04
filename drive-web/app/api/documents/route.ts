import {NextRequest,NextResponse} from "next/server";
import {driveForRequest} from "@/lib/drive";
import {listDocuments,saveDocument,MAX_DOCUMENT_BYTES,safeMonth} from "@/lib/documents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const fail=(status:number,message:string)=>NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store"}});
export async function GET(req:NextRequest){
 try{
  const drive=await driveForRequest(req);
  const month=safeMonth(req.nextUrl.searchParams.get("month")??"");
  return NextResponse.json({documents:await listDocuments(drive,month)},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return fail(400,e instanceof Error?e.message:"Unable to list documents")}
}
export async function POST(req:NextRequest){
 const declaredLength=Number(req.headers.get("content-length")??0);
 if(declaredLength>MAX_DOCUMENT_BYTES+200_000)return fail(413,"Maximum 2 MB per uploaded document");
 try{
  const drive=await driveForRequest(req); // auth BEFORE parsing multipart
  const form=await req.formData();
  const file=form.get("file"),month=safeMonth(String(form.get("month")??"")),kind=String(form.get("kind")??"");
  if(!(file instanceof File))return fail(400,"Document is missing");
  if(file.size===0||file.size>MAX_DOCUMENT_BYTES)return fail(413,"File must be between 1 byte and 2 MB");
  const bytes=Buffer.from(await file.arrayBuffer());
  const doc=await saveDocument(drive,file.name,month,kind,bytes);
  return NextResponse.json({document:doc},{status:201,headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return fail(400,e instanceof Error?e.message:"Unable to store document")}
}
