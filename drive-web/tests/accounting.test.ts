import test from "node:test";
import assert from "node:assert/strict";
import {demoEntries,exceptions,gstAmount,metrics,rowFromEntry,validationErrors} from "../lib/accounting";
test("Month dashboard calculates synthetic income/expense and GST registers",()=>{
 const r=demoEntries("2026-10").map(rowFromEntry);
 const m=metrics(r);
 assert.equal(m.income,17270);
 assert.equal(m.expense,1879);
 assert.equal(m.net,15391);
 assert.equal(m.sales,18880);
 assert.equal(m.outputGst,2880);
 assert.equal(m.itcMatched,180);
 assert.equal(m.itcPending,360);
 assert.equal(m.salesDue,1610);
 assert.equal(m.pendingInvoices,1);
 assert.equal(m.missingItc,1);
 assert.equal(m.commissionShortfall,10);
});
test("Flags unmatched purchase ITC, unpaid sales, unreviewed ledger, commission variance",()=>{
 const problems=exceptions(demoEntries("2026-10").map(rowFromEntry));
 const tags=problems.map(x=>x.reason);
 assert.ok(tags.includes("Purchase ITC not matched"));
 assert.ok(tags.includes("Sales invoice outstanding"));
 assert.ok(tags.includes("Unreviewed / uncategorised transaction"));
 assert.ok(tags.includes("Commission net payout mismatch"));
});
test("Does not count card settlement and internal transfers as expense or income",()=>{
 const records=demoEntries("2026-10");
 records.push({id:"test-transfer",month:"2026-10",createdAt:"2026-10-20T00:00:00Z",kind:"transaction",payload:{date:"2026-10-20",entity:"business",account:"Bank",party:"Credit Card",amount:12000,direction:"debit",category:"Card settlement",reviewed:true}});
 const all=metrics(records.map(rowFromEntry));
 assert.equal(all.expense,1879);
});
test("Invoice validation rejects missing number, missing party and overpayment",()=>{
 const errors=validationErrors({date:"2026-10-01",party:"",invoiceNo:"",amount:1500,received:1800},"invoice");
 assert.equal(errors.length,3);
});
test("GST uses CGST plus SGST or IGST and rounds money",()=>{
 assert.equal(gstAmount({cgst:90,sgst:90,igst:0,gst:0}),180);
 assert.equal(gstAmount({cgst:0,sgst:0,igst:180,gst:0}),180);
});
