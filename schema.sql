-- Santinho / Oscar Silva campaign backend schema (PostgreSQL / Neon)

create extension if not exists pgcrypto;

create table if not exists membros (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  telefone text unique not null,
  cidade text,
  papel text not null check (papel in ('convidado', 'lider')),
  -- No FK: root referrer is the virtual candidate slug (e.g. "val"), never a real membros row.
  indicador_slug text,
  grupo_slug text,
  token text not null,
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
