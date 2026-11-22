import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {parsePdfLines} from "../lib/pdf-transactions";

test("Generate a real PDF, extract text using PDF.js, and parse a bank transaction",async()=>{
 const pdf=await PDFDocument.create();
 const page=pdf.addPage([595,842]);
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 page.drawText("Date Narration Debit Credit Balance",{x:30,y:795,size:10,font});
 page.drawText("01/10/2026 UPI TEST PURCHASE 250.00 0.00 20,750.00",{x:30,y:765,size:10,font});
 const bytes=await pdf.save();
 const task=getDocument({data:new Uint8Array(bytes)});
 const loaded=await task.promise;
 const texts:string[]=[];
 try {
  const p=await loaded.getPage(1);
  const content=await p.getTextContent();
  for(const item of content.items)if("str" in item && item.str.trim())texts.push(item.str);
 } finally {await loaded.destroy()}
 const parsed=parsePdfLines(texts,"bank");
 assert.equal(parsed.rows.length,1);
 assert.equal(parsed.rows[0].amount_paise,25000);
});
