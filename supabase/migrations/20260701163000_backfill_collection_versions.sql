-- Backfill collection_versions for releases cut before the table was populated.

insert into collection_versions (collection_id, version, released_at, export_cached)
select c.id, 'v1.0.1', '2026-07-01T15:20:52Z'::timestamptz, true
from collections c
where c.id in ('tabibu-core', 'tabibu-lab', 'tabibu-pharmacy', 'tabibu-maternity')
on conflict (collection_id, version) do nothing;

insert into collection_versions (collection_id, version, released_at, export_cached)
select c.id, 'v1.0.2', '2026-07-01T16:00:38Z'::timestamptz, true
from collections c
where c.id in ('tabibu-core', 'tabibu-lab', 'tabibu-pharmacy', 'tabibu-maternity')
on conflict (collection_id, version) do nothing;
