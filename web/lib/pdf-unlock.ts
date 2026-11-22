export async function vault(action:"list"|"save"|"clear",password?:string){
 const r=await fetch("/api/pdf-vault",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,password})});
 const j=await r.json();if(!r.ok)throw Error(j.error||"Password vault unavailable");return j as {passwords?:string[];ok?:boolean};
}
export async function unlockPdf(file:File,passwords:string[]){
 const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
 pdfjs.GlobalWorkerOptions.workerSrc="/pdf.worker.min.mjs";
 const candidates=[...new Set(["",...passwords.filter(Boolean)])];
 for(const password of candidates){
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),password:password||undefined,isEvalSupported:false});
  try{const doc=await task.promise;try{const texts:string[]=[];for(let p=1;p<=Math.min(doc.numPages,2);p++){const page=await doc.getPage(p);const t=await page.getTextContent();texts.push(t.items.map(i=>"str" in i?i.str+(i.hasEOL?"\n":" "):"").join(""))}return {password,encrypted:!!password,pages:doc.numPages,text:texts.join("\n")}}finally{await doc.destroy()}}
  catch(e){await task.destroy().catch(()=>{});if(!(e instanceof Error)||!(e.name==="PasswordException"||/password/i.test(e.message)))throw e}
 }
 throw Error("PASSWORD_REQUIRED: None of the supplied or saved passwords opened this PDF.");
}
