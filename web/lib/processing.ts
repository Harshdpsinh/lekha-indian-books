import Papa from "papaparse";
import ExcelJS from "exceljs";
import { paisa } from "./types";

export type ImportRow = {
  txn_date: string; description: string; amount_paise: number;
  direction: "credit"|"debit"; reference: string|null;
};

function normalizeDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0,10);
  if (typeof value === "number" && value > 20000 && value < 80000) {
    return new Date(Date.UTC(1899,11,30) + value*86400000).toISOString().slice(0,10);
  }
  const text=String(value??"").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (match) {
    const y=+match[3]<100?2000+(+match[3]):+match[3];
    const iso=`${y}-${match[2].padStart(2,"0")}-${match[1].padStart(2,"0")}`;
    const d=new Date(iso); if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===iso) return iso;
  }
  throw new Error("Unrecognized date format: "+text);
}
function pick(obj:Record<string,unknown>, aliases:string[]):unknown {
  for (const alias of aliases) { const k=Object.keys(obj).find(k=>k.toLowerCase().replace(/[^a-z0-9]/g,"")===alias); if (k) return obj[k]; }
  return undefined;
}
function mapStatementRows(rows:Record<string,unknown>[]): {rows:ImportRow[],issues:string[]} {
  const result:ImportRow[]=[]; const issues:string[]=[];
  for (let i=0;i<rows.length;i++) {
    const r=rows[i];
    if (Object.values(r).every(v=>v==null||String(v).trim()==="")) continue;
    try {
      const date=pick(r,["date","transactiondate","txndate","valuedate","postingdate"]);
      const desc=pick(r,["description","narration","particulars","transactiondetails","details","merchant","remarks"]);
      const debit=pick(r,["debit","withdrawal","withdrawalamount","debitamount","dr"]);
      const credit=pick(r,["credit","deposit","depositamount","creditamount","cr"]);
      const amount=pick(r,["amount","transactionamount","txnamount"]);
      const ref=pick(r,["reference","referenceno","refno","transactionid","utr","chequeno"]);
      const type=String(pick(r,["type","direction","drcr","transactiontype"])??"").toLowerCase();
      const cr=paisa(credit),dr=paisa(debit);
      const signed=Number(String(amount??"0").replace(/[,₹\s]/g,""));
      const direction: "credit"|"debit" = cr>0?"credit":dr>0?"debit": type.includes("cr")||type.includes("credit")?"credit": type.includes("dr")||type.includes("debit")?"debit":signed<0?"debit":"debit";
      const value=cr||dr||Math.abs(paisa(amount));
      if (!date || !desc || value<=0) { issues.push("Row "+(i+2)+": missing date, description or amount"); continue; }
      result.push({txn_date:normalizeDate(date),description:String(desc).trim(),amount_paise:value,direction,reference:ref?String(ref).trim():null});
    } catch(e){issues.push("Row "+(i+2)+": "+(e instanceof Error?e.message:"Invalid data"));}
  }
  return {rows:result,issues};
}
export async function parseStatement(file:File): Promise<{rows:ImportRow[],issues:string[]}> {
  const lower=file.name.toLowerCase();
  if (lower.endsWith(".csv")) {
    const parsed=Papa.parse<Record<string,unknown>>(await file.text(),{header:true,skipEmptyLines:true});
    if (parsed.errors.length) throw new Error("CSV parsing errors: "+parsed.errors.slice(0,2).map(e=>e.message).join("; "));
    return mapStatementRows(parsed.data);
  }
  if (lower.endsWith(".xlsx")) {
    const book=new ExcelJS.Workbook();
    await book.xlsx.load(new Uint8Array(await file.arrayBuffer()) as never);
    const sheet=book.worksheets[0]; if (!sheet) throw new Error("No worksheet found");
    const header=sheet.getRow(1).values as unknown[];
    const result:Record<string,unknown>[]=[];
    sheet.eachRow((row,index)=>{
      if(index===1)return;
      const entry:Record<string,unknown>={};
      for(let c=1;c<=sheet.columnCount;c++) {
        const cell=row.getCell(c).value;
        const actual=cell&&typeof cell==="object"&&"result" in cell ? (cell as {result:unknown}).result:cell;
        entry[String(header[c]??"Column "+c)]=actual as unknown;
      }
      result.push(entry);
    });
    return mapStatementRows(result);
  }
  throw new Error("Automatic parsing currently supports CSV and XLSX. PDF is uploaded securely and marked for review.");
}
export async function fingerprint(row:ImportRow,account:string):Promise<string> {
  const raw=[account.trim().toLowerCase(),row.txn_date,row.description.toLowerCase().replace(/\s+/g," ").trim(),row.amount_paise,row.direction,row.reference?.toLowerCase().trim()??""].join("|");
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
// Caution: without unique bank reference, exact same-day transactions may collide.
// Such cases require account-specific statement IDs or manual review before production.
