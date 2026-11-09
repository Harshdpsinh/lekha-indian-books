"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {demoEntries,exceptions,INR,metrics,money,rowFromEntry,validationErrors,type Kind,type RecordEntry,type LedgerRow} from "@/lib/accounting";
import DocumentsPanel,{type DocumentItem} from "./DocumentsPanel";
type Tab="Dashboard"|"Documents"|"Transactions"|"Sales Register"|"Purchase Register"|"GST Reconciliation"|"Commission & TDS"|"Month-End / CA";
const tabs:Tab[]=["Dashboard","Documents","Transactions","Sales Register","Purchase Register","GST Reconciliation","Commission & TDS","Month-End / CA"];
const inputDate=()=>new Date().toISOString().slice(0,10);
const inputMonth=()=>new Date().toISOString().slice(0,7);
const format=(x:string)=>x||"—";
const fields=["date","party","description","amount","direction","invoiceNo","gstin","taxable","cgst","sgst","igst","gst","tds","deductions","received","account","entity","category","itcStatus","reviewed"];
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200)}
function tag(label:string,good=false){return <span className={"pill "+(good?"good":"")}>{label}</span>}
export default function LekhaDashboard({demo}:{demo:boolean}){
 const [month,setMonth]=useState(inputMonth),[tab,setTab]=useState<Tab>("Dashboard"),[entity,setEntity]=useState<"all"|"personal"|"business">("all");
 const [entries,setEntries]=useState<RecordEntry[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [kind,setKind]=useState<Kind>("transaction"),[form,setForm]=useState<Record<string,string|number|boolean|null>>({
 date:inputDate(),party:"",description:"",amount:"",direction:"credit",invoiceNo:"",gstin:"",taxable:"",cgst:"",sgst:"",igst:"",gst:"",tds:"",deductions:"",received:"",entity:"business",account:"Main Bank",category:"Uncategorised",itcStatus:"review",reviewed:false
 });
 const [showForm,setShowForm]=useState(false),[filter,setFilter]=useState("");
 const [documents,setDocuments]=useState<DocumentItem[]>([]);
 useEffect(()=>{
  if(demo){setDocuments([]);return}
  let active=true;
  setDocuments([]);
  fetch("/api/documents?month="+encodeURIComponent(month),{cache:"no-store"}).then(async res=>{
   const data=await res.json();
   if(!res.ok)throw Error(data.error||"Could not load document index");
   if(active)setDocuments(data.documents??[]);
  }).catch(e=>{if(active)setError("Document register unavailable: "+String(e))});
  return ()=>{active=false};
 },[demo,month]);

 const requestSeq=useRef(0);
 const load=useCallback(async()=>{
  const seq=++requestSeq.current;setError("");
  if(demo){setEntries(demoEntries(month));return}
  setBusy(true);
  try{const response=await fetch("/api/ledger?month="+encodeURIComponent(month),{cache:"no-store"});const data=await response.json();if(!response.ok)throw Error(data.error||"Unable to load private ledger");if(seq===requestSeq.current)setEntries(data.entries??[])}
  catch(err){if(seq===requestSeq.current)setError("Cloud ledger not available: "+String(err))}
  finally{if(seq===requestSeq.current)setBusy(false)}
 },[month,demo]);
 useEffect(()=>{void load()},[load]);
 const rows=useMemo(()=>entries.map(rowFromEntry).filter(r=>entity==="all"||r.entity===entity),[entries,entity]);
 const sums=useMemo(()=>metrics(rows),[rows]),unresolved=useMemo(()=>exceptions(rows),[rows]);
 const list=rows.filter(r=>r.party.toLowerCase().includes(filter.toLowerCase())||r.description.toLowerCase().includes(filter.toLowerCase())||r.invoiceNo.toLowerCase().includes(filter.toLowerCase()));
 const sales=list.filter(r=>r.kind==="invoice"&&r.direction==="credit"),purchases=list.filter(r=>r.kind==="invoice"&&r.direction==="debit");
 const tx=list.filter(r=>r.kind==="transaction"),settlements=list.filter(r=>r.kind==="settlement");
 const field=(key:string,val:string|boolean)=>setForm(prev=>({...prev,[key]:val}));
 const totalTax=money(form.cgst)+money(form.sgst)+money(form.igst);
 async function save(){
  if(demo){setError("Demo mode is read-only. Google Drive authorization is required to save real data.");return}
  const payload={...form,gst:totalTax||money(form.gst),amount:money(form.amount),received:money(form.received),tds:money(form.tds),deductions:money(form.deductions),taxable:money(form.taxable),cgst:money(form.cgst),sgst:money(form.sgst),igst:money(form.igst)};
  const errors=validationErrors(payload,kind);
  if(errors.length){setError(errors.join(" · "));return}
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/ledger",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind,month,payload})});
   const data=await response.json();if(!response.ok)throw Error(data.error||"Failed to save");
   setForm(prev=>({...prev,party:"",description:"",amount:"",invoiceNo:"",gstin:"",taxable:"",cgst:"",sgst:"",igst:"",gst:"",tds:"",received:"",deductions:""}));setNotice("Encrypted record written to private Google Drive");setShowForm(false);await load();
  }catch(err){setError(String(err))}finally{setBusy(false)}
 }
 async function exportPack(){
  setBusy(true);setError("");
  try{
   const [{default:JSZip},{default:ExcelJS}]=await Promise.all([import("jszip"),import("exceljs")]);
   const zip=new JSZip(),book=new ExcelJS.Workbook();
   function sheet(name:string,head:string[],body:(string|number|boolean)[][]){
    const page=book.addWorksheet(name);page.addRow(head);body.forEach(r=>page.addRow(r));page.getRow(1).font={bold:true};page.columns.forEach(c=>{c.width=22});
   }
   const ledgerRows=rows.map(r=>[r.date,r.entity,r.account,r.party,r.description,r.direction,r.amount,r.category,r.source,r.reviewed] as (string|number|boolean)[]);
   sheet("Transactions",["Date","Book","Account","Party","Narration","Direction","Amount INR","Category","Source","Reviewed"],rows.filter(r=>r.kind==="transaction").map(r=>[r.date,r.entity,r.account,r.party,r.description,r.direction,r.amount,r.category,r.source,r.reviewed]));
   sheet("Sales Register",["Date","Invoice","Party","GSTIN","Taxable","CGST","SGST","IGST","Total","Received","Outstanding"],rows.filter(r=>r.kind==="invoice"&&r.direction==="credit").map(r=>[r.date,r.invoiceNo,r.party,r.gstin,r.taxable,r.cgst,r.sgst,r.igst,r.amount,r.received,Math.max(0,r.amount-r.received)]));
   sheet("Purchase Register",["Date","Invoice","Party","GSTIN","Taxable","CGST","SGST","IGST","Total","ITC status"],rows.filter(r=>r.kind==="invoice"&&r.direction==="debit").map(r=>[r.date,r.invoiceNo,r.party,r.gstin,r.taxable,r.cgst,r.sgst,r.igst,r.amount,r.itcStatus]));
   sheet("GST Summary",["Metric","Amount INR"],[["Output GST",sums.outputGst],["Matched purchase ITC",sums.itcMatched],["Pending ITC",sums.itcPending],["Sales unpaid",sums.salesDue]]);
   sheet("Commission TDS",["Date","Payer","Invoice","Gross","GST","TDS","Other deductions","Expected net","Actual received","Difference"],rows.filter(r=>r.kind==="settlement").map(r=>[r.date,r.party,r.invoiceNo,r.amount,r.gst,r.tds,r.deductions,r.amount+r.gst-r.tds-r.deductions,r.received,r.amount+r.gst-r.tds-r.deductions-r.received]));
   sheet("Reconciliation",["Date","Record","Party","Invoice","Reason","Amount"],unresolved.map(x=>[x.row.date,x.row.kind,x.row.party,x.row.invoiceNo,x.reason,x.row.amount]));
   sheet("Document Index",["File","Category","Month","Size bytes","SHA256","Status"],documents.map(d=>[d.name,d.kind,d.month,d.size,d.sha256,d.status]));
   sheet("CA Checklist",["Area","Note"],[["Registration","GSTIN and tax registrations: attach manually"],["Sales/Purchases","Review and confirm invoices"],["GSTR-2B","Confirm ITC against downloaded official GSTR-2B"],["TDS","Verify with Form 26AS / AIS"],["Bank balances","Independent bank balance reconciliation not yet implemented"],["Supporting PDFs","See Document Index and original files in ZIP when Drive is connected"]]);
   zip.file("Lekha_"+month+"_CA_Registers.xlsx",await book.xlsx.writeBuffer());
   // The download is authenticated and every document is integrity-verified on the server.
   // Abort rather than quietly producing an incomplete CA package.
   if(!demo){
    if(documents.length>100)throw Error("Too many documents to include in one ZIP (100 maximum)");
    for(const d of documents){
     const response=await fetch("/api/documents/"+encodeURIComponent(d.id)+"?month="+encodeURIComponent(month),{cache:"no-store"});
     if(!response.ok)throw Error("Could not include document "+d.name);
     const body=await response.blob();
     const folder=({bank:"01_Bank",credit_card:"02_Credit_Cards",upi:"03_UPI",sales:"04_Sales_Invoices",purchases:"05_Purchases",gst:"06_GST",registration:"07_Registrations",other:"08_Other"} as Record<string,string>)[d.kind]??"08_Other";
     zip.file(folder+"/"+d.id+"-"+d.name.replace(/[\\/]/g,"_"),body);
    }
   }
   zip.file("READ_ME_FIRST.txt",`Lekha ${month} CA review pack\nMode: ${demo?"SYNTHETIC DEMO":"USER LEDGER RECORDS"}\nThis package includes Excel registers and ${demo?"no actual source files in demo":"private encrypted-at-rest source documents decrypted for this ZIP download"}.\nAll GST and TDS values require review against source documents/portal.\n`);
   const bytes=await zip.generateAsync({type:"blob",compression:"DEFLATE"});
   download(bytes,`Lekha_${month}_CA_Pack${demo?"_DEMO":""}.zip`);
  }catch(err){setError("Could not export CA pack: "+String(err))}finally{setBusy(false)}
 }
 const stat=(name:string,value:string,hint:string)=><div className="card stat"><span className="muted">{name}</span><b>{value}</b><small className="muted">{hint}</small></div>;
 const gridRows=(columns:string[],data:React.ReactNode[][],empty="No entries in this period")=><div className="scroll"><table className="table"><thead><tr>{columns.map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{data.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table>{!data.length&&<div className="empty">{empty}</div>}</div>;
 const invoiceCells=(r:LedgerRow)=>[r.date,r.invoiceNo,r.party,r.gstin||"—",INR(r.taxable),INR(r.gst),INR(r.amount),r.direction==="credit"?INR(Math.max(0,r.amount-r.received)):tag(r.itcStatus,r.itcStatus==="matched")];
 const transactionCells=(r:LedgerRow)=>[r.date,r.entity,r.account,r.party,r.description,r.direction==="credit"?tag("Credit",true):tag("Debit"),INR(r.amount),r.category,r.reviewed?tag("Reviewed",true):tag("Review")];
 const statusText=demo?"SYNTHETIC DEMO • NO REAL DATA":"PRIVATE GOOGLE DRIVE";
 return <main className="accounting-shell">
  <aside className="accounting-sidebar"><div className="brandmark">लेखा <span>Lekha</span><small>INDIAN BOOKS</small></div><div className="side-label">WORKSPACE</div>{tabs.map(t=><button key={t} className={"side-tab "+(tab===t?"selected":"")} onClick={()=>{setTab(t);setError("");setNotice("")}}>{t}</button>)}<div className="sidebar-foot">Vercel + Drive architecture<br/>Supabase not required</div></aside>
  <div className="accounting-main"><div className="accounting-top"><div><h1>{tab}</h1><div className="muted">{statusText}</div></div><div className="row"><input aria-label="Accounting month" type="month" value={month} onChange={e=>setMonth(e.target.value)}/><select aria-label="Book selector" value={entity} onChange={e=>setEntity(e.target.value as typeof entity)}><option value="all">All books</option><option value="business">Business</option><option value="personal">Personal</option></select><button className="btn outline" onClick={()=>void load()} disabled={busy}>Refresh</button></div></div>
  {demo&&<div className="notice demo-notice"><b>Demo Preview:</b> नीचे दिखाई गई सभी राशियाँ और GSTIN काल्पनिक हैं। अभी Google Drive connected नहीं है; save/real upload उपलब्ध नहीं। आप dashboard और reports को explore कर सकते हैं।</div>}
  {error&&<div className="notice red">{error}</div>}{notice&&<div className="notice success">{notice}</div>}
  <div className="toolbar"><div className="row"><input className="search" placeholder="Search party, invoice or description" value={filter} onChange={e=>setFilter(e.target.value)}/>{tag(month)}</div><div className="row"><button className="btn outline" onClick={()=>void exportPack()}>Download CA ZIP</button>{!demo&&<button className="btn" onClick={()=>setShowForm(s=>!s)}>{showForm?"Close form":"+ Add entry"}</button>}</div></div>
  {showForm&&!demo&&<section className="card"><h2>Add ledger record</h2><div className="form-grid"><div className="field"><label>Record type</label><select value={kind} onChange={e=>setKind(e.target.value as Kind)}><option value="transaction">Bank / Card / UPI transaction</option><option value="invoice">Sales / Purchase invoice</option><option value="settlement">Commission / TDS settlement</option></select></div>{fields.filter(x=>["date","party","description","amount","direction","invoiceNo","gstin","taxable","cgst","sgst","igst","tds","deductions","received","account","entity","category","itcStatus"].includes(x)&&(["invoiceNo","gstin","taxable","cgst","sgst","igst","received","itcStatus"].includes(x)?kind==="invoice"||x==="received"&&kind==="settlement":true)&&(["tds","deductions"].includes(x)?kind==="settlement":true)).map(key=><div className="field" key={key}><label>{({date:"Date",party:"Party / supplier / payer",description:"Description",amount:kind==="invoice"?"Invoice total (₹)":"Amount (₹)",direction:"Credit (sale/inflow) or Debit (purchase/expense)",invoiceNo:"Invoice No.",gstin:"Supplier / customer GSTIN",taxable:"Taxable ₹",cgst:"CGST ₹",sgst:"SGST ₹",igst:"IGST ₹",tds:"TDS ₹",deductions:"Other deductions ₹",received:"Received ₹",account:"Account",entity:"Books",category:"Category",itcStatus:"GSTR-2B status"} as Record<string,string>)[key]}</label>{key==="direction"?<select value={String(form[key])} onChange={e=>field(key,e.target.value)}><option value="credit">Credit / Sale</option><option value="debit">Debit / Purchase</option></select>:key==="entity"?<select value={String(form[key])} onChange={e=>field(key,e.target.value)}><option value="business">Business</option><option value="personal">Personal</option></select>:key==="itcStatus"?<select value={String(form[key])} onChange={e=>field(key,e.target.value)}><option value="review">Needs review</option><option value="matched">Manually matched 2B</option><option value="missing">Missing in 2B</option><option value="ineligible">Ineligible</option></select>:<input type={key==="date"?"date":["amount","taxable","cgst","sgst","igst","tds","received","deductions"].includes(key)?"number":"text"} min="0" step=".01" value={String(form[key]??"")} onChange={e=>field(key,e.target.value)}/>}</div>)}</div><div className="row"><button className="btn" disabled={busy} onClick={()=>void save()}>Save encrypted record</button><span className="muted">Only accessible to the authenticated Google account</span></div></section>}
  {tab==="Dashboard"&&<><div className="metric-grid">{stat("Money received",INR(sums.income),"Selected month credits")}{stat("Money spent",INR(sums.expense),"Selected month debits")}{stat("Net cash flow",INR(sums.net),"Excludes internal transfer categories")}{stat("Sales receivable",INR(sums.salesDue),"Invoice payments pending")}{stat("Output GST",INR(sums.outputGst),"On sales invoices")}{stat("Matched ITC",INR(sums.itcMatched),"Marked matched to 2B")}{stat("Pending ITC",INR(sums.itcPending),"Needs supporting GSTR-2B")}{stat("Commission shortfall",INR(sums.commissionShortfall),"Expected less actual receipt")}</div><div className="two-columns"><section className="card"><h2>Month-end health</h2><div className="indicator-list">{[["Unreviewed transactions",sums.uncategorised],["Sales invoices pending",sums.pendingInvoices],["ITC not confirmed",sums.missingItc],["Total exceptions",unresolved.length]].map(([name,n])=><div className="indicator" key={name}><span>{name}</span><b>{n}</b></div>)}</div><p className="muted">Bank balances, automatic GST portal verification and tax filing are not certified.</p></section><section className="card"><h2>GST & commission snapshot</h2><div className="indicator-list">{[["Sales invoiced",INR(sums.sales)],["Purchase invoiced",INR(sums.purchases)],["GST output",INR(sums.outputGst)],["Input tax verified manually",INR(sums.itcMatched)]].map(([name,v])=><div className="indicator" key={name}><span>{name}</span><b>{v}</b></div>)}</div></section></div></>}
  {tab==="Documents"&&<DocumentsPanel month={month} demo={demo} onChange={setDocuments}/>}
  {tab==="Transactions"&&<section className="card"><h2>Bank, Card & UPI ledger</h2>{gridRows(["Date","Book","Account","Party","Narration","Direction","Amount","Category","Review"],tx.map(transactionCells))}</section>}
  {tab==="Sales Register"&&<section className="card"><h2>GST Sales Register</h2><p className="muted">Sales invoices, CGST/SGST/IGST, receipts and pending amounts.</p>{gridRows(["Date","Invoice","Customer","GSTIN","Taxable","GST","Invoice total","Outstanding"],sales.map(invoiceCells))}</section>}
  {tab==="Purchase Register"&&<section className="card"><h2>GST Purchase Register</h2><p className="muted">ITC status is not a substitute for authentic GSTR-2B confirmation.</p>{gridRows(["Date","Invoice","Supplier","GSTIN","Taxable","GST","Invoice total","ITC status"],purchases.map(invoiceCells))}</section>}
  {tab==="GST Reconciliation"&&<><div className="metric-grid">{stat("Output GST",INR(sums.outputGst),"Sales invoices")}{stat("Matched ITC",INR(sums.itcMatched),"Manual match status")}{stat("ITC pending",INR(sums.itcPending),"Unverified / missing 2B")}{stat("Sales outstanding",INR(sums.salesDue),"Payment reconciliation")}</div><section className="card"><h2>GST & payment exceptions</h2>{gridRows(["Date","Party","Invoice","Reason","Amount"],unresolved.filter(x=>x.row.kind==="invoice").map(x=>[x.row.date,x.row.party,x.row.invoiceNo,x.reason,INR(x.row.amount)]),"No recorded GST exceptions")}</section><section className="card"><h2>GSTR-2B cross-check</h2><div className="notice">This Drive-only version does not yet process GSTR-2B uploads automatically. ITC can only be marked manually after source verification. Automated matching will be added when private document storage is configured.</div></section></>}
  {tab==="Commission & TDS"&&<><div className="metric-grid">{stat("Expected net variance",INR(sums.commissionShortfall),"Commission + GST − TDS − deductions − received")}{stat("Settlements",String(settlements.length),"Month-wise payout entries")}{stat("GST output",INR(sums.outputGst),"From sales register")}{stat("Pending sales dues",INR(sums.salesDue),"Payment matching needed")}</div><section className="card"><h2>Commission settlement reconciliation</h2>{gridRows(["Payer","Invoice","Commission","GST","TDS","Other deducted","Expected net","Received","Difference"],settlements.map(r=>[r.party,r.invoiceNo,INR(r.amount),INR(r.gst),INR(r.tds),INR(r.deductions),INR(r.amount+r.gst-r.tds-r.deductions),INR(r.received),INR(r.amount+r.gst-r.tds-r.deductions-r.received)]))}</section></>}
  {tab==="Month-End / CA"&&<><div className="metric-grid">{stat("Transactions",String(tx.length),"Bank/card/UPI entries")}{stat("Sales invoices",String(sales.length),"Sales register")}{stat("Purchases",String(purchases.length),"ITC review")}{stat("Exceptions",String(unresolved.length),"Unreconciled items")}</div><section className="card"><h2>Download monthly CA package</h2><p>Excel workbook includes ledger, sales register, purchase register, GST summary, commission/TDS reconciliation, exceptions and CA checklist.</p><button className="btn" onClick={()=>void exportPack()} disabled={busy}>Download {demo?"DEMO ":""}ZIP + Excel</button><div className="notice"><b>Limitations:</b> Source PDF documents, portal-verification certificates and registration details are not attached to this download. ZIP contains Excel reports only, not full documentary evidence. Confirm with your CA before filing.</div></section><section className="card"><h2>Reconciliation review queue</h2>{gridRows(["Date","Record","Party","Reason","Amount"],unresolved.map(x=>[x.row.date,x.row.kind,x.row.party,x.reason,INR(x.row.amount)]))}</section></>}
  <footer className="app-footer">{demo?"Synthetic demo · No sensitive data":"Authenticated single-user Drive ledger"} · GST figures are provisional and require source verification · Free-tier prototype</footer>
  </div>
 </main>;
}
