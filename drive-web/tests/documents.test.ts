import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {encryptDocument,decryptDocument,MAX_DOCUMENT_BYTES,safeMonth} from "../lib/document-crypto";

test("Encrypted PDF preserves exact original bytes and metadata",()=>{
 process.env.LEKHA_ENCRYPTION_KEY=randomBytes(32).toString("base64");
 const source=Buffer.from("%PDF-1.7\nPRIVATE FINANCIAL STATEMENT\n");
 const packed=encryptDocument("account.pdf","2026-11","bank",source);
 assert.ok(packed.name.startsWith("lekha-doc-v1-2026-11-"));
 assert.equal(packed.body.subarray(0,4).toString(),"LKF1");
 assert.equal(packed.body.includes(source),false);
 const unpacked=decryptDocument(packed.body);
 assert.deepEqual(unpacked.content,source);
 assert.equal(unpacked.meta.name,"account.pdf");
 assert.equal(unpacked.meta.kind,"bank");
 assert.equal(unpacked.meta.month,"2026-11");
 assert.equal(unpacked.meta.encrypted,true);
});
test("Reject corrupted encrypted bytes and wrong key",()=>{
 const originalKey=randomBytes(32);
 process.env.LEKHA_ENCRYPTION_KEY=originalKey.toString("base64");
 const packed=encryptDocument("report.csv","2026-10","gst",Buffer.from("Date,Amount\n01/10/2026,100.00\n"));
 const corrupt=Buffer.from(packed.body);
 corrupt[corrupt.length-1]^=1;
 assert.throws(()=>decryptDocument(corrupt));
 process.env.LEKHA_ENCRYPTION_KEY=randomBytes(32).toString("base64");
 assert.throws(()=>decryptDocument(packed.body));
});
test("Reject unacceptable file types, binary CSV and forged PDF",()=>{
 process.env.LEKHA_ENCRYPTION_KEY=randomBytes(32).toString("base64");
 assert.throws(()=>encryptDocument("bad.exe","2026-11","bank",Buffer.from("123")));
 assert.throws(()=>encryptDocument("fake.pdf","2026-11","bank",Buffer.from("not a real PDF")));
 assert.throws(()=>encryptDocument("binary.csv","2026-11","gst",Buffer.from([0,1,2])));
 assert.throws(()=>encryptDocument("valid.pdf","2026-11","unknown",Buffer.from("%PDF-1.7")));
 assert.throws(()=>encryptDocument("large.pdf","2026-11","bank",Buffer.concat([Buffer.from("%PDF-"),Buffer.alloc(MAX_DOCUMENT_BYTES)])));
});
test("Reject malformed month and keep file names sanitized",()=>{
 process.env.LEKHA_ENCRYPTION_KEY=randomBytes(32).toString("base64");
 assert.throws(()=>safeMonth("2026-13"));
 const packed=encryptDocument("../docs.pdf","2026-11","other",Buffer.from("%PDF-1.7"));
 assert.ok(!packed.meta.name.includes("/"));
});
