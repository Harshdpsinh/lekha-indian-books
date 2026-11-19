-- Separate brokerage already received from later GST invoice reimbursement.
-- Preserve legacy settlement rows; do not infer prior receipt allocations.
alter table public.commission_settlements add column if not exists brokerage_received_paise bigint check(brokerage_received_paise>=0);
alter table public.commission_settlements add column if not exists invoice_date date;
alter table public.commission_settlements add column if not exists invoice_sent_date date;
alter table public.commission_settlements add column if not exists gst_due_paise bigint check(gst_due_paise>=0);
alter table public.commission_settlements add column if not exists gst_received_paise bigint check(gst_received_paise>=0);
alter table public.commission_settlements add column if not exists gst_receipt_date date;
alter table public.commission_settlements add column if not exists gst_bank_reference text;
alter table public.commission_settlements add column if not exists gst_bank_transaction_id uuid references public.transactions(id) on delete set null;
create unique index if not exists unique_gst_bank_transaction on public.commission_settlements(gst_bank_transaction_id) where gst_bank_transaction_id is not null;
-- Old rows have NULL gst_due_paise: explicitly review and convert; never reuse combined receipt as GST.
