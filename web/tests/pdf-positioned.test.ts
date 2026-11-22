import test from "node:test";
import assert from "node:assert/strict";
import {parsePositionedBank,parsePdfLines} from "../lib/pdf-transactions";
test("positional bank PDF: dotted dates, continuation text, correct debit/credit",()=>{
 const lines=[
  {y:700,cells:[{x:399,s:"Withdrawal"},{x:473,s:"Deposit"},{x:532,s:"Balance"}]},
  {y:650,cells:[{x:28,s:"1"},{x:61,s:"02.10.2026"},{x:192,s:"SHOP PAYMENT"},{x:399,s:"125.50"},{x:532,s:"9874.50"}]},
  {y:645,cells:[{x:192,s:"UPI REF 123"}]},
  {y:630,cells:[{x:28,s:"2"},{x:61,s:"03.10.2026"},{x:192,s:"COMMISSION RECEIPT"},{x:473,s:"1000.00"},{x:532,s:"10874.50"}]}
 ];
 const result=parsePositionedBank(lines);
 assert.equal(result.rows.length,2);
 assert.deepEqual(result.rows.map(t=>[t.txn_date,t.direction,t.amount_paise]),[
  ["2026-10-02","debit",12550],["2026-10-03","credit",100000]]);
 assert.match(result.rows[0].description,/UPI REF/);
 assert.ok(result.issues.some(t=>t.includes("Review")));
});
test("ambiguous statement dates have no fabricated debit/credit",()=>{
 const lines=[
  {y:700,cells:[{x:399,s:"Withdrawal"},{x:473,s:"Deposit"},{x:532,s:"Balance"}]},
  {y:650,cells:[{x:61,s:"04.10.2026"},{x:192,s:"UNRESOLVED"},{x:532,s:"19000.00"}]}
 ];
 const result=parsePositionedBank(lines);
 assert.equal(result.rows.length,0);
 assert.ok(result.issues.length>0);
});
test("reject unknown PDF format",()=>{
 const result=parsePdfLines(["Example file","01.10.2026 not a bank statement"],"bank");
 assert.equal(result.rows.length,0);
});
