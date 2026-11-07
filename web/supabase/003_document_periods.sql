-- Link one yearly or multi-month source PDF/XLSX to every period it covers.
create table if not exists public.document_periods (
 user_id uuid not null references auth.users(id) on delete cascade,
 document_id uuid not null references public.documents(id) on delete cascade,
 month text not null check(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 primary key(user_id,document_id,month)
);
create index if not exists idx_lekha_document_periods_month on public.document_periods(user_id,month);
alter table public.document_periods enable row level security;
drop policy if exists "owner document periods" on public.document_periods;
create policy "owner document periods" on public.document_periods for all to authenticated
 using ((select auth.uid())=user_id and exists(select 1 from public.documents d where d.id=document_id and d.user_id=(select auth.uid())))
 with check ((select auth.uid())=user_id and exists(select 1 from public.documents d where d.id=document_id and d.user_id=(select auth.uid())));
