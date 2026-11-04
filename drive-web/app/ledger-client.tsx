"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {SessionProvider,signIn,signOut,useSession} from "next-auth/react";
type Entry={id:string;kind:"transaction"|"invoice"|"settlement";month:string;createdAt:string;payload:Record<string,string|number|boolean|null>};
const todayMonth=()=>new Date().toISOString().slice(0,7);
const rupees=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(n);
function Dashboard(){
 const {data:session,status}=useSession();
 const [month,setMonth]=useState(todayMonth());
 const [kind,setKind]=useState<Entry["kind"]>("transaction");
 const [entries,setEntries]=useState<Entry[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [date,setDate]=useState(new Date().toISOString().slice(0,10)),[party,setParty]=useState(""),[description,setDescription]=useState("");
 const [amount,setAmount]=useState(""),[direction,setDirection]=useState("credit"),[gst,setGst]=useState(""),[tds,setTds]=useState(""),[invoiceNo,setInvoiceNo]=useState("");
 const refresh=useCallback(async()=>{
  setLoading(true);setError("");
  try{const r=await fetch("/api/ledger?month="+month,{cache:"no-store"});const data=await r.json();if(!r.ok)throw Error(data.error||"Could not load ledger");setEntries(data.entries)}
  catch(e){setError(String(e))}finally{setLoading(false)}
 },[month]);
 useEffect(()=>{if(status==="authenticated")void refresh()},[refresh,status]);
 const values=useMemo(()=>{
  const tx=entries.filter(x=>x.kind==="transaction");
  const received=tx.filter(x=>x.payload.direction==="credit").reduce((a,x)=>a+Number(x.payload.amount||0),0);
  const spent=tx.filter(x=>x.payload.direction==="debit").reduce((a,x)=>a+Number(x.payload.amount||0),0);
  const invoices=entries.filter(x=>x.kind==="invoice").reduce((a,x)=>a+Number(x.payload.gst||0),0);
  return {received,spent,invoices};
 },[entries]);
 async function add(){
  setError("");setMessage("");
  if(!party.trim()||!Number.isFinite(Number(amount))||Number(amount)<=0){setError("Valid party/account and amount are required.");return}
  setLoading(true);
  try{
   const payload={date,party:party.trim(),description:description.trim(),amount:Math.round(Number(amount)*100)/100,direction,invoiceNo:invoiceNo.trim(),gst:Math.round(Number(gst||0)*100)/100,tds:Math.round(Number(tds||0)*100)/100};
   const r=await fetch("/api/ledger",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind,month,payload})});
   const data=await r.json();if(!r.ok)throw Error(data.error||"Save failed");
   setAmount("");setParty("");setDescription("");setInvoiceNo("");setGst("");setTds("");setMessage("Encrypted record saved to private Google Drive app data.");await refresh();
  }catch(e){setError(String(e))}finally{setLoading(false)}
 }
 function exportCsv(){
  const columns=["type","date","party","description","amount","direction","invoiceNo","gst","tds"];
  const csv=[columns.join(","),...entries.map(x=>columns.map(k=>JSON.stringify(k==="type"?x.kind:x.payload[k]??"")).join(","))].join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));const a=document.createElement("a");a.href=url;a.download="Lekha-"+month+"-ledger.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 if(status==="loading")return <div className="auth">Opening Lekha…</div>;
 if(!session)return <div className="auth"><section className="card"><h1 className="title">Lekha</h1><p className="subtitle">Private Google Drive bookkeeping — no Supabase database</p><p>Sign in using the allowed Google account. This prototype stores encrypted ledger records in your private Google Drive application-data area.</p><button className="btn" onClick={()=>void signIn("google")}>Continue with Google</button><div className="notice">Development preview only. Do not use real financial information until full reconciliation and security validation is complete.</div></section></div>;
 return <main className="app"><header className="head"><div><div className="title">Lekha</div><p className="subtitle">Online Accounts · Google Drive encrypted ledger</p></div><div className="row"><span className="pill">{session.user?.email}</span><button className="btn outline" onClick={()=>void signOut()}>Sign out</button></div></header>
 <div className="row" style={{marginTop:20}}><label>Month <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button className="btn outline" disabled={loading} onClick={()=>void refresh()}>Refresh</button><button className="btn outline" onClick={exportCsv}>Download monthly CSV</button></div>
 <div className="stats"><div className="card stat"><span className="muted">Received</span><b>{rupees(values.received)}</b></div><div className="card stat"><span className="muted">Paid</span><b>{rupees(values.spent)}</b></div><div className="card stat"><span className="muted">GST registered (unverified)</span><b>{rupees(values.invoices)}</b></div></div>
 <section className="card"><h2>Record transaction, GST invoice or settlement</h2><p className="muted">This is the first Drive-only ledger prototype. Full invoice matching, PDF import and CA ZIP migration are still pending.</p><div className="grid"><div className="field"><label>Type</label><select value={kind} onChange={e=>setKind(e.target.value as Entry["kind"])}><option value="transaction">Transaction</option><option value="invoice">GST Invoice</option><option value="settlement">Commission / TDS settlement</option></select></div><div className="field"><label>Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div><div className="field"><label>Party / Account</label><input value={party} onChange={e=>setParty(e.target.value)}/></div><div className="field"><label>Description</label><input value={description} onChange={e=>setDescription(e.target.value)}/></div><div className="field"><label>Amount (₹)</label><input type="number" min="0" step=".01" value={amount} onChange={e=>setAmount(e.target.value)}/></div><div className="field"><label>Direction</label><select value={direction} onChange={e=>setDirection(e.target.value)}><option value="credit">Credit / Received</option><option value="debit">Debit / Paid</option></select></div><div className="field"><label>Invoice number</label><input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)}/></div><div className="field"><label>GST amount (₹)</label><input type="number" min="0" step=".01" value={gst} onChange={e=>setGst(e.target.value)}/></div><div className="field"><label>TDS deducted (₹)</label><input type="number" min="0" step=".01" value={tds} onChange={e=>setTds(e.target.value)}/></div></div><div className="row" style={{marginTop:14}}><button className="btn" disabled={loading} onClick={()=>void add()}>Save encrypted record</button></div></section>
 {error&&<div className="notice red">{error}</div>}{message&&<div className="notice">{message}</div>}
 <section className="card"><h2>Monthly records ({entries.length})</h2><div className="scroll"><table className="table"><thead><tr><th>Date</th><th>Type</th><th>Party</th><th>Description</th><th>Amount</th><th>GST</th><th>TDS</th></tr></thead><tbody>{entries.map(e=><tr key={e.id}><td>{e.payload.date}</td><td>{e.kind}</td><td>{e.payload.party}</td><td>{e.payload.description}</td><td>{rupees(Number(e.payload.amount||0))}</td><td>{rupees(Number(e.payload.gst||0))}</td><td>{rupees(Number(e.payload.tds||0))}</td></tr>)}</tbody></table>{!entries.length&&<p className="muted">No saved ledger records for this month.</p>}</div></section><p className="small">Development only • Drive is the primary record store here, not a separate offsite backup • Verify statements before financial or tax filing</p></main>;
}
export default function LedgerClient(){return <SessionProvider><Dashboard/></SessionProvider>}
