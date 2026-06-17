create schema if not exists nodeagent;

create table if not exists nodeagent.jobs (
  job_id text primary key,
  frame_id text not null,
  status text not null,
  attempts integer not null default 0,
  priority integer not null default 0,
  run_after bigint not null,
  cursor text,
  receipt_ref text,
  error text,
  created_at bigint not null,
  updated_at bigint not null,
  completed_at bigint,
  blocked_at bigint,
  failed_at bigint
);

create table if not exists nodeagent.frames (
  frame_id text primary key,
  frame_json jsonb not null,
  status text not null,
  evidence_json jsonb,
  receipt_ref text,
  created_at bigint not null,
  updated_at bigint not null
);

create table if not exists nodeagent.leases (
  resource_id text primary key,
  lease_id text not null,
  holder_id text not null,
  acquired_at bigint not null,
  expires_at bigint not null,
  fencing_token bigint not null
);

create table if not exists nodeagent.journal (
  key text primary key,
  job_id text not null,
  frame_id text not null,
  step text not null,
  attempt integer not null,
  status text not null,
  receipt_ref text,
  error text,
  created_at bigint not null
);

create table if not exists nodeagent.artifacts (
  artifact_id text primary key,
  kind text not null,
  value_json jsonb not null,
  created_at bigint not null
);

create index if not exists idx_nodeagent_jobs_runnable
  on nodeagent.jobs(status, run_after, priority desc, created_at);
