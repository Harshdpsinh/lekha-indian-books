"use client";
import { useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import type { Invoice } from "@/lib/types";
import {paisa,money} from "@/lib/types";

type Row=Record<string,unknown>;
const clean=(s:unknown)=>String(s??"").toUpperCase().replace(/[^A-Z0-9]/g,"");
function pick(r:Row,names:string[]):unknown{
 for(const n of names){const key=Object.keys(r).find(x=>x.toLowerCase().replace(/[^a-z0-9]/g,"")===n);if(key)return r[key]}
 return undefined;
}
async function read(file:File):Promise<Row[]>{
 if(file.name.toLowerCase().endsWith(".csv")){
  const result=Papa.parse<Row>(await file.text(),{header:true,skipEmptyLines:true});
  if(result.errors.length)throw new Error(result.errors[0].message);
  return result.data;
 }
 const b=new ExcelJS.Workbook();
 await b.xlsx.load(new Uint8Array(await file.arrayBuffer()) as never);
 const sheet=b.worksheets[0];if(!sheet)throw new Error("No worksheet found");
 const headers=sheet.getRow(1).values as unknown[];
 const rows:Row[]=[];
 sheet.eachRow((r,index)=>{if(index===1)return;const row:Row={};for(let c=1;c<=sheet.columnCount;c++){const cell=r.getCell(c).value;row[String(headers[c]??"Column "+c)]=cell&&typeof cell==="object"&&"result" in cell?(cell as {result:unknown}).result:cell}rows.push(row)});
 return rows;
}
export default function Gstr2bMatcher({client,user,month,invoices,refresh}:{client:SupabaseClient;user:User;month:string;invoices:Invoice[];refresh:()=>Promise<void>}){
 const [busy,setBusy]=useState(false);
 const [summary,setSummary]=useState("");
 const [details,setDetails]=useState<string[]>([]);
 async function submit(file:File){
  setBusy(true);setSummary("");setDetails([]);
  try{
   if(!/\.(csv|xlsx)$/i.test(file.name))throw new Error("Only .csv and .xlsx formats are supported");
   if(file.size>10*1024*1024)throw new Error("Maximum 10 MB per file");
   const raw=await read(file);
   const keys=new Set<string>();let valid=0;
   const index=new Map<string,{gst:number,invoice:string}>();
   const warnings:string[]=[];
   for(let i=0;i<raw.length;i++){
    const r=raw[i];
    const gstin=clean(pick(r,["gstin","gstinofsupplier","suppliergstin","gstinofuploader"]));
    const inv=clean(pick(r,["invoicenumber","invoiceno","invno","invoicenoordebitnoteno"]));
    if(!gstin||!inv){warnings.push("Row "+(i+2)+": missing GSTIN / invoice number");continue}
    const igst=paisa(pick(r,["integratedtax","igst","integratedtaxamount"]));
    const cgst=paisa(pick(r,["centraltax","cgst","centraltaxamount"]));
    const sgst=paisa(pick(r,["stateuttax","statetax","sgst","statetaxamount"]));
    const key=gstin+"|"+inv;
    if(keys.has(key)){warnings.push("Duplicate GSTR-2B invoice "+key);continue}
    keys.add(key);valid++;index.set(key,{gst:igst+cgst+sgst,invoice:inv});
   }
   if(valid===0)throw new Error("No valid GSTIN/invoice rows. Check that the first row contains column headers.");
   const purchases=invoices.filter(i=>i.kind==="purchase"&&i.invoice_date.startsWith(month));
   let matched=0,mismatched=0,notFound=0;const updateIds:string[]=[];
   for(const invoice of purchases){
    const key=clean(invoice.gstin)+"|"+clean(invoice.invoice_no);
    const actual=index.get(key);
    if(!actual){notFound++;continue}
    const expected=invoice.igst_paise+invoice.cgst_paise+invoice.sgst_paise;
    if(Math.abs(actual.gst-expected)>100){mismatched++;warnings.push(invoice.invoice_no+": GST amount differs, ledger "+money(expected)+" vs 2B "+money(actual.gst));continue}
    matched++;updateIds.push(invoice.id);
   }
   // This changes only exact matches and never marks missing invoices automatically.
   if(updateIds.length){
    const {error}=await client.from("invoices").update({itc_status:"matched-2b"}).in("id",updateIds);
    if(error)throw new Error(error.message);
   }
   const storagePath=`${user.id}/${month}/gstr2b-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
   const storage=await client.storage.from("lekha-documents").upload(storagePath,file,{upsert:false});
   if(storage.error)throw new Error("Matched statuses updated but failed to save source file: "+storage.error.message);
   const {error:docError}=await client.from("documents").insert({user_id:user.id,storage_path:storagePath,name:file.name,month,kind:"gst_invoice",size_bytes:file.size,status:"needs-review",error:"Uploaded GSTR-2B matching: requires accountant review and GST portal verification"});
   if(docError)warnings.push("Document index not recorded: "+docError.message);
   await refresh();
   setSummary(`Uploaded 2B rows: ${valid}. Purchase invoices matched: ${matched}. Tax mismatch: ${mismatched}. Missing from uploaded file: ${notFound}. These are file-level matches, NOT GST portal verification.`);
   setDetails(warnings.slice(0,15));
  }catch(e){setSummary("Could not match 2B file: "+String(e))}finally{setBusy(false)}
 }
 return <div className="card"><h3 className="sectionTitle">GSTR-2B purchase ITC matching</h3><p className="muted">Upload an exported GSTR-2B CSV/XLSX with GSTIN, invoice number, IGST, CGST and SGST columns. Invoice-wise matches are based on GSTIN, invoice number and tax amount. Confirm with your CA before claiming ITC.</p><input type="file" accept=".csv,.xlsx" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void submit(f);e.target.value=""}}/><p className="mini">Only exact matches update status. Missing/mismatched rows remain unresolved. We do not access or verify the GST portal automatically.</p>{summary&&<div className="notice">{summary}</div>}{details.length>0&&<div className="tablewrap scroll">{details.map((d,i)=><p className="hint" key={i}>{d}</p>)}</div>}</div>;
}
