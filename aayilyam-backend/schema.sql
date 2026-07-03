-- ============================================================
-- Aayilyam Stores — Supabase database schema
-- Run this in Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- Categories
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text default '🛒',
  created_at timestamptz default now()
);

-- Products
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid references categories(id) on delete set null,
  price numeric(10,2) not null,
  old_price numeric(10,2),
  icon text default '🛒',
  stock int default 0,
  active boolean default true,
  created_at timestamptz default now()
);

-- Offers
create table if not exists offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  pct text not null,          -- e.g. "15% OFF"
  description text,
  code text,
  active boolean default true,
  created_at timestamptz default now()
);

-- Customer profiles (extends Supabase's built-in auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  address text,
  created_at timestamptz default now()
);

-- Orders
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text,
  customer_phone text,
  delivery_address text,
  items jsonb not null,               -- [{product_id, name, price, qty}]
  total numeric(10,2) not null,
  payment_method text not null,       -- 'razorpay' | 'cod' | 'whatsapp'
  payment_status text default 'pending', -- 'pending' | 'paid' | 'failed'
  razorpay_order_id text,
  razorpay_payment_id text,
  status text default 'placed',       -- 'placed' | 'packed' | 'out_for_delivery' | 'delivered' | 'cancelled'
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- Public (anon key) can READ products/categories/offers only.
-- All writes go through the backend using the service_role key,
-- which bypasses RLS — so the admin panel never needs its own
-- RLS policies, it just needs to keep the service_role key secret.
-- ============================================================
alter table categories enable row level security;
alter table products enable row level security;
alter table offers enable row level security;
alter table profiles enable row level security;
alter table orders enable row level security;

create policy "Public can view categories" on categories for select using (true);
create policy "Public can view active products" on products for select using (active = true);
create policy "Public can view active offers" on offers for select using (active = true);

-- Customers can view/edit only their own profile
create policy "Users manage own profile" on profiles for all using (auth.uid() = id);

-- Customers can view only their own orders
create policy "Users view own orders" on orders for select using (auth.uid() = customer_id);

-- Seed data matching the website's starting catalogue
insert into categories (name, icon) values
 ('Groceries','🛒'),('Vegetables','🥦'),('Fruits','🍎'),('Dairy Products','🥛'),
 ('Snacks','🍪'),('Beverages','🥤'),('Bakery','🍞'),('Household Essentials','🧴'),('Personal Care','🧼');
