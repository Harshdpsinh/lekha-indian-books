"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Building2, CloudUpload, CreditCard, Download, FileSpreadsheet, FileText, Landmark, LogOut, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { parseStatement, fingerprint } from "@/lib/processing";
import type { Doc, Entity, Invoice, Transaction } from "@/lib/types";
import {money,paisa} from "@/lib/types";

type Tab="Dashboard"|"Upload Center"|"Transactions"|"GST & Invoices"|"Reconciliation"|"Month-End & CA";
const items:{name:Tab;icon:typeof BarChart3}[]=[
{name:"Dashboard",icon:BarChart3},{name:"Upload Center",icon:CloudUpload},{name:"Transactions",icon:CreditCard},
{name:"GST & Invoices",icon:FileText},{name:"Reconciliation",icon:RefreshCw},{name:"Month-End & CA",icon:FileSpreadsheet}
];
const nowMonth=()=>new Date().toISOString().slice(0,7);
function FormField({label,children}:{label:string;children:React.ReactNode}){return <div className="field"><label>{label}</label>{children}</div>}
export default function Home(){
 const client=useMemo(()=>supabase(),[]);
 const [user,setUser]=useState<User|null>(null);
 const [checking,setChecking]=useState(true);
 const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
 const [tab,setTab]=useState<Tab>("Dashboard"); const [message,setMessage]=useState(""); const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);const [month,setMonth]=useState(nowMonth());const [entity,setEntity]=useState<"all"|Entity>("all");
 const [txns,setTxns]=useState<Transaction[]>([]);const [invoices,setInvoices]=useState<Invoice[]>([]);const [docs,setDocs]=useState<Doc[]>([]);
 const [account,setAccount]=useState("Main Bank");const [docKind,setDocKind]=useState("bank");
 const [docEntity,setDocEntity]=useState<Entity>("business");
 const [invoiceKind,setInvoiceKind]=useState<"sale"|"purchase">("sale");
 const [invoiceNo,setInvoiceNo]=useState("");const [party,setParty]=useState("");const [gstin,setGstin]=useState("");
 const [invoiceDate,setInvoiceDate]=useState(new Date().toISOString().slice(0,10));
 const [taxable,setTaxable]=useState("");const [cgst,setCgst]=useState("");const [sgst,setSgst]=useState("");const [igst,setIgst]=useState("");
 const [received,setReceived]=useState("");const [itc,setItc]=useState("review");
 useEffect(()=>{if(!client){setChecking(false);return}
  const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{setUser(session?.user??null);setChecking(false)});
  client.auth.getUser().then(({data})=>{setUser(data.user);setChecking(false)}).catch(()=>setChecking(false));
  return()=>subscription.unsubscribe();
 },[client]);
 const refresh=useCallback(async()=>{
  if(!client||!user)return;
  const [t,i,d]=await Promise.all([
   client.from("transactions").select("*").order("txn_date",{ascending:false}).limit(5000),
   client.from("invoices").select("*").order("invoice_date",{ascending:false}).limit(5000),
   client.from("documents").select("*").order("created_at",{ascending:false}).limit(1000)]);
  if(t.error||i.error||d.error){setError([t.error?.message,i.error?.message,d.error?.message].filter(Boolean).join(" / "));return}
  setTxns((t.data??[]) as Transaction[]);setInvoices((i.data??[]) as Invoice[]);setDocs((d.data??[]) as Doc[]);
 },[client,user]);
 useEffect(()=>{void refresh()},[refresh]);
 const filteredTx=txns.filter(t=>t.txn_date.startsWith(month)&&(entity==="all"||t.entity===entity));
 const filteredInv=invoices.filter(i=>i.invoice_date.startsWith(month)&&(entity==="all"||i.entity===entity));
 const filteredDocs=docs.filter(d=>d.month===month);
 const income=filteredTx.filter(t=>t.direction==="credit"&&!["Internal transfer","Card settlement","Investment","Loan principal"].includes(t.category)).reduce((a,t)=>a+t.amount_paise,0);
 const expense=filteredTx.filter(t=>t.direction==="debit"&&!["Internal transfer","Card settlement","Investment","Loan principal"].includes(t.category)).reduce((a,t)=>a+t.amount_paise,0);
 const sales=filteredInv.filter(i=>i.kind==="sale");
 const purchases=filteredInv.filter(i=>i.kind==="purchase");
 const saleTotal=sales.reduce((a,i)=>a+i.total_paise,0);
 const receivable=sales.reduce((a,i)=>a+Math.max(0,i.total_paise-i.amount_received_paise),0);
 const outputGst=sales.reduce((a,i)=>a+i.cgst_paise+i.sgst_paise+i.igst_paise,0);
 const reviewItc=purchases.filter(i=>i.itc_status!=="matched-2b").reduce((a,i)=>a+i.cgst_paise+i.sgst_paise+i.igst_paise,0);
 const matchedItc=purchases.filter(i=>i.itc_status==="matched-2b").reduce((a,i)=>a+i.cgst_paise+i.sgst_paise+i.igst_paise,0);
 const issues=filteredTx.filter(t=>!t.reviewed||t.category==="Uncategorised");
 const monthInput=<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/>;
 function notify(ok:string){setMessage(ok);setError("");}
 async function signIn(){if(!client)return;setBusy(true);setError("");const {error}=await client.auth.signInWithPassword({email,password});if(error)setError(error.message);setPassword("");setBusy(false)}
 async function upload(files:FileList|null){
  if(!client||!user||!files?.length)return;setBusy(true);setError("");let uploaded=0,imported=0;const warnings:string[]=[];
  try{
   for(const file of Array.from(files)){
    if(file.size>10*1024*1024){warnings.push(file.name+": exceeds 10 MB upload limit");continue}
    if(!/\.(pdf|csv|xlsx)$/i.test(file.name)){warnings.push(file.name+": unsupported format");continue}
    const id=crypto.randomUUID();const key=`${user.id}/${month}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
    const storage=await client.storage.from("lekha-documents").upload(key,file,{upsert:false,contentType:file.type||"application/octet-stream"});
    if(storage.error){warnings.push(file.name+": upload failed: "+storage.error.message);continue}
    const doc=await client.from("documents").insert({id,user_id:user.id,name:file.name,storage_path:key,month,kind:docKind,size_bytes:file.size,status:"pending"});
    if(doc.error){await client.storage.from("lekha-documents").remove([key]);warnings.push(file.name+": "+doc.error.message);continue}
    uploaded++;
    if(/\.(csv|xlsx)$/i.test(file.name)&&["bank","credit_card","upi"].includes(docKind)){
     try{
      const parsed=await parseStatement(file);
      if(parsed.rows.length===0)throw new Error("No valid rows recognized; check column headers");
      const rows=await Promise.all(parsed.rows.map(async row=>({
       ...row,user_id:user.id,account_label:account,entity:docEntity,category:"Uncategorised",reviewed:false,source_document_id:id,
       fingerprint:await fingerprint(row,account)
      })));
      const {error:err}=await client.from("transactions").upsert(rows,{onConflict:"user_id,fingerprint",ignoreDuplicates:true});
      if(err)throw err;
      imported+=rows.length;
      await client.from("documents").update({status:parsed.issues.length?"needs-review":"imported",error:parsed.issues.slice(0,5).join("; ")||null}).eq("id",id);
      if(parsed.issues.length)warnings.push(file.name+": "+parsed.issues.length+" rows need review");
     }catch(e){await client.from("documents").update({status:"needs-review",error:String(e)}).eq("id",id);warnings.push(file.name+": import needs review: "+String(e))}
    }else{await client.from("documents").update({status:"needs-review",error:"Manual review required: automatic PDF/GST invoice extraction not implemented yet"}).eq("id",id)}
   }
   notify(`${uploaded} files stored securely. Up to ${imported} spreadsheet rows submitted (duplicates skipped).`);
   if(warnings.length)setError(warnings.slice(0,8).join(" | "));
   await refresh();
  }finally{setBusy(false)}
 }
 async function addInvoice(){
  if(!client||!user)return;if(!invoiceNo.trim()||!party.trim()){setError("Invoice number and party are required");return}
  setBusy(true);setError("");
  const a=paisa(taxable),b=paisa(cgst),c=paisa(sgst),d=paisa(igst);
  const {error}=await client.from("invoices").insert({user_id:user.id,entity:"business",kind:invoiceKind,invoice_date:invoiceDate,
    invoice_no:invoiceNo.trim(),party:party.trim(),gstin:gstin.trim()||null,taxable_paise:a,cgst_paise:b,sgst_paise:c,igst_paise:d,
    total_paise:a+b+c+d,amount_received_paise:paisa(received),itc_status:itc});
  if(error)setError(error.message);else{notify("Invoice saved to cloud.");setInvoiceNo("");setParty("");setTaxable("");setCgst("");setSgst("");setIgst("");setReceived("");await refresh()}
  setBusy(false);
 }
 async function updateInvoice(id:string,updates:Record<string,unknown>){if(!client)return;const {error}=await client.from("invoices").update(updates).eq("id",id);if(error)setError(error.message);else await refresh()}
 async function reviewTransaction(id:string){if(!client)return;const {error}=await client.from("transactions").update({reviewed:true}).eq("id",id);if(error)setError(error.message);else await refresh()}
 async function exportZip(){
  if(!client)return;setBusy(true);setError("");
  try{
   const [{default:JSZip},{default:ExcelJS}]=await Promise.all([import("jszip"),import("exceljs")]);
   const zip=new JSZip(),book=new ExcelJS.Workbook();
   function sheet(name:string,headers:string[],rows:(string|number|boolean|null)[][]){
    const sh=book.addWorksheet(name);sh.addRow(headers);rows.forEach(r=>sh.addRow(r));sh.getRow(1).font={bold:true};sh.columns.forEach(c=>c.width=20);
   }
   sheet("Transactions",["Date","Account","Entity","Description","Direction","Amount INR","Category","Reference","Reviewed"],filteredTx.map(t=>[t.txn_date,t.account_label,t.entity,t.description,t.direction,t.amount_paise/100,t.category,t.reference??"",t.reviewed]));
   sheet("Sales Register",["Date","Invoice","Party","GSTIN","Taxable INR","CGST","SGST","IGST","Total","Received","Outstanding"],sales.map(i=>[i.invoice_date,i.invoice_no,i.party,i.gstin??"",i.taxable_paise/100,i.cgst_paise/100,i.sgst_paise/100,i.igst_paise/100,i.total_paise/100,i.amount_received_paise/100,Math.max(0,i.total_paise-i.amount_received_paise)/100]));
   sheet("Purchase Register",["Date","Invoice","Party","GSTIN","Taxable INR","CGST","SGST","IGST","Total","ITC status"],purchases.map(i=>[i.invoice_date,i.invoice_no,i.party,i.gstin??"",i.taxable_paise/100,i.cgst_paise/100,i.sgst_paise/100,i.igst_paise/100,i.total_paise/100,i.itc_status]));
   sheet("GST Summary",["Metric","Amount INR"],[["Output GST",outputGst/100],["ITC matched with uploaded 2B",matchedItc/100],["ITC pending verification",reviewItc/100],["Sales receivable",receivable/100]]);
   sheet("Review Queue",["Date","Account","Description","Amount INR","Reason"],issues.map(t=>[t.txn_date,t.account_label,t.description,t.amount_paise/100,t.category==="Uncategorised"?"Uncategorised":"Not reviewed"]));
   sheet("Document Index",["Name","Type","Month","Status","Uploaded"],filteredDocs.map(d=>[d.name,d.kind,d.month,d.status,d.created_at]));
   sheet("CA Checklist",["Item","Status"],[["GST registration details","Add supporting registration document"],["Bank reconciliation",issues.length?"Pending review":"Review balances separately"],["GSTR-2B match","Manual confirmation required"],["Income tax / TDS","Not validated"],["Source documents",filteredDocs.length+" uploaded"]]);
   zip.file("08_Lekha_Monthly_CA_Report.xlsx",await book.xlsx.writeBuffer());
   const folderNames:{[key:string]:string}={bank:"01_Bank_Statements",credit_card:"02_Credit_Card_Statements",upi:"01_Bank_Statements",sale:"03_Sales_Invoices",purchase:"04_Purchase_Invoices",gst_invoice:"05_GST_Reports"};
   for(const d of filteredDocs){
    const {data,error:err}=await client.storage.from("lekha-documents").download(d.storage_path);
    if(err||!data){zip.file("MISSING_DOCUMENTS.txt",`Could not download ${d.name}: ${err?.message??"unknown"}\n`);continue}
    const folder=folderNames[d.kind]??"07_Other_Documents";
    zip.file(`${folder}/${d.id}-${d.name.replace(/[/\\]/g,"_")}`,data);
   }
   zip.file("06_Reconciliation/README.txt","This package lists unreviewed transactions and unpaid invoices. Automatic bank/GST portal reconciliation is not yet certified. Verify with source statements and GSTR-2B before filing.\n");
   zip.file("07_CA_Registration_Details/README.txt","Upload GST certificates, registration details and supporting documents through Upload Center under Other. Review CA checklist in Excel.\n");
   const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:3}});
   const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`Lekha_${month}_MonthEnd.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
   notify("Month-end ZIP created locally in your browser. Contains sensitive plaintext files: store it securely.");
  }catch(e){setError("Export failed: "+String(e))}finally{setBusy(false)}
 }
 if(checking)return <div className="auth"><div>Opening Lekha…</div></div>;
 if(!client)return <div className="auth"><div className="card authbox"><div className="bigbrand">Lekha</div><p>Online accounting setup required</p><div className="notice">Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel, and run the schema.sql in Supabase. Financial data is not available until a private database is connected.</div><p className="muted">See web/README.md for free-tier setup. Never enter secret service-role keys into public variables.</p></div></div>;
 if(!user)return <div className="auth"><div className="card authbox"><div className="bigbrand">Lekha</div><p className="muted">Your private Indian books</p><h2>Secure sign in</h2><FormField label="Email"><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></FormField><FormField label="Password"><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void signIn()}}/></FormField><button className="btn" disabled={busy||!email||!password} onClick={()=>void signIn()}>Sign in</button>{error&&<p className="notice error">{error}</p>}<p className="hint">Single-user system: administrator creates the account privately in Supabase. Public signup is disabled.</p></div></div>;
 return <div className="wrap"><aside className="aside"><div className="brand">Lekha<small>INDIAN BOOKS</small></div>{items.map(({name,icon:Icon})=><button key={name} className={`nav ${tab===name?"on":""}`} onClick={()=>setTab(name)}><Icon size={18}/>{name}</button>)}<button className="nav" onClick={()=>void client.auth.signOut()}><LogOut size={18}/>Sign out</button></aside><main className="main"><div className="head"><div><h1>{tab}</h1><div className="muted">Private bookkeeping • {user.email}</div></div><div className="row"><div className="field" style={{marginBottom:0}}>{monthInput}</div><select value={entity} onChange={e=>setEntity(e.target.value as typeof entity)}><option value="all">All entities</option><option value="personal">Personal</option><option value="business">Business</option></select><button className="btn alt" onClick={()=>void refresh()}><RefreshCw size={15}/></button></div></div>
  {message&&<div className="notice good">{message}</div>}{error&&<div className="notice error">{error}</div>}
  {tab==="Dashboard"&&<><div className="grid"><div className="card stat"><small>Money received</small><strong>{money(income)}</strong><span className="hint">Imported credits (excluding marked transfers)</span></div><div className="card stat"><small>Money spent</small><strong>{money(expense)}</strong><span className="hint">Imported debits (excluding marked transfers)</span></div><div className="card stat"><small>Sales invoiced</small><strong>{money(saleTotal)}</strong><span className="hint">{sales.length} invoices in period</span></div><div className="card stat"><small>Sales outstanding</small><strong>{money(receivable)}</strong><span className="hint">Receivables require matching</span></div></div><div className="sections"><div className="card"><h3 className="sectionTitle">GST snapshot</h3><div className="row between"><span>Output GST on sales</span><b>{money(outputGst)}</b></div><hr/><div className="row between"><span>ITC marked matched</span><b>{money(matchedItc)}</b></div><hr/><div className="row between"><span>ITC awaiting verification</span><b>{money(reviewItc)}</b></div><p className="mini">GSTR-2B must be independently checked. This is not a GST portal confirmation.</p></div><div className="card"><h3 className="sectionTitle">Month-end readiness</h3><div className="row between"><span>Documents uploaded</span><b>{filteredDocs.length}</b></div><hr/><div className="row between"><span>Transactions to review</span><b>{issues.length}</b></div><hr/><div className="row between"><span>Documents needing review</span><b>{filteredDocs.filter(d=>d.status!=="imported").length}</b></div><div className="bar"><div style={{width:`${filteredTx.length?Math.round(100*(filteredTx.length-issues.length)/filteredTx.length):0}%`}}/></div><p className="mini">Reviewed transaction progress</p></div></div></>}
  {tab==="Upload Center"&&<div className="sections"><div className="card"><h3 className="sectionTitle">Upload documents</h3><p className="muted">Bank, card, UPI, GST invoices and other documents. CSV/XLSX transaction parsing available; PDF review still manual.</p><div className="formgrid"><FormField label="Document type"><select value={docKind} onChange={e=>setDocKind(e.target.value)}>{[["bank","Bank statement"],["credit_card","Credit card"],["upi","UPI"],["sale","Sales invoice"],["purchase","Purchase invoice"],["gst_invoice","GST report"],["other","Other / Registration"]].map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></FormField><FormField label="Book"><select value={docEntity} onChange={e=>setDocEntity(e.target.value as Entity)}><option value="business">Business</option><option value="personal">Personal</option></select></FormField><FormField label="Account name"><input value={account} onChange={e=>setAccount(e.target.value)} placeholder="Axis Bank / HDFC Card"/></FormField></div><label className="drop"><CloudUpload size={26}/><p><b>Choose PDF, CSV or XLSX files</b></p><input type="file" multiple accept=".pdf,.csv,.xlsx" disabled={busy} onChange={e=>{void upload(e.target.files);e.target.value=""}}/><p className="mini">Private storage • Max 10 MB per file • Month: {month}</p></label><p className="notice">Password-protected PDFs are stored privately but automatic decryption and transaction extraction are not yet implemented. Never upload your vault master password.</p></div><div className="card"><h3 className="sectionTitle">Document history</h3><div className="tablewrap scroll"><table className="table"><thead><tr><th>File</th><th>Type</th><th>Status</th></tr></thead><tbody>{filteredDocs.map(d=><tr key={d.id}><td>{d.name}<div className="mini">{d.error?.slice(0,100)}</div></td><td>{d.kind}</td><td><span className={`chip ${d.status==="imported"?"ok":"warn"}`}>{d.status}</span></td></tr>)}</tbody></table>{!filteredDocs.length&&<div className="empty">No documents for this month.</div>}</div></div></div>}
  {tab==="Transactions"&&<div className="card"><div className="row between"><h3 className="sectionTitle">Ledger transactions</h3><span className="hint">{filteredTx.length} rows (up to 5,000 loaded)</span></div><div className="tablewrap"><table className="table"><thead><tr><th>Date</th><th>Account</th><th>Details</th><th>Book</th><th>Direction</th><th>Amount</th><th>Category</th><th>Review</th></tr></thead><tbody>{filteredTx.map(t=><tr key={t.id}><td>{t.txn_date}</td><td>{t.account_label}</td><td>{t.description}</td><td>{t.entity}</td><td>{t.direction}</td><td>{money(t.amount_paise)}</td><td>{t.category}</td><td>{t.reviewed?<span className="chip ok">Reviewed</span>:<button className="btn ghost" onClick={()=>void reviewTransaction(t.id)}>Mark reviewed</button>}</td></tr>)}</tbody></table>{!filteredTx.length&&<div className="empty">No transactions yet. Upload a compatible CSV/XLSX bank statement.</div>}</div></div>}
  {tab==="GST & Invoices"&&<div className="sections"><div className="card"><h3 className="sectionTitle">Add GST invoice</h3><div className="formgrid"><FormField label="Register"><select value={invoiceKind} onChange={e=>setInvoiceKind(e.target.value as "sale"|"purchase")}><option value="sale">Sales</option><option value="purchase">Purchase</option></select></FormField><FormField label="Invoice date"><input type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)}/></FormField><FormField label="Invoice no."><input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)}/></FormField><FormField label="Party"><input value={party} onChange={e=>setParty(e.target.value)}/></FormField><FormField label="GSTIN"><input value={gstin} onChange={e=>setGstin(e.target.value.toUpperCase())} placeholder="Optional"/></FormField><FormField label="Taxable value ₹"><input inputMode="decimal" value={taxable} onChange={e=>setTaxable(e.target.value)}/></FormField><FormField label="CGST ₹"><input inputMode="decimal" value={cgst} onChange={e=>setCgst(e.target.value)}/></FormField><FormField label="SGST ₹"><input inputMode="decimal" value={sgst} onChange={e=>setSgst(e.target.value)}/></FormField><FormField label="IGST ₹"><input inputMode="decimal" value={igst} onChange={e=>setIgst(e.target.value)}/></FormField><FormField label="Amount received ₹"><input inputMode="decimal" value={received} onChange={e=>setReceived(e.target.value)}/></FormField><FormField label="2B / ITC status"><select value={itc} onChange={e=>setItc(e.target.value)}><option value="review">Not verified</option><option value="matched-2b">Matched manually to 2B</option><option value="not-in-2b">Not in 2B</option><option value="ineligible">Ineligible</option></select></FormField></div><p className="hint">Total: {money(paisa(taxable)+paisa(cgst)+paisa(sgst)+paisa(igst))}. 2B status must be checked against authentic uploaded data.</p><button className="btn" disabled={busy} onClick={()=>void addInvoice()}>Save invoice</button></div><div className="card"><h3 className="sectionTitle">GST registers — {month}</h3><div className="row between"><span>Sales taxable + GST</span><b>{money(saleTotal)}</b></div><hr/><div className="row between"><span>Output tax</span><b>{money(outputGst)}</b></div><hr/><div className="row between"><span>Verified input tax (manual)</span><b>{money(matchedItc)}</b></div><hr/><div className="row between"><span>ITC pending verification</span><b>{money(reviewItc)}</b></div><p className="mini">GST payable estimates require adjustments and legal verification. Do not file returns solely from these summaries.</p></div></div>}
  {tab==="Reconciliation"&&<div className="stack"><div className="grid"><div className="card stat"><small>Receivable balance</small><strong>{money(receivable)}</strong></div><div className="card stat"><small>ITC pending</small><strong>{money(reviewItc)}</strong></div><div className="card stat"><small>Transaction review</small><strong>{issues.length}</strong></div><div className="card stat"><small>Unprocessed documents</small><strong>{filteredDocs.filter(d=>d.status!=="imported").length}</strong></div></div><div className="card"><h3 className="sectionTitle">Invoice/payment differences</h3><div className="tablewrap"><table className="table"><thead><tr><th>Invoice</th><th>Party</th><th>Total</th><th>Received</th><th>Pending</th><th>Update received amount (₹)</th></tr></thead><tbody>{sales.map(i=><tr key={i.id}><td>{i.invoice_no}</td><td>{i.party}</td><td>{money(i.total_paise)}</td><td>{money(i.amount_received_paise)}</td><td>{money(Math.max(0,i.total_paise-i.amount_received_paise))}</td><td><input aria-label="Received amount" style={{width:115}} type="number" min="0" step=".01" defaultValue={(i.amount_received_paise/100).toFixed(2)} onBlur={e=>{if(paisa(e.target.value)!==i.amount_received_paise)void updateInvoice(i.id,{amount_received_paise:paisa(e.target.value)})}}/></td></tr>)}</tbody></table>{!sales.length&&<div className="empty">No sales invoices in selected month.</div>}</div><p className="mini">Payments are currently entered manually, not automatically matched to bank credits. GST 2B also requires independent verification.</p></div><div className="card"><h3 className="sectionTitle">Purchase ITC verification</h3><div className="tablewrap"><table className="table"><thead><tr><th>Invoice</th><th>Supplier</th><th>GST</th><th>2B verification</th></tr></thead><tbody>{purchases.map(i=><tr key={i.id}><td>{i.invoice_no}</td><td>{i.party}</td><td>{money(i.cgst_paise+i.sgst_paise+i.igst_paise)}</td><td><select value={i.itc_status} onChange={e=>void updateInvoice(i.id,{itc_status:e.target.value})}><option value="review">Pending review</option><option value="matched-2b">Manually matched 2B</option><option value="not-in-2b">Missing 2B</option><option value="ineligible">Ineligible</option></select></td></tr>)}</tbody></table></div></div></div>}
  {tab==="Month-End & CA"&&<div className="sections"><div className="card"><h3 className="sectionTitle">Month-end report package</h3><p>Download a ZIP with the source documents from this month and an Excel CA pack covering transactions, sales/purchases, GST summary, review queue and document index.</p><div className="row between"><span>Month</span><b>{month}</b></div><hr/><div className="row between"><span>Uploaded source documents</span><b>{filteredDocs.length}</b></div><hr/><div className="row between"><span>Sales / purchase invoices</span><b>{sales.length} / {purchases.length}</b></div><hr/><div className="row between"><span>Pending review</span><b>{issues.length}</b></div><button className="btn" disabled={busy} onClick={()=>void exportZip()}><Download size={16} style={{verticalAlign:"middle"}}/> Download month-end ZIP</button><p className="mini">ZIP contains unencrypted financial documents after download. Store securely and share only with your CA.</p></div><div className="card"><h3 className="sectionTitle">CA preparation checklist</h3>{["Sales register","Purchase register","GST summary and ITC review","Bank and credit card ledger","Document index","Unmatched transactions and unpaid invoices","Registration certificates and tax IDs"].map((name,i)=><p key={name} className="row"><ShieldCheck size={17} color={i===6?"#c58b36":"#376eb8"}/>{name} <span className="hint">{i===6?"manual supporting uploads":"included or listed in Excel"}</span></p>)}<p className="notice">TDS, tax filing, account balance matching and portal integration are not certified in this version.</p></div></div>}
  <div className="footer">Lekha Vercel-first development preview • Single-user • Financial results require source-data and CA verification</div>
 </main></div>;
}
