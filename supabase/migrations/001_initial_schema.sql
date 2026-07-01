-- =============================================================================
-- Tabibu Concept Gateway — Supabase schema
-- Migration: 001_initial_schema
-- =============================================================================

create table hospitals (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    kmhfl_code      text,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now()
);

create table hospital_app_modules (
    id              bigserial primary key,
    hospital_id     uuid not null references hospitals(id),
    app_module      text not null,
    enabled_at      timestamptz not null default now(),
    disabled_at     timestamptz,
    unique (hospital_id, app_module)
);

create table hospital_module_subscriptions (
    id                  bigserial primary key,
    hospital_id         uuid not null references hospitals(id),
    collection_id       text not null,
    pinned_version       text not null,
    auto_derived         boolean not null default true,
    subscribed_at        timestamptz not null default now(),
    unique (hospital_id, collection_id)
);

create table hospital_license_flags (
    id              bigserial primary key,
    hospital_id     uuid not null references hospitals(id),
    collection_id   text not null,
    is_licensed     boolean not null default false,
    licensed_at     timestamptz,
    expires_at      timestamptz,
    unique (hospital_id, collection_id)
);

create table collections (
    id                  text primary key,
    app_module          text,
    is_core             boolean not null default false,
    is_optional_addon   boolean not null default false,
    latest_version       text,
    created_at           timestamptz not null default now()
);

create table collection_versions (
    id                  bigserial primary key,
    collection_id       text not null references collections(id),
    version             text not null,
    ciel_version_pinned text,
    released_at          timestamptz not null default now(),
    export_cached         boolean not null default false,
    export_cache_path     text,
    unique (collection_id, version)
);

create table concept_upgrade_rollouts (
    id                  bigserial primary key,
    hospital_id         uuid not null references hospitals(id),
    collection_id        text not null references collections(id),
    from_version          text,
    to_version            text not null,
    status                text not null default 'pending',
    triggered_by          text not null,
    triggered_at           timestamptz not null default now(),
    applied_at              timestamptz,
    failure_reason           text
);

create table concept_upgrade_reports (
    id                  bigserial primary key,
    rollout_id           bigint not null references concept_upgrade_rollouts(id),
    hospital_id           uuid not null references hospitals(id),
    collection_id          text not null,
    from_version             text,
    to_version               text not null,
    changed_concepts          jsonb not null default '[]'::jsonb,
    retired_concepts          jsonb not null default '[]'::jsonb,
    generated_at              timestamptz not null default now()
);

create table sync_log (
    id              bigserial primary key,
    hospital_id     uuid not null references hospitals(id),
    event_type      text not null,
    detail          jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now()
);

create index ix_subscriptions_hospital on hospital_module_subscriptions (hospital_id);
create index ix_rollouts_status on concept_upgrade_rollouts (status);
create index ix_rollouts_hospital on concept_upgrade_rollouts (hospital_id);
create index ix_sync_log_hospital on sync_log (hospital_id, created_at);

alter table hospital_module_subscriptions enable row level security;
alter table concept_upgrade_reports enable row level security;
