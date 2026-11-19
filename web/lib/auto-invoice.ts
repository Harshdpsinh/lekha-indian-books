import {paisa} from "./types";
type ParsedInvoice={kind:"sale"|"purchase";invoice_no:string;invoice_date:string;party:string;gstin:string|null;taxable_paise:number;cgst_paise:number;sgst_paise:number;igst_paise:number;total_paise:number;commission:boolean};
function validDate(t:string){const m=t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);const s=m?m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0"):t;if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(s);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s?s:null}
export function extractLabeledInvoice(text:string):ParsedInvoice|null{
 const lines=text.split(/\n/).map(x=>x.trim()).filter(Boolean);
 const field=(pattern:RegExp)=>{for(const l of lines){const m=l.match(pattern);if(m)return m[1].trim()}return ""};
 const sale=/\b(?:sales invoice|outward invoice)\b/i.test(text),purchase=/\b(?:purchase invoice|inward invoice)\b/i.test(text);
 const supplier=field(/^(?:supplier|seller|issued by)\s*[:\-]\s*(.+)$/i);
 const customer=field(/^(?:customer|buyer|bill to|recipient)\s*[:\-]\s*(.+)$/i);
 const own=(s:string)=>/\bgohil\s+(?:insurance|investments?)\b/i.test(s);
 const kind=sale&&!purchase?"sale":purchase&&!sale?"purchase":own(supplier)&&!own(customer)&&customer?"sale":own(customer)&&!own(supplier)&&supplier?"purchase":null;
 if(!kind)return null;
 const party=field(/^(?:amc|payer|counterparty)\s*[:\-]\s*(.+)$/i)||(kind==="sale"?customer:supplier);
 const invoiceNo=field(/^invoice\s*(?:number|no\.?|#)\s*[:\-]\s*([a-z0-9\/._-]+)$/i);
 const date=validDate(field(/^invoice\s*date\s*[:\-]\s*([\d.\/-]+)$/i));
 const amount=(pattern:RegExp)=>{const s=field(pattern);return s&&/^[₹\d,.\s]+$/.test(s)?paisa(s):null};
 const taxable=amount(/^taxable\s*(?:value|amount)\s*[:\-]\s*(.+)$/i);
 const cgst=amount(/^cgst(?:\s*amount)?\s*[:\-]\s*(.+)$/i),sgst=amount(/^sgst(?:\s*amount)?\s*[:\-]\s*(.+)$/i),igst=amount(/^igst(?:\s*amount)?\s*[:\-]\s*(.+)$/i);
 const total=amount(/^(?:grand total|invoice total|total invoice value)\s*[:\-]\s*(.+)$/i);
 if(!party||!invoiceNo||!date||taxable===null||total===null||[cgst,sgst,igst].every(x=>x===null))return null;
 if([taxable,total,cgst??0,sgst??0,igst??0].some(x=>!Number.isSafeInteger(x)||x<0))return null;
 if(Math.abs(taxable+(cgst??0)+(sgst??0)+(igst??0)-total)>1)return null;
 const gstin=field(/^(?:counterparty|customer|supplier|payer)\s*gstin\s*[:\-]\s*([A-Z0-9]{15})$/i);
 // Do not infer a separate GST claim unless this is explicitly a commission/brokerage reimbursement invoice.
 const commission=kind==="sale"&&/\b(?:brokerage|commission)\b/i.test(text);
 return {kind,invoice_no:invoiceNo,invoice_date:date,party,gstin:gstin||null,taxable_paise:taxable,cgst_paise:cgst??0,sgst_paise:sgst??0,igst_paise:igst??0,total_paise:total,commission};
}
type Settlement={id:string;invoice_no:string;payer:string;gst_due_paise?:number;gst_received_paise?:number;invoice_date?:string;invoice_sent_date?:string;gst_bank_transaction_id?:string};
type Tx={id:string;txn_date:string;description:string;reference:string|null;direction:string;amount_paise:number;category:string};
export function findGstMatches(settlements:Settlement[],transactions:Tx[]){
 const used=new Set(settlements.map(s=>s.gst_bank_transaction_id).filter(Boolean));
 const candidates:{settlementId:string;transaction:Tx}[]=[];
 for(const s of settlements){
  if(!s.gst_due_paise||s.gst_received_paise||s.gst_bank_transaction_id)continue;
  const inv=s.invoice_no.trim().toUpperCase();if(inv.length<5)continue;
  const start=s.invoice_sent_date||s.invoice_date;if(!start)continue;
  const eligible=transactions.filter(t=>{
   if(used.has(t.id)||t.direction!=="credit"||t.amount_paise!==s.gst_due_paise||t.txn_date<start)return false;
   const desc=(t.description+" "+(t.reference||"")).toUpperCase();
   const tokens=desc.split(/\s+/);
   return tokens.includes(inv)&&/\bGST\b/.test(desc);
  });
  if(eligible.length===1)candidates.push({settlementId:s.id,transaction:eligible[0]});
 }
 return candidates.filter(c=>candidates.filter(x=>x.transaction.id===c.transaction.id).length===1);
}
