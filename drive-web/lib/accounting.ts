export type Kind="transaction"|"invoice"|"settlement";
export type BookEntity="personal"|"business";
export type RecordEntry={id:string;kind:Kind;month:string;createdAt:string;payload:Record<string,string|number|boolean|null>};
export type LedgerRow={
 id:string;month:string;date:string;kind:Kind;entity:BookEntity;account:string;party:string;description:string;
 amount:number;direction:"credit"|"debit";category:string;invoiceNo:string;gstin:string;gst:number;taxable:number;
 cgst:number;sgst:number;igst:number;tds:number;deductions:number;received:number;
 paymentStatus:"pending"|"partial"|"received";itcStatus:"review"|"matched"|"missing"|"ineligible";
 source:string;reviewed:boolean
};
export const INR=(v:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(v);
export function money(v:unknown):number {
 const x=typeof v==="number"?v:Number(String(v??0).replace(/[₹,\s]/g,""));
 return Number.isFinite(x)?Math.round(x*100)/100:0;
}
const str=(x:unknown)=>String(x??"").trim();
export function rowFromEntry(entry:RecordEntry):LedgerRow{
 const p=entry.payload;
 const kind=entry.kind;
 return {
  id:entry.id,month:entry.month,date:str(p.date)||entry.createdAt.slice(0,10),kind,
  entity:p.entity==="personal"?"personal":"business",
  account:str(p.account)||"Main account",party:str(p.party),description:str(p.description),
  amount:money(p.amount),direction:p.direction==="debit"?"debit":"credit",
  category:str(p.category)||"Uncategorised",invoiceNo:str(p.invoiceNo),gstin:str(p.gstin).toUpperCase(),
  taxable:money(p.taxable),cgst:money(p.cgst),sgst:money(p.sgst),igst:money(p.igst),
  gst:money(p.gst)||money(p.cgst)+money(p.sgst)+money(p.igst),tds:money(p.tds),
  deductions:money(p.deductions),received:money(p.received),
  paymentStatus:p.paymentStatus==="received"?"received":p.paymentStatus==="partial"?"partial":"pending",
  itcStatus:p.itcStatus==="matched"?"matched":p.itcStatus==="missing"?"missing":p.itcStatus==="ineligible"?"ineligible":"review",
  source:str(p.source),reviewed:p.reviewed===true
 };
}
export type Metrics={
 income:number;expense:number;net:number;sales:number;purchases:number;outputGst:number;itcMatched:number;itcPending:number;
 salesDue:number;commissionShortfall:number;uncategorised:number;pendingInvoices:number;missingItc:number;
};
const sum=(rows:LedgerRow[],fn:(row:LedgerRow)=>number)=>money(rows.reduce((a,r)=>a+fn(r),0));
export function metrics(rows:LedgerRow[]):Metrics {
 const tx=rows.filter(r=>r.kind==="transaction"&&!["Internal transfer","Card settlement","Investment","Loan principal"].includes(r.category));
 const sales=rows.filter(r=>r.kind==="invoice"&&r.direction==="credit");
 const purchases=rows.filter(r=>r.kind==="invoice"&&r.direction==="debit");
 const settlements=rows.filter(r=>r.kind==="settlement");
 const income=sum(tx,r=>r.direction==="credit"?r.amount:0),expense=sum(tx,r=>r.direction==="debit"?r.amount:0);
 return {
  income,expense,net:money(income-expense),
  sales:sum(sales,r=>r.amount),purchases:sum(purchases,r=>r.amount),
  outputGst:sum(sales,r=>r.gst),itcMatched:sum(purchases,r=>r.itcStatus==="matched"?r.gst:0),
  itcPending:sum(purchases,r=>r.itcStatus!=="matched"&&r.itcStatus!=="ineligible"?r.gst:0),
  salesDue:sum(sales,r=>Math.max(0,r.amount-r.received)),
  commissionShortfall:sum(settlements,r=>r.amount+r.gst-r.tds-r.deductions-r.received),
  uncategorised:tx.filter(r=>r.category==="Uncategorised"||!r.reviewed).length,
  pendingInvoices:sales.filter(r=>r.received<r.amount).length,
  missingItc:purchases.filter(r=>r.itcStatus==="missing"||r.itcStatus==="review").length
 };
}
export function exceptions(rows:LedgerRow[]){
 return rows.flatMap(r=>{
  const msgs:string[]=[];
  if(r.kind==="transaction"&&(!r.reviewed||r.category==="Uncategorised"))msgs.push("Unreviewed / uncategorised transaction");
  if(r.kind==="invoice"&&r.direction==="credit"&&r.received<r.amount)msgs.push("Sales invoice outstanding");
  if(r.kind==="invoice"&&r.direction==="debit"&&r.itcStatus!=="matched")msgs.push("Purchase ITC not matched");
  if(r.kind==="settlement"&&Math.abs(r.amount+r.gst-r.tds-r.deductions-r.received)>=1)msgs.push("Commission net payout mismatch");
  return msgs.map(reason=>({row:r,reason}));
 });
}
export function gstAmount(r:Pick<LedgerRow,"cgst"|"sgst"|"igst"|"gst">):number {
 return money(r.cgst+r.sgst+r.igst||r.gst);
}
export function validationErrors(p:Record<string,string|number|boolean|null>,kind:Kind):string[]{
 const errors:string[]=[];
 if(!/^\d{4}-\d{2}-\d{2}$/.test(str(p.date)))errors.push("Choose a date");
 if(!str(p.party))errors.push("Enter party / account");
 if(money(p.amount)<=0)errors.push("Amount must be greater than 0");
 if(kind==="invoice"){
  if(!str(p.invoiceNo))errors.push("Invoice number is required");
  if(money(p.gst)<0||money(p.cgst)<0||money(p.sgst)<0||money(p.igst)<0)errors.push("Tax amounts cannot be negative");
  if(money(p.received)>money(p.amount))errors.push("Received amount exceeds invoice total");
 }
 if(kind==="settlement"&&money(p.received)<0)errors.push("Received amount cannot be negative");
 return errors;
}
export function demoEntries(month:string):RecordEntry[]{
 const pairs:{kind:Kind;payload:Record<string,string|number|boolean|null>}[]=[
 {kind:"transaction",payload:{date:month+"-02",entity:"business",account:"Business Bank",party:"ABC Insurance",description:"Commission receipt",amount:17270,direction:"credit",category:"Commission income",reviewed:true,source:"Demo bank statement"}},
 {kind:"transaction",payload:{date:month+"-04",entity:"business",account:"Business Bank",party:"Office services",description:"Internet expenses",amount:1299,direction:"debit",category:"Utilities",reviewed:true,source:"Demo bank statement"}},
 {kind:"transaction",payload:{date:month+"-08",entity:"personal",account:"Personal UPI",party:"Local Shop",description:"UPI shopping",amount:580,direction:"debit",category:"Uncategorised",reviewed:false,source:"Demo UPI"}},
 {kind:"invoice",payload:{date:month+"-03",entity:"business",account:"Sales",party:"ABC Insurance",description:"Commission invoice",amount:18880,direction:"credit",taxable:16000,cgst:1440,sgst:1440,igst:0,gst:2880,received:17270,invoiceNo:"DEMO-S-001",gstin:"24AAAAA0000A1Z0",paymentStatus:"partial"}},
 {kind:"invoice",payload:{date:month+"-06",entity:"business",account:"Purchases",party:"Office Supplier",description:"Stationery purchase",amount:2360,direction:"debit",taxable:2000,cgst:180,sgst:180,gst:360,received:0,invoiceNo:"DEMO-P-002",gstin:"24BBBBB0000B1Z0",itcStatus:"review"}},
 {kind:"invoice",payload:{date:month+"-09",entity:"business",account:"Purchases",party:"Software Vendor",description:"Software subscription",amount:1180,direction:"debit",taxable:1000,igst:180,gst:180,invoiceNo:"DEMO-P-003",gstin:"27CCCCC0000C1Z0",itcStatus:"matched"}},
 {kind:"settlement",payload:{date:month+"-11",entity:"business",account:"Commission",party:"ABC Insurance",description:"Monthly commission settlement",amount:16000,direction:"credit",gst:2880,tds:1600,deductions:0,received:17270,invoiceNo:"DEMO-S-001"}}
 ];
 return pairs.map((r,i)=>({id:"demo-"+i,kind:r.kind,month,createdAt:month+"-15T00:00:00Z",payload:r.payload}));
}
