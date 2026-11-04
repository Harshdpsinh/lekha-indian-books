export type Entity = "personal" | "business";
export type Transaction = { id: string; user_id: string; account_label: string; entity: Entity; txn_date: string; description: string; amount_paise: number; direction: "credit"|"debit"; category: string; reference: string|null; source_document_id: string|null; reviewed: boolean };
export type Invoice = { id: string; user_id: string; entity: Entity; kind: "sale"|"purchase"; invoice_date: string; invoice_no: string; party: string; gstin: string|null; taxable_paise: number; cgst_paise: number; sgst_paise: number; igst_paise: number; total_paise: number; amount_received_paise: number; itc_status: string; notes: string|null };
export type Doc = { id: string; user_id: string; name: string; storage_path: string; kind: string; month: string; size_bytes: number; status: string; error: string|null; created_at: string };
export const money=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(n/100);
export const paisa=(input:unknown)=>Math.round(Number(String(input??"0").replace(/[,₹\s]/g,""))*100);
