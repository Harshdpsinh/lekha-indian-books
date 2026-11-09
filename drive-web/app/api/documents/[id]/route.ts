import {NextRequest,NextResponse} from "next/server";
import {driveForRequest} from "@/lib/drive";
import {getDocument,safeMonth} from "@/lib/documents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest,context:{params:Promise<{id:string}>}){
 try{
  const drive=await driveForRequest(req);
  const {id}=await context.params;
  const month=safeMonth(req.nextUrl.searchParams.get("month")??"");
  const {meta,content}=await getDocument(drive,month,id);
  const name=meta.name.replace(/["\r\n]/g,"_");
  return new NextResponse(new Uint8Array(content),{
   headers:{
    "Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="${name}"`,
    "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Length":String(content.length)
   }
  });
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:"Could not download document"},{status:400,headers:{"Cache-Control":"no-store"}});
 }
}
