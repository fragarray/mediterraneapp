-- Corso di Marketing

create table if not exists public.marketing_eventi (id uuid primary key default gen_random_uuid(),data date not null,ora time not null default '18:30',luogo text not null default 'Mediterranea · Lecce',note text,prezzo numeric(10,2) not null default 49,capacity integer not null default 0,sold_out boolean not null default false,prenotazioni_aperte boolean not null default true,created_at timestamptz not null default now());

create table if not exists public.marketing_prenotazioni (id uuid primary key default gen_random_uuid(),evento_id uuid not null references public.marketing_eventi(id) on delete cascade,nome text not null,cognome text not null,email text not null,telefono text,num_posti integer not null check(num_posti between 1 and 50),note text,stato text not null default 'pending_payment',payment_reference text unique,importo_pagato numeric(10,2),payment_method text,created_at timestamptz not null default now());

create table if not exists public.marketing_settings (key text primary key,value text not null,updated_at timestamptz not null default now());

create index if not exists marketing_events_date_idx on public.marketing_eventi(data);

alter table public.marketing_eventi enable row level security;

alter table public.marketing_prenotazioni enable row level security;

alter table public.marketing_settings enable row level security;

create policy 'marketing public events' on public.marketing_eventi for select using(prenotazioni_aperte=true);

create policy 'marketing admin events' on public.marketing_eventi for all to authenticated using(true) with check(true);

create policy 'marketing admin bookings' on public.marketing_prenotazioni for all to authenticated using(true) with check(true);

create policy 'marketing admin settings' on public.marketing_settings for all to authenticated using(true) with check(true);