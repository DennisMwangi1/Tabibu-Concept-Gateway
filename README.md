# Tabibu Concept Gateway

Node/TypeScript service that sits between [Open Concept Lab (OCL)](https://openconceptlab.org/) and Tabibu hospital installs. It maintains a shared clinical concept library on OCL and delivers concept bundles to each hospital based on their provisioned modules — hospitals never talk to OCL directly.

---

## How it works

```
CIEL (global standard terminology)
    └─► manifests/*.json         curated ConvSet root IDs per clinical domain
            └─► packaging CI     expands roots → full closure via OCL $cascade
                    └─► OCL collections  tabibu-core / lab / pharmacy / maternity
                                └─► gateway  fetches exports, transforms, caches
                                        └─► hospital  upserts concept_* tables
```

**Two separate pipelines:**

| Pipeline | When | Command |
|---|---|---|
| **Packaging** | When manifests change or a new release is cut | `npm run packaging:*` |
| **Sync** | Every time a hospital pulls a bundle | `GET /hospitals/:id/bundle` |

---

## Running locally

```bash
cp .env.example .env   # fill in Supabase + OCL credentials
npm install
npm run dev            # hot-reload gateway on port 3100
```

```bash
curl http://localhost:3100/health   # {"status":"ok"}
curl http://localhost:3100/ready    # {"status":"ready","checks":{"supabase":"ok","ocl":"ok"}}
```

### Admin UI

```bash
cd admin
cp .env.example .env   # set VITE_GATEWAY_URL and VITE_ADMIN_API_KEY
npm install
npm run dev            # Vite dev server on port 5173
```

Open `http://localhost:5173` — dashboard, hospital list, detail, and version management.

---

## Module → collection mapping

`tabibu-core` is always included. Other collections are derived from provisioned app modules:

| App module | OCL collection | Contents |
|---|---|---|
| *(always)* | `tabibu-core` | Vital signs, visit diagnoses, clinical assessment structure |
| `laboratory` | `tabibu-lab` | All orderable lab tests and panels (CBC, HIV, malaria, renal, …) |
| `pharmacy` | `tabibu-pharmacy` | Drug formulary — ARVs, TB, antimalarials, antibiotics, vaccines, … |
| `maternity` | `tabibu-maternity` | ANC, obstetric history, intrapartum, postnatal care |

Mapping lives in `src/config/modules.ts`.

---

## Hospital sync API

Called by the Go sync client inside each hospital install. No authentication required.

### `GET /hospitals/:id/bundle`

Returns the full concept bundle for a hospital based on its provisioned app modules.

**What it does:**
1. Ensures collection subscriptions exist for the hospital's active modules
2. Fetches the pinned version export for each collection from OCL (cached locally)
3. Transforms OCL concepts → `TabibuConceptBundle` shape (English names only)
4. Enriches `concept_answers` by fetching Q-AND-A mappings from OCL for coded concepts
5. Merges all collections, deduplicates, logs to `sync_log`

**Response:**
```json
{
  "bundle": {
    "schemaVersion": "1",
    "collections": [
      { "id": "tabibu-core", "version": "v1.0.2" },
      { "id": "tabibu-lab",  "version": "v1.0.2" }
    ],
    "concepts": [...],
    "concept_names": [...],
    "concept_classes": [...],
    "concept_datatypes": [...],
    "concept_reference_sources": [...],
    "concept_descriptions": [...],
    "concept_numerics": [...],
    "concept_answers": [...],
    "concept_sets": [...],
    "concept_reference_terms": [...],
    "concept_reference_maps": [...],
    "generatedAt": "2026-07-01T13:57:00.000Z"
  }
}
```

The hospital upserts these tables in order: `concept_classes` → `concept_datatypes` → `concept_reference_sources` → `concepts` → names/descriptions/numerics → answers/sets → reference maps.

---

### `POST /hospitals/:id/bundle-applied`

Hospital reports whether it successfully applied the bundle. Marks any pending upgrade rollouts as `applied` or `failed`.

**Body:**
```json
{
  "success": true,
  "collections": [
    { "id": "tabibu-core", "version": "v1.0.2" },
    { "id": "tabibu-lab",  "version": "v1.0.2" }
  ]
}
```

On failure, include `"failureReason": "..."`. Both outcomes are written to `sync_log`.

---

### `GET /hospitals/:id/subscriptions`

Returns which app modules and OCL collections the hospital is subscribed to.

---

## Admin API

All admin endpoints require the `x-admin-api-key` header.

```
x-admin-api-key: <ADMIN_API_KEY from .env>
```

### Hospitals

| Method | Path | Description |
|---|---|---|
| GET | `/admin/hospitals` | List all hospitals with module counts and subscriptions |
| POST | `/admin/hospitals` | Register a new hospital (optionally provision modules) |
| GET | `/admin/hospitals/:id` | Full hospital detail — modules, subscriptions, sync log |
| PATCH | `/admin/hospitals/:id` | Update name, KMHFL code, or active status |
| POST | `/admin/hospitals/:id/modules` | Add an app module |
| DELETE | `/admin/hospitals/:id/modules/:module` | Remove an app module |

### Upgrades

| Method | Path | Description |
|---|---|---|
| POST | `/admin/hospitals/:id/upgrade` | Upgrade one collection to a specific version |
| POST | `/admin/hospitals/:id/upgrade-all` | Upgrade all subscriptions to next available version |
| GET | `/admin/hospitals/:id/reports` | List upgrade diff reports |
| GET | `/admin/hospitals/:id/sync-log` | Recent sync events |

**How upgrades work:**
1. A `concept_upgrade_rollouts` row is created (`status: pending`)
2. A diff report is generated comparing old and new OCL exports
3. `hospital_module_subscriptions.pinned_version` is updated immediately
4. The hospital receives the new bundle on its next `GET /bundle` call
5. When the hospital calls `POST /bundle-applied`, the rollout is marked `applied`

**Rollbacks** work the same way — select an older version from the dropdown. The pin is updated immediately and the hospital reverts on next sync.

### Collections

| Method | Path | Description |
|---|---|---|
| GET | `/admin/collections` | List all collections with latest versions |
| GET | `/admin/collections/:id/versions` | All released versions for a collection (used for dropdowns) |
| GET | `/admin/packaging/status` | OCL export readiness per collection |

### Registering a hospital (via API)

```bash
curl -X POST http://localhost:3100/admin/hospitals \
  -H "x-admin-api-key: tabibu-admin-dev-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nyabondo District Hospital",
    "kmhfl_code": "KE-0042",
    "modules": ["laboratory", "pharmacy"]
  }'
```

KMHFL codes must be unique. Subscriptions for the provisioned modules are created automatically, pinned to `collections.latest_version`.

---

## Packaging — updating the concept library

### All-in-one (recommended)

```bash
npm run packaging:run -- --version v1.1.0
```

Runs the full pipeline in order, failing fast on any step:

1. **Closure + leak detection** — validates manifests and dependency graph
2. **Push references** — updates OCL collections (`cascade=sourcetoconcepts`, clears old refs first)
3. **Release + pre-warm** — cuts versions on OCL, polls until each export ZIP is ready, then updates Supabase directly

### Individual steps

#### 1. Validate closures + leak detection

```bash
npm run packaging:closure
```

Loads `manifests/*.json`, calls OCL `$cascade` for each root concept ID, builds the full dependency graph, and runs two checks:

- **Core split** — concepts appearing in ≥2 module closures are promoted to `tabibu-core`; the rest remain module-specific
- **Leak detection** — walks every Q-AND-A / CONCEPT-SET edge in the graph; if a core concept directly references a module-only concept, that is a *leak* — a hospital without that module would receive an incomplete answer set

Exits non-zero on any violation.

**Handling a leak failure:**

```bash
npm run packaging:fix-leaks   # patches manifests/core.json automatically
npm run packaging:closure     # re-run to confirm clean
```

#### 2. Push references to OCL

```bash
npm run packaging:update-refs
```

Pushes the computed concept sets to the OCL collections as declarative references with `cascade=sourcetoconcepts`. Clears existing references first (OCL does not update cascade mode on existing refs).

#### 3. Release a version

```bash
npm run packaging:release                     # cuts v1.0.0
npm run packaging:release -- --version v1.1.0 # cuts a specific version
```

Cuts a released version on every OCL collection, pre-warms OCL export ZIPs (polls until ready — large collections can take several minutes), then writes directly to Supabase:
- `collections.latest_version` updated for all four collections
- A row inserted into `collection_versions` for each (powers the admin version dropdowns)

Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

---

## Supabase setup (first time)

Run in order against your Supabase project:

```bash
# 1. Create tables
#    Paste supabase/migrations/001_initial_schema.sql into the SQL editor

# 2. Seed collection registry
#    Paste supabase/seed.sql

# 3. Apply any pending migrations in supabase/migrations/
#    (unique KMHFL index, RLS fixes, backfill migrations)
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No (default 3100) | HTTP port |
| `SUPABASE_URL` | Yes | Gateway Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key — used by the runtime gateway (respects RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Packaging CI only | Bypasses RLS for version writes; required for `packaging:release` |
| `OCL_BASE_URL` | No (default OCL public) | Override to point at a self-hosted OCL deployment |
| `OCL_ORG` | Yes | OCL organisation name (e.g. `Tabibu`) |
| `OCL_API_TOKEN` | Packaging CI only | Required for authoring/curation writes; read-only bundle fetching works without it |
| `BUNDLE_CACHE_DIR` | No (default `.cache/bundles`) | Filesystem cache for OCL export ZIPs |
| `ADMIN_API_KEY` | Yes | Shared secret for all `/admin/*` endpoints |
| `ADMIN_CORS_ORIGINS` | No (default `http://localhost:5173`) | Comma-separated browser origins allowed to call admin endpoints |
| `OPS_API_KEY` | Yes | Shared secret for ops rollout endpoints |

### Admin UI environment (`admin/.env`)

| Variable | Description |
|---|---|
| `VITE_GATEWAY_URL` | Gateway base URL (e.g. `http://localhost:3100`) |
| `VITE_ADMIN_API_KEY` | Must match `ADMIN_API_KEY` on the gateway |

---

## Self-hosted OCL

Set `OCL_BASE_URL` and `OCL_ORG` to your self-hosted deployment — no code changes needed.

---

## SNOMED add-on

`manifests/snomed-addon.json` exists but is empty until a SNOMED CT licence is in place. The `tabibu-snomed-addon` collection is registered in the seed but has no concepts.
