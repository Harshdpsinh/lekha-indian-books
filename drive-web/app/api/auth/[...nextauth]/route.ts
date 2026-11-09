import {handler,driveSetupReady} from "@/lib/auth";
import {NextRequest,NextResponse} from "next/server";
function unavailable(){return NextResponse.json({error:"Google login is not configured on this development preview."},{status:503})}
export async function GET(req:NextRequest){if(!driveSetupReady())return unavailable();return handler(req,{} as never)}
export async function POST(req:NextRequest){if(!driveSetupReady())return unavailable();return handler(req,{} as never)}
