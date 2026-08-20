create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  action varchar(40) not null,
  entity_type varchar(30),
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  ip_address varchar(45),
  user_agent varchar(500),
  created_at timestamptz not null default now()
);
create index if not exists audit_family_idx on audit_events(family_id, created_at desc);
create index if not exists audit_actor_idx on audit_events(actor_user_id, created_at desc);
create index if not exists audit_action_idx on audit_events(action);
create table if not exists lgpd_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  consent_type varchar(40) not null check (consent_type in ('data_processing','marketing','data_sharing','analytics')),
  granted boolean not null,
  granted_at timestamptz not null default now(),
  ip_address varchar(45),
  user_agent varchar(500),
  unique (user_id, consent_type)
);
create index if not exists lgpd_user_idx on lgpd_consents(user_id);
create table if not exists trash_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  deleted_by uuid not null references users(id) on delete cascade,
  entity_type varchar(30) not null,
  entity_id uuid not null,
  snapshot jsonb not null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  restored_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trash_family_idx on trash_items(family_id, created_at desc);
create index if not exists trash_expires_idx on trash_items(expires_at) where restored_at is null;