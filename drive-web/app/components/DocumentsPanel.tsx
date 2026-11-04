"use client";
import {useCallback,useEffect,useState} from "react";
export type DocumentItem={id:string;name:string;month:string;kind:string;size:number;sha256:string;createdAt:string;encrypted:boolean;status:string};
const KINDS=[["bank","Bank statement"],["credit_card","Credit card"],["upi","UPI"],["sales","Sales invoices"],["purchases","Purchase invoices"],["gst","GST / GSTR-2B"],["registration","Business registrations"],["other","Other supporting documents"]];
const pretty=(n:number)=>n>1048576?(n/1048576).toFixed(2)+" MB":Math.ceil(n/1024)+" KB";
export default function DocumentsPanel({month,demo,onChange}:{month:string;demo:boolean;onChange?:(files:DocumentItem[])=>void}){
 const [items,setItems]=useState<DocumentItem[]>([]),[kind,setKind]=useState("bank");
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(""),[error,setError]=useState("");
 const [selected,setSelected]=useState<File[]>([]);
 const refresh=useCallback(async()=>{
  if(demo){setItems([]);onChange?.([]);return}
  try{
   const result=await fetch("/api/documents?month="+encodeURIComponent(month),{cache:"no-store"});
   const body=await result.json();
   if(!result.ok)throw Error(body.error||"Could not list stored files");
   setItems(body.documents);onChange?.(body.documents);
  }catch(e){setError(String(e))}
 },[month,demo,onChange]);
 useEffect(()=>{void refresh()},[refresh]);
 async function upload(){
  if(demo||selected.length===0)return;
  setBusy(true);setError("");setStatus("");
  let ok=0;
  const failures:string[]=[];
  try{
   for(const file of selected){
    if(file.size>2*1024*1024){failures.push(file.name+": exceeds 2 MB limit");continue}
    if(!/\.(pdf|csv|xls|xlsx)$/i.test(file.name)){failures.push(file.name+": unsupported type");continue}
    const body=new FormData();body.set("file",file);body.set("month",month);body.set("kind",kind);
    try{
     const response=await fetch("/api/documents",{method:"POST",body});
     const data=await response.json();
     if(!response.ok)throw Error(data.error||"Upload failed");
     ok++;
    }catch(e){failures.push(file.name+": "+String(e))}
   }
   setStatus(ok+" original files saved as encrypted Drive documents. They are not yet imported into the ledger.");
   setSelected([]);
   if(failures.length)setError(failures.join(" | "));
   await refresh();
  }finally{setBusy(false)}
 }
 async function downloadOne(d:DocumentItem){
  if(demo)return;
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/documents/"+encodeURIComponent(d.id)+"?month="+encodeURIComponent(month),{cache:"no-store"});
   if(!response.ok){const x=await response.json();throw Error(x.error??"Download failed")}
   const blob=await response.blob();
   const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=d.name;a.click();
   setTimeout(()=>URL.revokeObjectURL(url),5000);
  }catch(e){setError(String(e))}finally{setBusy(false)}
 }
 return <section className="card"><h2>Document Upload Center <span className="pill">{demo?"Demo preview":"Private encrypted Drive"}</span></h2>
  <p className="muted">Upload bank, credit card, UPI, GST invoices, GSTR-2B, registrations and CA evidence. Files remain private and are encrypted using AES-256-GCM before saving in Drive appData.</p>
  <div className="form-grid" style={{gridTemplateColumns:"1fr 2fr"}}>
   <div className="field"><label>Document category</label><select value={kind} disabled={demo||busy} onChange={e=>setKind(e.target.value)}>{KINDS.map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></div>
   <div className="field"><label>Select PDFs / Excel / CSV (max 2 MB each)</label><input type="file" multiple accept=".pdf,.xls,.xlsx,.csv" disabled={demo||busy} onChange={e=>setSelected(Array.from(e.target.files??[]))}/></div>
  </div>
  <div className="row"><button className="btn" disabled={demo||busy||selected.length===0} onClick={()=>void upload()}>{busy?"Working…":"Upload "+(selected.length||"")+" documents"}</button><span className="muted">Month: {month} · {selected.length} selected</span></div>
  {demo&&<div className="notice demo-notice">Uploads disabled in public demo until Google Drive OAuth and the server encryption key are connected. Do not upload real statements into the demo.</div>}
  {error&&<div className="notice red">{error}</div>}{status&&<div className="notice success">{status}</div>}
  <h3 style={{marginTop:22}}>Monthly document register ({items.length})</h3>
  <div className="scroll"><table className="table"><thead><tr><th>File name</th><th>Category</th><th>Size</th><th>Uploaded</th><th>Storage</th><th></th></tr></thead><tbody>{items.map(d=><tr key={d.id}><td>{d.name}</td><td>{KINDS.find(([x])=>x===d.kind)?.[1]??d.kind}</td><td>{pretty(d.size)}</td><td>{new Date(d.createdAt).toLocaleString("en-IN")}</td><td><span className="pill good">Encrypted</span></td><td><button className="btn outline" disabled={busy} onClick={()=>void downloadOne(d)}>Download</button></td></tr>)}</tbody></table>{items.length===0&&<p className="empty">No uploaded source files for this month.</p>}</div>
  <p className="muted">Security limit: 2 MB per file on Vercel Functions. PDF extraction, invoice matching and CSV/Excel transaction import are separate review steps; uploading alone never changes your financial ledger.</p>
 </section>
}
