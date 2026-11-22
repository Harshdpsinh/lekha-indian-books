-- Lekha cloud schema v1. Run in a NEW Supabase project SQL Editor.
-- Every data table is owner-scoped and protected by RLS.
create extension if not exists pgcrypto;

create table if not exists public.accounts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 label text not null,
 kind text not null default 'bank',
 entity text not null check(entity in ('personal','business')),
 created_at timestamptz not null default now(),
 unique(user_id,label,entity)
);
create table if not exists public.documents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null,
 storage_path text not null unique,
 kind text not null,
 month text not null check(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 size_bytes bigint not null default 0 check(size_bytes >= 0),
 status text not null default 'pending' check(status in ('pending','imported','needs-review','failed')),
 error text,
 created_at timestamptz not null default now()
);
create table if not exists public.transactions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 account_label text not null,
 entity text not null check(entity in ('personal','business')),
 txn_date date not null,
 description text not null,
 amount_paise bigint not null check(amount_paise >= 0),
 direction text not null check(direction in ('credit','debit')),
 category text not null default 'Uncategorised',
 reference text,
 fingerprint text not null,
 source_document_id uuid references public.documents(id) on delete set null,
 reviewed boolean not null default false,
 created_at timestamptz not null default now(),
 unique(user_id,fingerprint)
);
create index if not exists idx_lekha_txn_period on public.transactions(user_id, txn_date);
create table if not exists public.invoices (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 entity text not null default 'business' check(entity in ('personal','business')),
 kind text not null check(kind in ('sale','purchase')),
 invoice_date date not null,
 invoice_no text not null,
 party text not null,
 gstin text,
 taxable_paise bigint not null default 0,
 cgst_paise bigint not null default 0,
 sgst_paise bigint not null default 0,
 igst_paise bigint not null default 0,
 total_paise bigint not null default 0,
 amount_received_paise bigint not null default 0,
 itc_status text not null default 'review' check(itc_status in ('review','matched-2b','not-in-2b','ineligible')),
 notes text,
 created_at timestamptz not null default now(),
 unique(user_id,kind,invoice_no,party)
);

alter table public.accounts enable row level security;
alter table public.documents enable row level security;
alter table public.transactions enable row level security;
alter table public.invoices enable row level security;

drop policy if exists "owner accounts" on public.accounts;
create policy "owner accounts" on public.accounts for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists "owner documents" on public.documents;
create policy "owner documents" on public.documents for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists "owner transactions" on public.transactions;
create policy "owner transactions" on public.transactions for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists "owner invoices" on public.invoices;
create policy "owner invoices" on public.invoices for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

-- Private bucket. Client can access only its own UID prefix.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('lekha-documents','lekha-documents',false,52428800,null)
on conflict (id) do nothing;
drop policy if exists "lekha own uploads" on storage.objects;
create policy "lekha own uploads" on storage.objects for insert to authenticated
 with check (bucket_id='lekha-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "lekha own downloads" on storage.objects;
create policy "lekha own downloads" on storage.objects for select to authenticated
 using (bucket_id='lekha-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "lekha own deletions" on storage.objects;
create policy "lekha own deletions" on storage.objects for delete to authenticated
 using (bucket_id='lekha-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- RLS also applies to data added via authenticated API calls.
-- Disable public email signup in Supabase Auth Settings for single-user use.
