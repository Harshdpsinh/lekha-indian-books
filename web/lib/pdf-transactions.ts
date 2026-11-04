import type { ImportRow } from "./processing";
export type PdfResult={rows:ImportRow[];issues:string[];format:string};
function iso(raw:string):string|null {
 const m=raw.match(/^(\d{2})[/-](\d{2})[/-](\d{2}|\d{4})$/);
 if(!m)return null;
 const year=m[3].length===2?2000+Number(m[3]):Number(m[3]);
 const d=`${year}-${m[2]}-${m[1]}`;
 const date=new Date(d);
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===d?d:null;
}
const MONEY=/\s+([\d,]+\.\d{2})\s*$/;
function takeNumber(text:string){const m=text.match(MONEY);return m?{rest:text.slice(0,m.index).trim(),num:Math.round(Number(m[1].replace(/,/g,""))*100)}:null}
export function parsePdfLines(lines:string[],kind:"bank"|"credit_card"|"upi"):PdfResult{
 const all=lines.map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
 const intro=all.slice(0,100).join(" ").toLowerCase();
 const bank=/(debit|withdrawal)/.test(intro)&&/(credit|deposit)/.test(intro)&&/balance/.test(intro);
 const card=kind==="credit_card"&&/(statement|card|transaction)/.test(intro);
 if(!bank&&!card)return {rows:[],issues:["Unrecognized PDF transaction columns; no rows imported."],format:"unrecognized"};
 const rows:ImportRow[]=[],issues:string[]=[];let skipped=0;
 for(let i=0;i<all.length;i++){
  const m=all[i].match(/^(\d{2}[/-]\d{2}[/-](?:\d{2}|\d{4}))\s+(.+)$/);
  if(!m)continue;
  const date=iso(m[1]);if(!date){skipped++;continue}
  const parts=[] as number[];let rest=m[2];
  for(let n=0;n<(bank?3:1);n++){const x=takeNumber(rest);if(!x)break;rest=x.rest;parts.unshift(x.num)}
  if(!rest||/^(opening|closing|balance|total)/i.test(rest))continue;
  if(bank&&parts.length===3){
   const [debit,credit]=parts;
   if((debit>0)===(credit>0)){skipped++;continue}
   rows.push({txn_date:date,description:rest,amount_paise:debit||credit,direction:credit>0?"credit":"debit",reference:null});
  }else if(card&&parts.length===1&&parts[0]>0){
   rows.push({txn_date:date,description:rest,amount_paise:parts[0],direction:"debit",reference:null});
  }else skipped++;
 }
 if(skipped)issues.push(skipped+" dated rows could not be safely interpreted.");
 if(bank&&rows.length)issues.push("Assumed debit/credit/balance column order: verify against original before using.");
 if(!rows.length)issues.push("No validated transaction rows detected. Scanned PDFs require OCR.");
 return {rows,issues,format:bank?"bank-three-column":"credit-card"};
}
export async function parsePdf(file:File,kind:"bank"|"credit_card"|"upi",password?:string):Promise<PdfResult>{
 const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
 pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
 const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),password:password||undefined});
 let pdf:Awaited<typeof task.promise>;
 try{pdf=await task.promise}catch(e){if(e instanceof pdfjs.PasswordException)throw new Error("PASSWORD_REQUIRED: Enter PDF password and retry.");throw e}
 if(pdf.numPages>60)throw new Error("PDF exceeds 60-page limit.");
 const lines:string[]=[];
 try{
  for(let p=1;p<=pdf.numPages;p++){
   const page=await pdf.getPage(p), text=await page.getTextContent();
   const ylines=new Map<number,{x:number,s:string}[]>();
   for(const item of text.items){if(!("str" in item)||!item.str.trim())continue;const y=Math.round(item.transform[5]/3)*3;const arr=ylines.get(y)??[];arr.push({x:item.transform[4],s:item.str.trim()});ylines.set(y,arr)}
   for(const [,row] of [...ylines].sort((a,b)=>b[0]-a[0]))lines.push(row.sort((a,b)=>a.x-b.x).map(i=>i.s).join(" "));
  }
 }finally{await pdf.destroy()}
 return parsePdfLines(lines,kind);
}
