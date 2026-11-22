import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";
mkdirSync("public",{recursive:true});
cpSync(join("node_modules","pdfjs-dist","legacy","build","pdf.worker.min.mjs"),join("public","pdf.worker.min.mjs"));
console.log("PDF.js worker copied for browser document extraction");
