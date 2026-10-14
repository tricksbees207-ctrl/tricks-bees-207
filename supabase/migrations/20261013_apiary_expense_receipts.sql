-- Private receipt attachments for Apiary_Expenses.
-- Metadata is protected by RLS; file access is protected by storage.objects RLS.
create table if not exists public."Apiary_Expense_Receipts" (
  id bigint generated always as identity primary key,
  expense_id bigint not null references public."Apiary_Expenses"(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id),
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  created_at timestamptz not null default now(),
  constraint receipt_path_owner check (split_part(storage_path, '/', 1) = user_id::text),
  constraint receipt_path_expense check (split_part(storage_path, '/', 2) = expense_id::text),
  constraint receipt_mime check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'))
);
create index if not exists apiary_receipts_expense_idx on public."Apiary_Expense_Receipts" (expense_id);
alter table public."Apiary_Expense_Receipts" enable row level security;
grant select, insert, delete on public."Apiary_Expense_Receipts" to authenticated;
grant usage, select on sequence public."Apiary_Expense_Receipts_id_seq" to authenticated;

create policy "Owners view their expense receipts"
on public."Apiary_Expense_Receipts" for select to authenticated
using (user_id = (select auth.uid()) and exists (
  select 1 from public."Apiary_Expenses" e
  where e.id = expense_id and e.user_id = (select auth.uid())
));
create policy "Owners add receipts to own expenses"
on public."Apiary_Expense_Receipts" for insert to authenticated
with check (user_id = (select auth.uid()) and exists (
  select 1 from public."Apiary_Expenses" e
  where e.id = expense_id and e.user_id = (select auth.uid())
));
create policy "Owners delete their expense receipts"
on public."Apiary_Expense_Receipts" for delete to authenticated
using (user_id = (select auth.uid()) and exists (
  select 1 from public."Apiary_Expenses" e
  where e.id = expense_id and e.user_id = (select auth.uid())
));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('apiary-receipts','apiary-receipts',false,10485760,
  array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

-- Object path: <auth user UUID>/<expense ID>/<random UUID>.<extension>
create policy "Owners upload receipts for own expenses"
on storage.objects for insert to authenticated
with check (
  bucket_id='apiary-receipts'
  and split_part(name,'/',1) = (select auth.uid())::text
  and exists (select 1 from public."Apiary_Expenses" e
    where e.id::text=split_part(name,'/',2) and e.user_id=(select auth.uid()))
);
create policy "Owners read receipts for own expenses"
on storage.objects for select to authenticated
using (
  bucket_id='apiary-receipts'
  and split_part(name,'/',1) = (select auth.uid())::text
  and exists (select 1 from public."Apiary_Expenses" e
    where e.id::text=split_part(name,'/',2) and e.user_id=(select auth.uid()))
);
create policy "Owners delete receipts for own expenses"
on storage.objects for delete to authenticated
using (
  bucket_id='apiary-receipts'
  and split_part(name,'/',1) = (select auth.uid())::text
  and exists (select 1 from public."Apiary_Expenses" e
    where e.id::text=split_part(name,'/',2) and e.user_id=(select auth.uid()))
);
