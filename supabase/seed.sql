-- Seed collection registry (versions pinned when OCL releases are cut)
-- app_module values match Tabibu-Client/lib/modules.ts MODULE_REGISTRY ids.
-- Seeded here as a fallback; packaging:validate --sync keeps this in sync
-- automatically whenever CONCEPT_MODULES in moduleDefinitions.ts changes.
insert into collections (id, app_module, is_core, is_optional_addon, latest_version) values
    ('tabibu-core',         null,            true,  false, null),
    ('tabibu-lab',          'laboratory',    false, false, null),
    ('tabibu-pharmacy',     'pharmacy',      false, false, null),
    ('tabibu-maternity',    'maternity',     false, false, null),
    ('tabibu-imaging',      'imaging',       false, false, null),
    ('tabibu-oncology',     'oncology',      false, false, null),
    ('tabibu-rehabilitation','rehabilitation',false, false, null),
    ('tabibu-mental-health','mental-health', false, false, null)
on conflict (id) do nothing;
