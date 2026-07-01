-- Remove duplicate hospitals sharing kmhfl_code KE-0032578, then enforce uniqueness.

delete from concept_upgrade_reports
where hospital_id in (
    '531239b2-0fcf-4516-9a9d-ace5dc45dbb3',
    'de831882-8d17-4ab1-b645-9d41dce7f81b'
);

delete from concept_upgrade_rollouts
where hospital_id in (
    '531239b2-0fcf-4516-9a9d-ace5dc45dbb3',
    'de831882-8d17-4ab1-b645-9d41dce7f81b'
);

delete from sync_log
where hospital_id in (
    '531239b2-0fcf-4516-9a9d-ace5dc45dbb3',
    'de831882-8d17-4ab1-b645-9d41dce7f81b'
);

delete from hospital_module_subscriptions
where hospital_id in (
    '531239b2-0fcf-4516-9a9d-ace5dc45dbb3',
    'de831882-8d17-4ab1-b645-9d41dce7f81b'
);

delete from hospital_license_flags
where hospital_id in (
    '531239b2-0fcf-4516-9a9d-ace5dc45dbb3',
    'de831882-8d17-4ab1-b645-9d41dce7f81b'
);

delete from hospital_app_modules
where hospital_id in (
    '531239b2-0fcf-4516-9a9d-ace5dc45dbb3',
    'de831882-8d17-4ab1-b645-9d41dce7f81b'
);

delete from hospitals
where id in (
    '531239b2-0fcf-4516-9a9d-ace5dc45dbb3',
    'de831882-8d17-4ab1-b645-9d41dce7f81b'
);

-- Allow multiple hospitals without a KMHFL code; enforce uniqueness when set.
create unique index hospitals_kmhfl_code_unique
    on hospitals (kmhfl_code)
    where kmhfl_code is not null;
