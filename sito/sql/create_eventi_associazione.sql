-- Tabella eventi dell'associazione
create table if not exists eventi_associazione (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  titolo text not null,
  data date not null,
  ora text not null default '19:30',
  luogo text,
  immagine_url text,
  prezzo numeric(10,2) not null default 15,
  is_active boolean not null default true,
  prenotazioni_aperte boolean not null default true,
  sold_out boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

-- Tabella prenotazioni per gli eventi dell'associazione
create table if not exists eventi_associazione_prenotazioni (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventi_associazione(id) on delete cascade,
  nome text not null,
  cognome text not null,
  email text not null,
  telefono text,
  num_posti integer not null check (num_posti > 0),
  note text,
  stato text not null default 'pending_payment' check (stato in ('pending_payment', 'confermata', 'cancellata')),
  payment_reference text,
  importo_pagato numeric(10,2),
  payment_method text default 'sumup',
  booking_source text default 'website',
  created_at timestamptz not null default now()
);

create index if not exists idx_eventi_associazione_active_date
  on eventi_associazione (is_active, data);

create index if not exists idx_eventi_associazione_slug
  on eventi_associazione (slug);

create index if not exists idx_eventi_associazione_prenotazioni_evento
  on eventi_associazione_prenotazioni (evento_id, stato, created_at);

create index if not exists idx_eventi_associazione_prenotazioni_payment_reference
  on eventi_associazione_prenotazioni (payment_reference);
