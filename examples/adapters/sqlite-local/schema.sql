create table if not exists nodeagent_jobs (
  job_id text primary key,
  frame_id text not null,
  status text not null,
  attempts integer not null default 0,
  priority integer not null default 0,
  run_after integer not null,
  cursor text,
  receipt_ref text,
  error text,
  created_at integer not null,
  updated_at integer not null,
  completed_at integer,
  blocked_at integer,
  failed_at integer
);

create table if not exists nodeagent_frames (
  frame_id text primary key,
  frame_json text not null,
  status text not null,
  evidence_json text,
  receipt_ref text,
  created_at integer not null,
  updated_at integer not null
);

create table if not exists nodeagent_leases (
  resource_id text primary key,
  lease_id text not null,
  holder_id text not null,
  acquired_at integer not null,
  expires_at integer not null,
  fencing_token integer not null
);

create table if not exists nodeagent_journal (
  key text primary key,
  job_id text not null,
  frame_id text not null,
  step text not null,
  attempt integer not null,
  status text not null,
  receipt_ref text,
  error text,
  created_at integer not null
);

create table if not exists nodeagent_artifacts (
  artifact_id text primary key,
  kind text not null,
  value_json text not null,
  created_at integer not null
);

create index if not exists idx_nodeagent_jobs_runnable
  on nodeagent_jobs(status, run_after, priority);
