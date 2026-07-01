-- =============================================================================
-- Fix: disable RLS on tables that the gateway (backend service) writes to.
--
-- The gateway is the sole writer for these tables — hospitals never query
-- Supabase directly. RLS was enabled in the initial schema but no policies
-- were defined, causing every gateway upsert to be blocked with a 42501 error
-- when the anon/publishable key is used (as opposed to the service-role key).
-- =============================================================================

alter table hospital_module_subscriptions disable row level security;
alter table concept_upgrade_reports disable row level security;
