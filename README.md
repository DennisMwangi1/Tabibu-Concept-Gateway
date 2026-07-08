# Tabibu Concept Gateway

Node/TypeScript service that sits between [Open Concept Lab (OCL)](https://openconceptlab.org/) and Tabibu hospital installs. It maintains a shared clinical concept library on OCL and delivers concept bundles to each hospital based on their provisioned modules — hospitals never talk to OCL directly.

---

## How it works

```
moduleDefinitions.ts      single source of truth for all clinical modules
    └─► manifests/*.json  curated CIEL root concept IDs per module (validated by packaging:validate)
            └─► packaging CI  expands roots → full closure via OCL $cascade
                    └─► OCL collections  tabibu-core / tabibu-lab / tabibu-pharmacy / …
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
cp .env.example .env   # set VITE_GATEWAY_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm install
npm run dev            # Vite dev server on port 5173
```

Open `http://localhost:5173` — dashboard, hospital list, detail, and version management. The UI fetches module metadata from `GET /admin/modules` so the module list, labels, and chip colours are always in sync with the gateway config.

---

## Module system

### Source of truth

The module system has a clear two-layer separation:

| File | Role |
|---|---|
| `src/config/moduleDefinitions.ts` | **Pure data.** `ConceptModule` interface + `CONCEPT_MODULES` array. The only place to add or modify a module. |
| `src/config/modules.ts` | **Operational layer.** Imports from `moduleDefinitions.ts` and builds all derived lookup maps and helpers used at runtime. |

### Current modules

`tabibu-core` is always included for every hospital. Other collections are derived from provisioned app modules:

| App module | OCL collection | Contents |
|---|---|---|
| *(always)* | `tabibu-core` | Vital signs, visit diagnoses, clinical assessment structure |
| `laboratory` | `tabibu-lab` | All orderable lab tests and panels (CBC, HIV, malaria, renal, …) |
| `pharmacy` | `tabibu-pharmacy` | Drug formulary — ARVs, TB, antimalarials, antibiotics, vaccines, … |
| `maternity` | `tabibu-maternity` | ANC, obstetric history, intrapartum, postnatal care |

### Adding a new module

1. Add an entry to `src/config/moduleDefinitions.ts`
2. Create `manifests/{manifestModule}.json` with all required fields (see below)
3. Run `npm run packaging:validate` — validates the manifest and upserts the `collections` row automatically
4. Run the full packaging pipeline: `npm run packaging:run -- --version vX.Y.Z`

### Manifest format

Every entry in `CONCEPT_MODULES` must have a corresponding `manifests/{manifestModule}.json`. Manifests use a `sources` array — one entry per upstream OCL source. Each source entry declares its own roots and notes:

```json
{
  "module": "lab",
  "description": "Human-readable description of the module's concept scope.",
  "sources": [
    {
      "source_org": "CIEL",
      "source_id": "CIEL",
      "roots": ["1271"],
      "notes": {
        "1271": "Tests ordered (ConvSet) — CIEL's top-level root for all orderable investigations."
      }
    }
  ]
}
```

A module can pull from multiple sources (e.g. CIEL + PIH). The packaging pipeline unions closures from all source entries and de-duplicates cross-source SAME-AS pairs automatically:

```json
{
  "module": "hiv",
  "description": "...",
  "sources": [
    {
      "source_org": "CIEL",
      "source_id": "CIEL",
      "roots": ["5356"],
      "notes": { "5356": "..." }
    },
    {
      "source_org": "PIH",
      "source_id": "PIH",
      "roots": ["6042"],
      "notes": { "6042": "PHQ-9 depression screening (PIH ConvSet)" }
    }
  ]
}
```

| Field | Requirement |
|---|---|
| `module` | Must match the filename (without `.json`) |
| `description` | Non-empty string |
| `sources` | Non-empty array of source entries |
| `sources[].source_org` | Non-empty string — OCL org (e.g. `CIEL`, `PIH`) |
| `sources[].source_id` | OCL source short code within that org (defaults to `source_org`) |
| `sources[].roots` | Non-empty array of concept IDs within that source |
| `sources[].notes` | Object whose keys are exactly the set of `roots` IDs (every root annotated, no orphans) |

---

## Hospital sync API

Called by the Go sync client inside each hospital install. Every request must authenticate with that hospital's API key — a key only works for the hospital it was issued to.

### Authentication

When a hospital is registered (or its key is rotated) in the admin UI, the gateway returns a **one-time** API key. Store it in the hospital's environment — the gateway only keeps a SHA-256 hash.

All three sync endpoints require:

```
Authorization: Bearer <hospital-api-key>
```

The middleware hashes the bearer token and compares it to `hospitals.api_key_hash` for the `:id` in the URL. A key for hospital A cannot access hospital B's routes.

**Configure the Go sync client** with the key and gateway base URL, e.g.:

```bash
TABIBU_GATEWAY_URL=https://api.yourdomain.com
TABIBU_GATEWAY_API_KEY=<key-from-admin-ui>
```

The client should send the key on every call:

| Endpoint | Method | Purpose |
|---|---|---|
| `/hospitals/:id/bundle` | GET | Fetch the concept bundle |
| `/hospitals/:id/bundle-applied` | POST | Report apply success or failure |
| `/hospitals/:id/subscriptions` | GET | List provisioned modules and pinned versions |

If a key is lost or compromised, use **Rotate key** on the hospital detail page in the admin UI. The old key stops working immediately.

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
    "concept_collections": [...],
    "generatedAt": "2026-07-01T13:57:00.000Z"
  }
}
```

The hospital upserts these tables in order: `concept_classes` → `concept_datatypes` → `concept_reference_sources` → `concepts` → names/descriptions/numerics/**collections** → answers/sets → reference maps.

`concept_collections` records which OCL collection(s) each concept was sourced from (`concept_uuid`, `collection_id`). A concept shared across modules and promoted to `tabibu-core` gets one row per collection it appears in — this is what lets the hospital app tell which module a concept belongs to, and prune a module's concepts cleanly if it's ever deprovisioned.

---

### `POST /hospitals/:id/bundle-applied`

Hospital reports whether it successfully applied the bundle. Marks any pending upgrade rollouts as `applied` or `failed`.

**Body (success):**
```json
{
  "collections": [
    { "id": "tabibu-core", "version": "v1.0.2" },
    { "id": "tabibu-lab",  "version": "v1.0.2" }
  ]
}
```

`success: true` is optional on success — if omitted and no `failureReason` is present, the gateway records `bundle_applied`.

**Body (failure):**
```json
{
  "success": false,
  "failureReason": "concept upsert failed: duplicate key",
  "collections": [
    { "id": "tabibu-core", "version": "v1.0.2" }
  ]
}
```

Both outcomes are written to `sync_log`. Pending upgrade rollouts matching the reported collection versions are marked `applied` or `failed`.

---

### `GET /hospitals/:id/subscriptions`

Returns which app modules and OCL collections the hospital is subscribed to.

---

## Admin API

All admin endpoints require a valid Supabase session. The admin UI sends:

```
Authorization: Bearer <supabase_access_token>
```

The gateway verifies the token with `supabase.auth.getUser()` using the service role key. Public signup should be disabled in Supabase — invite admin users via the dashboard or `auth.admin.inviteUserByEmail()`.

### Modules

| Method | Path | Description |
|---|---|---|
| GET | `/admin/modules` | Module catalog — labels, descriptions, chip colours for all provisionable modules |

The admin UI calls this on startup to populate module pickers and chips. Adding a module to `moduleDefinitions.ts` is all that is needed for the UI to pick it up.

### Hospitals

| Method | Path | Description |
|---|---|---|
| GET | `/admin/hospitals` | List all hospitals with module counts and subscriptions |
| POST | `/admin/hospitals` | Register a new hospital (returns one-time API key) |
| GET | `/admin/hospitals/:id` | Full hospital detail — modules, subscriptions, sync log |
| PATCH | `/admin/hospitals/:id` | Update name, KMHFL code, or active status |
| POST | `/admin/hospitals/:id/rotate-key` | Rotate hospital sync API key (returns new key once) |
| POST | `/admin/hospitals/:id/modules` | Add an app module |
| DELETE | `/admin/hospitals/:id/modules/:module` | Remove an app module |

### Upgrades

| Method | Path | Description |
|---|---|---|
| POST | `/admin/hospitals/:id/upgrade` | Upgrade one collection to a specific version |
| POST | `/admin/hospitals/:id/upgrade-all` | Upgrade all subscriptions to next available version |
| GET | `/admin/hospitals/:id/reports` | List upgrade diff reports |
| GET | `/admin/hospitals/:id/reports/:rolloutId` | Narrative upgrade summary (cached or generated) |
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
| GET | `/admin/collections/:id/versions` | All released versions for a collection |
| GET | `/admin/packaging/status` | OCL export readiness per collection |

### Registering a hospital (via API)

Requires a signed-in admin session token:

```bash
curl -X POST http://localhost:3100/admin/hospitals \
  -H "Authorization: Bearer <supabase-access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nyabondo District Hospital",
    "kmhfl_code": "KE-0042",
    "modules": ["laboratory", "pharmacy"]
  }'
```

The response includes `api_key` — save it for the hospital's Go sync client. It is not returned again.

KMHFL codes must be unique. Subscriptions for the provisioned modules are created automatically, pinned to `collections.latest_version`.

---

## Packaging — updating the concept library

### All-in-one (recommended)

```bash
npm run packaging:run -- --version v1.1.0
```

Runs the full pipeline in order, failing fast on any step:

| Step | Command | What it does |
|---|---|---|
| 1 | `packaging:validate` | Validates every module manifest; syncs `collections` table |
| 2 | `packaging:closure` | Computes dependency closure via OCL `$cascade`; detects core leaks |
| 3 | `packaging:update-refs` | Pushes frozen concept references to OCL collections |
| 4 | `packaging:release` | Cuts versioned OCL releases, pre-warms export ZIPs, updates Supabase |

### Individual steps

#### 0. Validate module manifests

```bash
npm run packaging:validate           # validate + sync collections table
npm run packaging:validate -- --dry-run  # validate only, no DB write
```

Checks every entry in `CONCEPT_MODULES` against its manifest file. Fails fast with a clear error if:
- A manifest file is missing
- Any required field (`module`, `description`, `sources`, per-source `source_org`, `roots`, `notes`) is absent or empty
- A source entry's `roots` is an empty array
- A source entry's `notes` keys do not exactly match its `roots` (missing annotation or orphan key)

Also warns on any manifest files that have no corresponding `CONCEPT_MODULES` entry.

On success, upserts the `collections` table so the gateway DB stays in sync with the module config. Requires `SUPABASE_SERVICE_ROLE_KEY`; skips the DB write with a warning if absent.

#### 1. Validate closures + leak detection

```bash
npm run packaging:closure
```

Loads `manifests/*.json`, calls OCL `$cascade` for each root concept ID, builds the full dependency graph, and runs two checks:

- **Core split** — concepts appearing in ≥2 module closures are promoted to `tabibu-core`; the rest remain module-specific
- **Leak detection** — if a core concept directly references a module-only concept via Q-AND-A or CONCEPT-SET, that is a *leak* — a hospital without that module would receive an incomplete answer set

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

Pushes the computed concept sets to OCL collections as declarative references with `cascade=sourcetoconcepts`. Clears existing references first (OCL does not update cascade mode on existing refs).

#### 3. Release a version

```bash
npm run packaging:release                     # cuts v1.0.0
npm run packaging:release -- --version v1.1.0 # cuts a specific version
```

Cuts a released version on every OCL collection, pre-warms export ZIPs (polls until ready — large collections can take several minutes), then writes directly to Supabase:
- `collections.latest_version` updated for all collections
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

# 4. Sync collections table to current module config
npm run packaging:validate
```

> **Note:** `seed.sql` is a fallback for first-time setup. After that, `packaging:validate` is the authoritative way to keep the `collections` table in sync with `moduleDefinitions.ts`.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No (default 3100) | HTTP port |
| `SUPABASE_URL` | Yes | Gateway Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable key — used by the runtime gateway (respects RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Admin auth verification; required for `packaging:validate` (sync), `packaging:release` |
| `OCL_BASE_URL` | No (default OCL public) | Override to point at a self-hosted OCL deployment |
| `OCL_ORG` | Yes | OCL organisation name (e.g. `Tabibu`) |
| `OCL_API_TOKEN` | Packaging CI only | Required for authoring/curation writes; read-only bundle fetching works without it |
| `BUNDLE_CACHE_DIR` | No (default `.cache/bundles`) | Filesystem cache for OCL export ZIPs |
| `ADMIN_CORS_ORIGINS` | No (default `http://localhost:5173`) | Comma-separated browser origins allowed to call admin endpoints |
| `OPS_API_KEY` | Yes | Shared secret for ops rollout endpoints |
| `LLM_API_KEY` | No | When set, upgrade narrative reports use an LLM; otherwise a text summary is generated |

### Admin UI environment (`admin/.env`)

| Variable | Description |
|---|---|
| `VITE_GATEWAY_URL` | Gateway base URL (e.g. `http://localhost:3100`) |
| `VITE_SUPABASE_URL` | Supabase project URL (same project as the gateway) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key for browser auth |

---

## Self-hosted OCL

Set `OCL_BASE_URL` and `OCL_ORG` to your self-hosted deployment — no code changes needed.
