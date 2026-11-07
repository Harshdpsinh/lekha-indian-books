import type { Transaction } from "./types";

type MonthStat={name:string;period:string;income:number;expense:number;count:number};
type CategoryStat={category:string;income:number;expense:number;count:number};
export type AnnualReportData={label:string;months:MonthStat[];categories:CategoryStat[];transactions:Transaction[]};
function inr(value:number){return "INR "+new Intl.NumberFormat("en-IN",{maximumFractionDigits:2,minimumFractionDigits:2}).format(value/100)}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
function filename(label:string,extension:string){return "Lekha_"+label.replace(/[^A-Za-z0-9_-]+/g,"_")+"_Annual_Report."+extension}

export async function annualExcel(data:AnnualReportData){
 const {default:ExcelJS}=await import("exceljs");const workbook=new ExcelJS.Workbook();
 const summary=workbook.addWorksheet("Monthly Summary");
 summary.addRow(["Period","Income INR","Expense INR","Net INR","Transactions"]);
 for(const m of data.months)summary.addRow([m.period,m.income/100,m.expense/100,(m.income-m.expense)/100,m.count]);
 summary.addRow(["TOTAL",data.months.reduce((a,x)=>a+x.income,0)/100,data.months.reduce((a,x)=>a+x.expense,0)/100,data.months.reduce((a,x)=>a+x.income-x.expense,0)/100,data.transactions.length]);
 const cats=workbook.addWorksheet("Category Summary");cats.addRow(["Category","Expenses INR","Income INR","Transactions"]);
 for(const c of data.categories)cats.addRow([c.category,c.expense/100,c.income/100,c.count]);
 const tx=workbook.addWorksheet("Yearly Transactions");
 tx.addRow(["Date","Entity","Account","Description","Debit/Credit","Amount INR","Category","Reference","Verified"]);
 for(const t of data.transactions)tx.addRow([t.txn_date,t.entity,t.account_label,t.description,t.direction,t.amount_paise/100,t.category,t.reference??"",t.reviewed?"Reviewed":"Needs review"]);
 for(const sheet of workbook.worksheets){sheet.getRow(1).font={bold:true};sheet.columns.forEach((column,i)=>{column.width=i===3&&sheet.name==="Yearly Transactions"?52:24});sheet.views=[{state:"frozen",ySplit:1}]}
 for(const sheet of [summary,cats,tx]){for(const row of sheet.getRows(2,sheet.rowCount-1)??[]){for(const c of row.eachCell.bind(row) as never)void c;}} // Retain cells' values unmodified.
 const buf=await workbook.xlsx.writeBuffer();
 download(new Blob([new Uint8Array(buf as ArrayBuffer)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),filename(data.label,"xlsx"));
}

export async function annualPdf(data:AnnualReportData){
 const {PDFDocument,StandardFonts,rgb}=await import("pdf-lib");
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const width=595,height=842;let page=doc.addPage([width,height]);let y=802;
 const write=(value:string,options?:{size?:number;strong?:boolean;color?:[number,number,number]})=>{
  const size=options?.size??10;
  if(y<65){page=doc.addPage([width,height]);y=802}
  const text=value.replace(/[^\x20-\x7E]/g," ").slice(0,100);
  page.drawText(text,{x:44,y,size,font:options?.strong?bold:font,color:rgb(...(options?.color??[0.16,0.22,0.35]))});
  y-=size+9;
 };
 write("LEKHA — YEARLY ACCOUNTING SUMMARY",{size:17,strong:true,color:[0.09,0.19,0.42]});
 write(data.label,{size:13,strong:true});write("Generated from imported ledger data. NOT an audited financial statement.",{size:8});
 y-=12;write("MONTH-WISE STATEMENT",{size:12,strong:true});
 for(const m of data.months)write(m.period.padEnd(14)+" Income "+inr(m.income).padEnd(24)+" Expenses "+inr(m.expense)+"   Net "+inr(m.income-m.expense),{size:8});
 y-=12;write("CATEGORY-WISE SUMMARY",{size:12,strong:true});
 for(const c of data.categories.slice(0,35))write(c.category.slice(0,24).padEnd(25)+" Expense "+inr(c.expense).padEnd(24)+" Income "+inr(c.income),{size:8});
 y-=12;write("CA REVIEW POINTS",{size:12,strong:true});
 for(const line of ["Verify all source bank balances and imported statement rows.","Exclude transfers and card settlements from income/expense totals.","Confirm unreviewed categories, GST treatment, TDS and ITC with original documents.","This PDF is informational and not a tax filing document."])write(line,{size:9});
 const bytes=await doc.save();
 download(new Blob([new Uint8Array(bytes)],{type:"application/pdf"}),filename(data.label,"pdf"));
}
