-- Be Elite Supplements — database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It creates every table the site uses, plus the security rules the "My account" page needs.

create table if not exists public.orders (
  id               bigint generated always as identity primary key,
  ref              text unique not null,
  created_at       timestamptz not null default now(),
  status           text not null default 'pending',  -- pending | paid | dispatched | cancelled
  customer_name    text,
  customer_email   text,
  phone            text,
  address_line1    text,
  address_line2    text,
  city             text,
  county           text,
  postcode         text,
  items            text,
  amount           numeric(10,2),
  shipping_method  text default 'standard',
  pen_added        boolean default false,
  affiliate_code   text,
  commission       numeric(10,2) default 0,
  commission_paid  boolean default false,
  fena_payment_id  text,
  paid_at          timestamptz,
  tracking_number  text,
  dispatched_at    timestamptz,
  reminder_sent    boolean default false
);
create index if not exists orders_email_idx on public.orders (lower(customer_email));
create index if not exists orders_aff_idx on public.orders (affiliate_code);

create table if not exists public.affiliates (
  id                  bigint generated always as identity primary key,
  created_at          timestamptz not null default now(),
  name                text,
  email               text,
  code                text unique not null,
  password            text,
  discount_pct        numeric(5,2) default 10,
  commission_pct      numeric(5,2) default 10,
  tier                text default 'Standard',
  status              text default 'active',
  is_discount_only    boolean default false,
  bank_account_name   text,
  bank_sort_code      text,
  bank_account_number text,
  bank_updated_at     timestamptz
);

create table if not exists public.winback_emails (
  id             bigint generated always as identity primary key,
  customer_email text not null,
  sent_at        timestamptz not null default now()
);

create table if not exists public.reminders (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  note        text,
  remind_date date,
  created_at  timestamptz not null default now()
);

-- Security: the website's server functions use the service key and bypass these rules.
-- The browser (anon key) can only do what's allowed below.
alter table public.orders         enable row level security;
alter table public.affiliates     enable row level security;
alter table public.winback_emails enable row level security;
alter table public.reminders      enable row level security;

-- Signed-in customers can see their own paid/dispatched orders on the My account page.
drop policy if exists "customers read own orders" on public.orders;
create policy "customers read own orders" on public.orders
  for select to authenticated
  using (lower(customer_email) = lower(auth.jwt() ->> 'email'));

-- Signed-in customers manage their own reminders.
drop policy if exists "own reminders" on public.reminders;
create policy "own reminders" on public.reminders
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Starter discount codes used by the automatic emails (abandoned basket + win-back).
insert into public.affiliates (name, email, code, password, discount_pct, commission_pct, tier, status, is_discount_only)
values
  ('Abandoned basket 10%', 'basket10@discount-code.local', 'BASKET10', 'nologin-basket10', 10, 0, 'Discount Code', 'active', true),
  ('Win-back 10%', 'comeback10@discount-code.local', 'COMEBACK10', 'nologin-comeback10', 10, 0, 'Discount Code', 'active', true)
on conflict (code) do nothing;
