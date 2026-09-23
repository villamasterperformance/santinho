-- Santinho / Oscar Silva campaign backend schema (PostgreSQL / Neon)

create extension if not exists pgcrypto;

create table if not exists membros (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  telefone text unique not null,
  email text,
  instagram text,
  foto_url text,
  cidade text,
  papel text not null check (papel in ('convidado', 'lider')),
  -- No FK: root referrer is the virtual candidate slug (e.g. "val"), never a real membros row.
  indicador_slug text,
  grupo_slug text,
  token text not null,
  senha_hash text,
  dispositivo_id text,
  pontos integer not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists idx_membros_indicador_slug on membros(indicador_slug);
create index if not exists idx_membros_telefone on membros(telefone);

create table if not exists otp_codigos (
  id uuid primary key default gen_random_uuid(),
  telefone text not null,
  codigo text not null,
  papel text not null,
  expira_em timestamptz not null,
  usado boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists idx_otp_telefone on otp_codigos(telefone);

create table if not exists missoes (
  id uuid primary key default gen_random_uuid(),
  ordem integer not null default 0,
  titulo text not null,
  texto text not null default '',
  link_url text,
  link_rotulo text,
  pede_link boolean not null default false,
  pontos integer not null default 0,
  criado_em timestamptz not null default now()
);

create table if not exists missoes_concluidas (
  membro_id uuid not null references membros(id) on delete cascade,
  missao_id uuid not null references missoes(id) on delete cascade,
  concluida_em timestamptz not null default now(),
  link text,
  primary key (membro_id, missao_id)
);

create table if not exists contatos_importados (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references membros(id) on delete cascade,
  nome text not null,
  telefone text not null,
  email text,
  origem text,
  consent_versao text,
  criado_em timestamptz not null default now(),
  unique (membro_id, telefone)
);

create index if not exists idx_contatos_importados_membro_id on contatos_importados(membro_id);

create table if not exists contatos_import_codigos (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references membros(id) on delete cascade,
  codigo text unique not null,
  consent_versao text,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now()
);

create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  telefone text unique not null,
  nome text,
  email text unique,
  senha_hash text not null,
  token text,
  tentativas_erradas integer not null default 0,
  bloqueado_ate timestamptz,
  criado_em timestamptz not null default now()
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references membros(id) on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_membro_id on push_subscriptions(membro_id);

create table if not exists cidade_coords (
  cidade text primary key,
  lat double precision,
  lng double precision,
  criado_em timestamptz not null default now()
);

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  quando timestamptz,
  local text,
  foto_url text,
  tem_confirmacao boolean not null default true,
  tem_checkin boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists admin_log (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  admin_email text,
  acao text not null,
  alvo_tipo text,
  alvo_id text,
  alvo_nome text,
  alvo_telefone text,
  detalhes jsonb
);

create index if not exists idx_admin_log_criado_em on admin_log(criado_em desc);

create table if not exists evento_confirmacoes (
  evento_id uuid not null references eventos(id) on delete cascade,
  membro_id uuid not null references membros(id) on delete cascade,
  confirmado boolean not null default true,
  checkin_em timestamptz,
  criado_em timestamptz not null default now(),
  primary key (evento_id, membro_id)
);
