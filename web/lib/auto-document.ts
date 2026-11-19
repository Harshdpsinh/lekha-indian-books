// Conservative identification: never guess the owner/book from an institution alone.
export function identifyDocument(name:string,text:string){
 const source=(name+"\n"+text).toLowerCase();
 const kind=/gstr[\s_-]*2b/.test(source)?"gst_invoice":/tax invoice|gst invoice|invoice no\b|invoice number/.test(source)?"invoice":/credit[\s_-]*card|card statement/.test(source)?"credit_card":/account statement|bank statement|withdrawal|deposit|debit amount|credit amount/.test(source)?"bank":/upi statement|upi transaction history/.test(source)?"upi":"other";
 const bank=[["hdfc","HDFC"],["icici","ICICI"],["axis","Axis"],["state bank|\\bsbi\\b","SBI"],["idfc","IDFC FIRST"],["federal","Federal"],["kotak","Kotak"],["bank of baroda","Bank of Baroda"],["bank of maharashtra","Bank of Maharashtra"],["indusind","IndusInd"],["yes bank","YES Bank"],["punjab national|\\bpnb\\b","PNB"],["canara","Canara"],["union bank","Union Bank"],["american express|amex","Amex"]].find(([p])=>new RegExp(p,"i").test(source))?.[1];
 const m=text.match(/(?:account\s*(?:number|no\.?|#)|(?:credit\s*)?card\s*(?:number|no\.?|#))\s*[:\s]*([\dXx*][\dXx*\s-]{3,25})(?=\s|$)/i);
 const digits=m?.[1]?.replace(/\D/g,"")||"";
 const account=bank&&digits.length>=4?bank+" • "+digits.slice(-4):null;
 const business=/\b(?:business|current) account\b|\bgohil (?:insurance|investments)\b/i.test(text);
 const personal=/\bpersonal account\b|\bsavings account\b/i.test(text);
 return {kind,account,entity:business&&!personal?"business":personal&&!business?"personal":"unassigned"} as const;
}
export async function tabularPreview(file:File){
 if(file.name.toLowerCase().endsWith(".csv"))return (await file.slice(0,8192).text());
 const {default:ExcelJS}=await import("exceljs");const book=new ExcelJS.Workbook();await book.xlsx.load(new Uint8Array(await file.arrayBuffer()) as never);
 return book.worksheets.slice(0,2).map(s=>Array.from({length:Math.min(20,s.rowCount)},(_,i)=>String(s.getRow(i+1).values)).join("\n")).join("\n");
}
