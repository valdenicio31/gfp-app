-- GFP | Supabase: execute integralmente no SQL Editor do projeto.
-- Autenticação: use o provedor Email do Supabase. Nunca grave senhas neste banco.
create extension if not exists pgcrypto;

create table public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clifor(
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code integer not null, name text not null, type text not null check(type in ('1 - Cliente','2 - Fornecedor','3 - Ambos')),
  document text not null, trade_name text, cep text, address text, number text, complement text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,code), unique(user_id,document)
);
create table public.banks(
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code integer not null, bank_number text not null, bank_name text not null, agency_number text, agency_name text, account_number text,
  cep text, address text, number text, complement text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,code)
);
create table public.histories(
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null, description text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,code)
);
create table public.launches(
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  launch_date date not null, type text not null check(type in ('Receita','Despesa')), description text not null, amount numeric(14,2) not null check(amount > 0),
  clifor_id uuid references public.clifor(id) on delete restrict, bank_id uuid references public.banks(id) on delete restrict, history_id uuid references public.histories(id) on delete restrict,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.cards(
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, institution text, limit_amount numeric(14,2) not null default 0, closing_day smallint check(closing_day between 1 and 31), due_day smallint check(due_day between 1 and 31), active boolean not null default true, created_at timestamptz not null default now()
);
create table public.debts(
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, creditor text, original_amount numeric(14,2) not null, current_balance numeric(14,2) not null, interest_rate numeric(7,4), due_date date, status text not null default 'active', created_at timestamptz not null default now()
);
create table public.investments(
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, institution text, investment_type text not null, invested_amount numeric(14,2) not null, current_value numeric(14,2) not null, reference_date date not null default current_date, created_at timestamptz not null default now()
);
create table public.goals(
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, target_amount numeric(14,2) not null check(target_amount > 0), current_amount numeric(14,2) not null default 0, target_date date, priority text not null default 'Média', status text not null default 'Ativa', created_at timestamptz not null default now()
);

alter table public.profiles enable row level security; alter table public.clifor enable row level security; alter table public.banks enable row level security; alter table public.histories enable row level security; alter table public.launches enable row level security; alter table public.cards enable row level security; alter table public.debts enable row level security; alter table public.investments enable row level security; alter table public.goals enable row level security;
create policy "own profile" on public.profiles for all using(id=auth.uid()) with check(id=auth.uid());
create policy "own clifor" on public.clifor for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "own banks" on public.banks for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "own histories" on public.histories for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "own launches" on public.launches for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "own cards" on public.cards for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "own debts" on public.debts for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "own investments" on public.investments for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "own goals" on public.goals for all using(user_id=auth.uid()) with check(user_id=auth.uid());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$begin insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','')); return new; end;$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
