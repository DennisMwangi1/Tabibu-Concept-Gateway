-- =============================================================================
-- Auth, audit logging, and structured concept diffs
-- =============================================================================

-- Per-hospital API keys for unattended sync clients (hash only, never raw key)
alter table hospitals
  add column api_key_hash text;

-- Admin action audit trail (separate from hospital-originated sync_log)
create table admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  actor_id      uuid references auth.users(id),
  actor_email   text not null,
  action        text not null,
  target_type   text not null,
  target_id     text not null,
  metadata      jsonb not null default '{}'
);

create index ix_admin_audit_log_target on admin_audit_log (target_type, target_id);
create index ix_admin_audit_log_actor on admin_audit_log (actor_id);

-- Structured per-concept diffs for upgrade/rollout reports
alter table concept_upgrade_rollouts
  add column narrative_summary text;

create table concept_diffs (
  id              uuid primary key default gen_random_uuid(),
  rollout_id      bigint not null references concept_upgrade_rollouts(id),
  collection_id   text not null,
  from_version    text,
  to_version      text not null,
  concept_uuid    text not null,
  change_type     text not null check (change_type in ('added', 'removed', 'modified')),
  field_changes   jsonb,
  created_at      timestamptz not null default now()
);

create index ix_concept_diffs_rollout on concept_diffs (rollout_id);
create index ix_concept_diffs_concept on concept_diffs (concept_uuid);
