import type { ImportRow } from "./processing";

export type PdfResult={rows:ImportRow[];issues:string[];format:string};
type Cell={x:number;s:string};
export type PositionedLine={y:number;cells:Cell[]};
const DATE=/^\d{1,2}[.\/-]\d{1,2}[.\/-](?:\d{2}|\d{4})$/;
function iso(raw:string):string|null {
 const m=raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2}|\d{4})$/);
 if(!m)return null;
 const yr=m[3].length===2?2000+Number(m[3]):Number(m[3]);
 const d=`${yr}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
 const date=new Date(d);
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===d?d:null;
}
function paise(text:string):number|null{
 const raw=text.trim().replace(/[₹,\s]/g,"");
 if(!raw||raw==="-"||raw==="--")return null;
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw))return null;
 const v=Math.round(Number(raw)*100);return Number.isSafeInteger(v)?v:null;
}
const TAIL=/\s+([\d,]+\.\d{2})\s*$/;
function tail(text:string){const m=text.match(TAIL);return m?{rest:text.slice(0,m.index).trim(),value:paise(m[1])}:null}
const isDate=(text:string)=>DATE.test(text.trim());
const join=(cells:Cell[])=>cells.map(c=>c.s).join(" ").replace(/\s+/g," ").trim();

/** Conservative parser for dated, single-line statement rows (no column geometry). */
export function parsePdfLines(lines:string[],kind:"bank"|"credit_card"|"upi"):PdfResult{
 const all=lines.map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
 const intro=all.slice(0,100).join(" ").toLowerCase();
 const bank=/(debit|withdrawal)/.test(intro)&&/(credit|deposit)/.test(intro)&&/balance/.test(intro);
 const card=kind==="credit_card"&&/(statement|card|transaction)/.test(intro);
 if(!bank&&!card)return {rows:[],issues:["Unrecognized PDF statement layout. No transactions imported."],format:"unrecognized"};
 const rows:ImportRow[]=[],issues:string[]=[];let skipped=0;
 for(const line of all){
  const m=line.match(/^(?:\d+\s+)?(\d{1,2}[.\/-]\d{1,2}[.\/-](?:\d{2}|\d{4}))\s+(.+)$/);
  if(!m)continue;
  const date=iso(m[1]);if(!date){skipped++;continue}
  const amounts:number[]=[];let rest=m[2];
  for(let n=0;n<(bank?3:1);n++){const x=tail(rest);if(!x||x.value===null)break;rest=x.rest;amounts.unshift(x.value)}
  if(!rest||/^(opening|closing|balance|total)/i.test(rest))continue;
  if(bank&&amounts.length===3){
   const [debit,credit]=amounts;
   if((debit>0)===(credit>0)){skipped++;continue}
   rows.push({txn_date:date,description:rest,amount_paise:debit||credit,direction:credit>0?"credit":"debit",reference:null});
  }else if(card&&amounts.length===1&&amounts[0]>0){
   rows.push({txn_date:date,description:rest,amount_paise:amounts[0],direction:"debit",reference:null});
  }else skipped++;
 }
 if(skipped)issues.push(skipped+" dated rows were ambiguous and skipped.");
 if(rows.length)issues.push("PDF table interpretation requires comparison against source statement balances.");
 if(!rows.length)issues.push("No safely recognized transactions. Scanned/image PDFs require OCR.");
 return {rows,issues,format:bank?"bank-three-column":"credit-card"};
}

function headerPosition(lines:PositionedLine[],terms:RegExp):number|null{
 const c=lines.flatMap(l=>l.cells).find(c=>terms.test(c.s.toLowerCase()));
 return c?c.x:null;
}

/** Structured bank statement parsing by PDF text x-coordinates.
 * It preserves direction only when explicit withdrawal/deposit columns can be found.
 * Any ambiguity is an exception requiring review, never a guessed transaction.
 */
export function parsePositionedBank(lines:PositionedLine[]):PdfResult{
 const withdrawal=headerPosition(lines,/^(withdrawal|debit)(\s|$)/i);
 const deposit=headerPosition(lines,/^(deposit|credit)(\s|$)/i);
 const balance=headerPosition(lines,/^(balance)(\s|$)/i);
 if(withdrawal===null||deposit===null||balance===null||!(withdrawal<deposit&&deposit<balance)){
  return {rows:[],issues:["Bank statement requires withdrawal, deposit and balance columns with text positions."],format:"unrecognized"};
 }
 const debitBoundary=(withdrawal+deposit)/2,creditBoundary=(deposit+balance)/2;
 const rows:ImportRow[]=[],issues:string[]=[];let dated=0,skipped=0;
 type Item={date:string;desc:string[];debit:number|null;credit:number|null;balance:number|null};
 let current:Item|null=null;
 const finish=()=>{
  if(!current)return;
  const d=current,description=d.desc.join(" ").replace(/\s+/g," ").trim();
  if(!description||/^(opening|closing|balance|total|b\/f|c\/f)\b/i.test(description)){current=null;return}
  const debit=d.debit??0,credit=d.credit??0;
  if((debit>0)===(credit>0)){skipped++;current=null;return}
  rows.push({txn_date:d.date,description,amount_paise:debit||credit,direction:credit>0?"credit":"debit",reference:null});
  current=null;
 };
 for(const line of lines){
  const ordered=[...line.cells].sort((a,b)=>a.x-b.x);
  const token=ordered.find(c=>isDate(c.s));
  if(token){
   finish();dated++;
   const date=iso(token.s);if(!date){skipped++;continue}
   current={date,desc:[],debit:null,credit:null,balance:null};
   for(const c of ordered){
    if(c.x<=token.x||isDate(c.s))continue;
    if(c.x<withdrawal-8){current.desc.push(c.s);continue}
    const value=paise(c.s);
    if(value===null)continue;
    if(c.x<debitBoundary)current.debit=value;
    else if(c.x<creditBoundary)current.credit=value;
    else current.balance=value;
   }
   continue;
  }
  if(!current)continue;
  // Some statements wrap narration on subsequent lines. Only collect positioned narration,
  // never column numbers/header fragments.
  for(const c of ordered){if(c.x>90&&c.x<withdrawal-8&&!/^(total|opening|closing|s no\.?|transaction remarks)$/i.test(c.s))current.desc.push(c.s)}
 }
 finish();
 if(dated>rows.length)issues.push((dated-rows.length)+" dated rows were skipped because withdrawal/deposit could not be distinguished.");
 if(skipped&&dated===rows.length)issues.push(skipped+" rows skipped.");
 if(rows.length)issues.push("Review PDF transaction directions and reconcile source opening/closing balance before finalising.");
 if(!rows.length)issues.push("No safely recognized bank transactions. Check statement headings or upload CSV/XLSX.");
 return {rows,issues,format:"bank-positioned-columns"};
}

export async function parsePdf(file:File,kind:"bank"|"credit_card"|"upi",password?:string):Promise<PdfResult>{
 const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
 pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),password:password||undefined});
 let pdf:Awaited<typeof task.promise>;
 try{pdf=await task.promise}catch(e){
  if(e instanceof Error&&(e.name==="PasswordException"||/password/i.test(e.message)))throw new Error("PASSWORD_REQUIRED: Enter the PDF password and retry.");
  throw e;
 }
 if(pdf.numPages>60){await pdf.destroy();throw new Error("PDF exceeds 60-page limit. Split statement into smaller files.")}
 const textLines:string[]=[],positioned:PositionedLine[]=[];
 try{
  for(let p=1;p<=pdf.numPages;p++){
   const page=await pdf.getPage(p),text=await page.getTextContent();
   const ylines=new Map<number,Cell[]>();
   for(const item of text.items){
    if(!("str" in item)||!item.str.trim())continue;
    const y=Math.round(item.transform[5]/3)*3;
    const arr=ylines.get(y)??[];
    arr.push({x:item.transform[4],s:item.str.trim()});ylines.set(y,arr);
   }
   for(const [y,cells] of [...ylines].sort((a,b)=>b[0]-a[0])){
    const sorted=cells.sort((a,b)=>a.x-b.x);
    textLines.push(join(sorted));positioned.push({y,cells:sorted});
   }
  }
 }finally{await pdf.destroy()}
 if(kind==="bank"||kind==="upi"){
  const result=parsePositionedBank(positioned);
  if(result.rows.length)return result;
  const plain=parsePdfLines(textLines,kind);
  if(plain.rows.length)return plain;
  return {rows:[],issues:[...result.issues,...plain.issues],format:"unrecognized"};
 }
 return parsePdfLines(textLines,kind);
}
