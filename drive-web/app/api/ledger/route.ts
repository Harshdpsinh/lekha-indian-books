import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {appendEntry,driveForRequest,listEntries,makeEntry} from "@/lib/drive";
export const runtime="nodejs";
const Month=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const Entry=z.object({
 kind:z.enum(["transaction","invoice","settlement"]),month:Month,
 payload:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()]))
});
export async function GET(req:NextRequest){
 try{
  const month=Month.parse(req.nextUrl.searchParams.get("month"));
  const drive=await driveForRequest(req);
  return NextResponse.json({entries:await listEntries(drive,month)},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to read ledger"},{status:400})}
}
export async function POST(req:NextRequest){
 try{
  const contentLength=Number(req.headers.get("content-length")||0);
  if(contentLength>20_000)return NextResponse.json({error:"Record too large"},{status:413});
  const parsed=Entry.parse(await req.json());
  const drive=await driveForRequest(req);
  const entry=makeEntry(parsed.kind,parsed.month,parsed.payload);
  await appendEntry(drive,entry);
  return NextResponse.json({entry},{status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Unable to save record"},{status:400})}
}
