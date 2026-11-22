-- Commission/GST/TDS settlement reconciliation.
-- Execute after schema.sql.
create table if not exists public.commission_settlements (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 month text not null check(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 payer text not null,
 invoice_no text not null,
 gross_commission_paise bigint not null default 0,
 gst_charged_paise bigint not null default 0,
 tds_deducted_paise bigint not null default 0,
 other_deductions_paise bigint not null default 0,
 amount_received_paise bigint not null default 0,
 receipt_date date,
 notes text,
 created_at timestamptz not null default now(),
 unique(user_id,payer,invoice_no)
);
alter table public.commission_settlements enable row level security;
drop policy if exists "owner commission settlements" on public.commission_settlements;
create policy "owner commission settlements" on public.commission_settlements
for all to authenticated using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);
create index if not exists idx_settlement_month on public.commission_settlements(user_id,month);
