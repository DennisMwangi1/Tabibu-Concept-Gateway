-- Seed collection registry (versions pinned when OCL releases are cut)
-- app_module values match Tabibu-Client/lib/modules.ts MODULE_REGISTRY ids.
insert into collections (id, app_module, is_core, is_optional_addon, latest_version) values
    ('tabibu-core',         null,          true,  false, null),
    ('tabibu-lab',          'laboratory',  false, false, null),
    ('tabibu-pharmacy',     'pharmacy',    false, false, null),
    ('tabibu-maternity',    'maternity',   false, false, null),
    ('tabibu-snomed-addon', null,          false, true,  null)
on conflict (id) do nothing;
