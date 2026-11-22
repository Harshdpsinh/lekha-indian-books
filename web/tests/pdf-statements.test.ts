import test from "node:test";
import assert from "node:assert/strict";
import { parsePdfLines } from "../lib/pdf-transactions";

test("Bank PDF: extracts debit/credit using explicit 3 amount columns",()=>{
 const r=parsePdfLines([
  "Date Narration Debit Credit Balance",
  "01/10/2026 UPI SHOP PURCHASE 250.00 0.00 20,750.00",
  "02/10/2026 COMMISSION RECEIVED 0.00 1,500.00 22,250.00",
 ],"bank");
 assert.equal(r.rows.length,2);
 assert.deepEqual(r.rows.map(x=>[x.txn_date,x.amount_paise,x.direction]),[
  ["2026-10-01",25000,"debit"],["2026-10-02",150000,"credit"]
 ]);
 assert.equal(r.format,"bank-three-column");
});
test("Credit card PDF: supports dated purchase amount rows",()=>{
 const r=parsePdfLines(["Credit Card Statement - Transaction Amount","03/10/2026 ONLINE GROCERY 1,234.50"],"credit_card");
 assert.equal(r.rows.length,1);
 assert.equal(r.rows[0].amount_paise,123450);
 assert.equal(r.rows[0].direction,"debit");
});
test("Never guesses when PDF columns are unknown",()=>{
 const r=parsePdfLines(["Statement 10 Oct","01/10/2026 UNKNOWN 500.00"],"bank");
 assert.equal(r.rows.length,0);
 assert.ok(r.issues.length);
});
test("Bank entries with incomplete amount columns are not silently imported",()=>{
 const r=parsePdfLines(["Date Narration Debit Credit Balance","01/10/2026 ATM WITHDRAWAL 100.00 10,500.00"],"bank");
 assert.equal(r.rows.length,0);
 assert.ok(r.issues.length);
});
test("Invalid date is rejected",()=>{
 const r=parsePdfLines(["Credit card statement","31/02/2026 IMPOSSIBLE 100.00"],"credit_card");
 assert.equal(r.rows.length,0);
});
