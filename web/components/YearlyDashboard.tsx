"use client";
import { useMemo } from "react";
import type { Transaction } from "@/lib/types";
import { money } from "@/lib/types";

const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const EXCLUDE=new Set(["Internal transfer","Card settlement","Investment","Loan principal"]);
type Props={transactions:Transaction[],year:string,entity:"all"|"business"|"personal",month:string,onPickMonth:(month:string)=>void};
export default function YearlyDashboard({transactions,year,entity,month,onPickMonth}:Props){
 const rows=useMemo(()=>transactions.filter(t=>t.txn_date.startsWith(year+"-")&&(entity==="all"||t.entity===entity)),[transactions,year,entity]);
 const months=useMemo(()=>MONTHS.map((name,i)=>{
   const mm=String(i+1).padStart(2,"0");
   const tr=rows.filter(t=>t.txn_date.slice(5,7)===mm&&!EXCLUDE.has(t.category));
   const income=tr.filter(t=>t.direction==="credit").reduce((a,t)=>a+t.amount_paise,0);
   const expense=tr.filter(t=>t.direction==="debit").reduce((a,t)=>a+t.amount_paise,0);
   return {name,mm,income,expense,count:tr.length};
 }),[rows]);
 const annualIncome=months.reduce((a,m)=>a+m.income,0);
 const annualExpense=months.reduce((a,m)=>a+m.expense,0);
 const category=useMemo(()=>{
  const m=new Map<string,{category:string,expense:number,income:number,count:number}>();
  for(const t of rows){
   if(EXCLUDE.has(t.category))continue;
   const name=t.category||"Uncategorised";
   const x=m.get(name)??{category:name,expense:0,income:0,count:0};
   x[t.direction==="debit"?"expense":"income"]+=t.amount_paise;x.count++;m.set(name,x);
  }
  return [...m.values()].sort((a,b)=>b.expense-a.expense||b.income-a.income);
 },[rows]);
 const biggest=Math.max(1,...months.map(m=>Math.max(m.income,m.expense)));
 return <div className="stack">
  <div className="grid">
   <div className="card stat"><small>Annual income — {year}</small><strong>{money(annualIncome)}</strong></div>
   <div className="card stat"><small>Annual expenses — {year}</small><strong>{money(annualExpense)}</strong></div>
   <div className="card stat"><small>Annual difference</small><strong>{money(annualIncome-annualExpense)}</strong></div>
   <div className="card stat"><small>Transactions — {year}</small><strong>{rows.length}</strong><span className="hint">Stored in cloud ledger</span></div>
  </div>
  <div className="card"><h3 className="sectionTitle">Monthly income vs expenses — {year}</h3>
   <div className="tablewrap"><table className="table"><thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Difference</th><th>Transactions</th><th>Trend</th></tr></thead><tbody>
    {months.map(m=><tr key={m.mm} style={{background:month===year+"-"+m.mm?"#eef4ff":undefined}}>
     <td><button className="btn ghost" onClick={()=>onPickMonth(year+"-"+m.mm)}>{m.name}</button></td>
     <td>{money(m.income)}</td><td>{money(m.expense)}</td><td>{money(m.income-m.expense)}</td><td>{m.count}</td>
     <td style={{minWidth:110}}><div style={{height:8,background:"#e7edf7",borderRadius:8,overflow:"hidden"}}><div style={{width:`${m.income/biggest*100}%`,height:8,background:"#3165d9"}}/></div><div style={{height:8,marginTop:4,background:"#e7edf7",borderRadius:8,overflow:"hidden"}}><div style={{width:`${m.expense/biggest*100}%`,height:8,background:"#d58a43"}}/></div></td>
    </tr>)}</tbody></table></div>
   <p className="hint">Select a month to review its source transactions, GST, document history and reconciliation. Blue: income; orange: expenses.</p>
  </div>
  <div className="card"><h3 className="sectionTitle">Yearly category-wise summary</h3><div className="tablewrap"><table className="table"><thead><tr><th>Category</th><th>Debit / Expenses</th><th>Credit / Income</th><th>Transactions</th></tr></thead><tbody>{category.map(c=><tr key={c.category}><td>{c.category}</td><td>{money(c.expense)}</td><td>{money(c.income)}</td><td>{c.count}</td></tr>)}</tbody></table>{!category.length&&<p className="empty">No transactions imported for {year}. Upload yearly PDF/Excel statements through Upload Center.</p>}</div></div>
  <div className="notice">These totals reflect imported ledger entries, not certified bank balances. Imported transfers and card repayments must be categorized to prevent double counting. Verify annual opening and closing statement balances before using figures for tax filing.</div>
 </div>
}
