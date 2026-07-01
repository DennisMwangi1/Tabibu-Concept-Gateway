# Tabibu Concept Gateway — Folder Guide

A walkthrough of every directory and file in `tabibu-concept-gateway/`: what it owns, when it runs, and how it connects to OCL, Supabase, and hospital `concept_*` tables.

---

## How the pieces fit together

```
┌─────────────┐     ┌──────────────────────────────────────┐     ┌─────────────────────┐
│  manifests/ │     │           tabibu-concept-gateway      │     │  Tabibu-Server      │
│  (curated   │────►│  packaging-ci/  →  OCL collections   │     │  tabibu_schema.sql  │
│   roots)    │     │  src/           →  bundle API         │────►│  concept_* tables   │
└─────────────┘     │  supabase/      →  hospital registry  │     │  (Go sync client)   │
                    └──────────────────────────────────────┘     └─────────────────────┘
                              ▲              ▲
                              │              │
                    OCL public instance   Supabase (gateway DB)
                         (upstream)
```

**Two distinct pipelines:**

| Pipeline | Where | When | Purpose |
|---|---|---|---|
| **Packaging (Pass 1)** | `manifests/`, `packaging-ci/`, `src/packaging/` | CI / manual, infrequent | Decide which concepts belong in which OCL collection |
| **Sync (Pass 2)** | `src/` runtime (`bundles/`, `subscriptions/`, `routes/`) | Every hospital sync | Fetch OCL exports, transform, deliver to hospital |

---

## Root-level files

| File | Purpose |
|---|---|
| `package.json` | Node project manifest, npm scripts, dependencies |
| `tsconfig.json` | TypeScript compiler options (`src/` + `packaging-ci/`) |
| `vitest.config.ts` | Test runner config; injects fake env vars for unit tests |
| `.env.example` | Template for required environment variables |
| `.gitignore` | Ignores `node_modules/`, `dist/`, `.cache/`, `.env` |
| `Dockerfile` | Multi-stage build → production container on port 3100 |
| `README.md` | Quick start, API summary, OCL deployment checklist |

### npm scripts

| Script | Entry point | What it does |
|---|---|---|
| `npm run dev` | `src/index.ts` | Hot-reload Express server via `tsx watch` |
| `npm run build` | `tsc` | Compiles to `dist/` |
| `npm start` | `dist/src/index.js` | Production server |
| `npm test` | `vitest run` | Unit tests in `test/` |
| `npm run packaging:closure` | `packaging-ci/runClosure.ts` | Module closure CI check against live OCL |

---

## `src/` — Runtime application

The live HTTP service. This is what runs in Docker / `npm run dev`. Hospitals and ops tools talk to code here — never to OCL directly from the hospital side.

### `src/index.ts`

Application bootstrap:

- Creates the Express app
- Registers middleware (JSON body parser, request logging)
- Mounts route modules
- Starts the daily OCL poll job (non-test environments)
- Global error handler (`AppError` → HTTP status, everything else → 500)

**Currently mounted routes:** `healthRoutes`, `hospitalRoutes`
**Not mounted (deferred):** `opsRoutes` (upgrade rollouts)

---

### `src/config/` — Environment and shared configuration

| File | Role |
|---|---|
| `env.ts` | Loads `.env`, validates all required vars with Zod (`PORT`, Supabase keys, OCL URL/token, cache dir, ops key). Throws on startup if misconfigured. |
| `supabase.ts` | Factory for the Supabase JS client using the **service role key** (bypasses RLS). Singleton via `getSupabase()`. |
| `modules.ts` | **Single source of truth** for app-module → OCL-collection mapping. Defines `tabibu-core` (always), `laboratory` → `tabibu-lab`, `pharmacy` → `tabibu-pharmacy`, etc. Also lists all Tabibu UI module IDs for reference. |

Nothing in `config/` handles HTTP requests — it only provides validated settings and lookup tables used everywhere else.

---

### `src/ocl/` — Open Concept Lab communication

The only part of the runtime that speaks OCL's API. If OCL's export or cascade endpoints change, fixes go here.

| File | Role |
|---|---|
| `client.ts` | Axios instance pointed at `OCL_BASE_URL` with `Authorization: Token …` header. |
| `types.ts` | Zod schemas and TypeScript types for OCL export payloads (concepts, mappings). |
| `exportFetcher.ts` | **`fetchCollectionExport`** — downloads a released collection version as a ZIP, extracts JSON, polls on HTTP 202 until ready. **`fetchCascade`** — calls OCL `$cascade` for dependency closure (used by packaging, not hospital sync). |

---

### `src/bundles/` — Bundle assembly and schema transformation

Turns OCL exports into the shape hospital Postgres expects (`Tabibu-Server/tabibu_schema.sql` `concept_*` tables).

| File | Role |
|---|---|
| `tabibuSchema.ts` | TypeScript interfaces for every `concept_*` table row shape the hospital sync client will upsert. Defines `TabibuConceptBundle` — the contract between gateway and Go client. |
| `transformOclExport.ts` | Maps raw OCL export JSON → `TabibuConceptBundle`. Handles naming variations (`concept_class` vs `class`, etc.). **`mergeTabibuBundles`** deduplicates when combining core + lab + pharmacy. |
| `buildBundle.ts` | **`buildBundleForHospital(hospitalId)`** — orchestrates the sync path: look up subscriptions → fetch/cache each collection export → transform → merge → return. |
| `bundleCache.ts` | Filesystem cache keyed by `collection@version` under `BUNDLE_CACHE_DIR`. Avoids re-downloading identical OCL exports across hospitals on the same version. |

**Apply order on the hospital side** (documented in `tabibuSchema.ts`):

1. `concept_classes`, `concept_datatypes`
2. `concept_reference_sources`
3. `concepts`
4. `concept_names`, `concept_descriptions`, `concept_numerics`
5. (mappings implied by UUID references in answers, sets, maps)

---

### `src/subscriptions/` — Per-hospital module → collection mapping

Answers: *"Which OCL collections should this hospital receive?"*

| File | Role |
|---|---|
| `deriveSubscriptions.ts` | Reads `hospital_app_modules` from Supabase, maps each enabled app module to its OCL collection via `config/modules.ts`, always includes `tabibu-core`, upserts rows into `hospital_module_subscriptions` pinned to `collections.latest_version`. |
| `licenseGate.ts` | Checks `hospital_license_flags` for optional add-ons (e.g. SNOMED). Validates `is_licensed` and `expires_at`. |
| `service.ts` | Higher-level helpers: `getSubscribedCollectionsWithAddons`, `listHospitalSubscriptions`, `syncHospitalSubscriptions`. Used by `buildBundle.ts`. |

Subscriptions are **auto-derived** — when Nexus provisions `laboratory` for a hospital, the gateway adds `tabibu-lab` without a separate admin action.

---

### `src/routes/` — HTTP API surface

| File | Mounted? | Endpoints | Audience |
|---|---|---|---|
| `healthRoutes.ts` | Yes | `GET /health`, `GET /ready` | Load balancers, deploy scripts |
| `hospitalRoutes.ts` | Yes | `GET /hospitals/:id/bundle`, `POST …/bundle-applied`, `GET …/subscriptions` | Hospital Go sync client |
| `opsRoutes.ts` | **No (deferred)** | `POST/GET /ops/hospitals/:id/rollouts` | Nexus ops — staged upgrades |

**`healthRoutes.ts`** — `/health` is a simple liveness probe. `/ready` checks Supabase (`collections` table) and OCL (`/orgs/Tabibu/`) and returns 503 if either is down.

**`hospitalRoutes.ts`** — The v1 sync contract. No upgrade rollout required: any provisioned hospital can pull its bundle immediately.

**`opsRoutes.ts`** — Scaffolded for Phase 3 (upgrade orchestration). Requires `x-ops-api-key` header. Not imported in `index.ts` until you need staged rollouts.

---

### `src/packaging/` — Module sorting logic (shared with CI)

Logic for **Pass 1** (deciding what belongs in which OCL collection). Imported by `packaging-ci/runClosure.ts`; not used on the hot hospital-sync path.

| File | Role |
|---|---|
| `manifest.ts` | Loads and validates `manifests/*.json` (module name + root concept IDs). |
| `closure.ts` | **`computeClosure`** — calls OCL `$cascade` from root IDs. **`computeCoreSplit`** — finds concepts shared across ≥2 modules (core) vs module-only content. |
| `coreSplit.ts` | Re-export of `computeCoreSplit` / `expandSharedCore` for plan-doc parity. |
| `leakDetection.ts` | Verifies core concepts don't reference module-only concepts upward. Currently a stub returning no violations until wired to full mapping graph. |

---

### `src/upgrades/` — Upgrade orchestration (deferred)

All scaffolded for future staged rollouts; **not active in v1**.

| File | Role |
|---|---|
| `rolloutService.ts` | CRUD on `concept_upgrade_rollouts` — pending/applied/failed status per hospital. |
| `diffReport.ts` | Compares two OCL collection version exports → changed + retired concept lists. |
| `reportService.ts` | Persists and lists `concept_upgrade_reports` for hospital admin UI. |

When enabled, flow is: ops triggers rollout → hospital polls pending bundle → applies → report surfaced. Replaced in v1 by direct `GET /bundle`.

---

### `src/jobs/` — Background tasks

| File | Role |
|---|---|
| `pollOclReleases.ts` | Cron job (daily 02:00) that checks Supabase `collections` for rows missing `latest_version`. Logs which collections need pinning after an OCL release. Full auto-pin logic deferred. |

---

### `src/lib/` — Shared utilities

| File | Role |
|---|---|
| `logger.ts` | Pino logger instance, level from `LOG_LEVEL` env. |
| `errors.ts` | `AppError`, `NotFoundError`, `UnauthorizedError` — typed HTTP errors for the Express error handler. |

---

## `manifests/` — Human-curated module root concepts

JSON files listing **root concept IDs** per clinical module. Curators maintain these; packaging CI expands them into full collections via OCL `$cascade`.

| File | Module | OCL collection |
|---|---|---|
| `core.json` | `core` | `tabibu-core` (shared vocabulary roots) |
| `lab.json` | `lab` | `tabibu-lab` |
| `maternity.json` | `maternity` | `tabibu-maternity` |
| `snomed-addon.json` | `snomed-addon` | `tabibu-snomed-addon` |

**Shape:**

```json
{
  "module": "lab",
  "roots": ["<concept-id-or-uuid>", "..."]
}
```

Currently all `roots` arrays are empty placeholders. Populate these after OCL is stood up and curators identify entry-point concepts for each module.

**Not read at runtime** — only by `packaging-ci/` and future curation tooling.

---

## `packaging-ci/` — Offline collection packaging (not the API server)

Scripts that run in CI or manually when curators update manifests or cut a new collection release. **Does not run inside the Docker container's main process.**

| File | Role |
|---|---|
| `runClosure.ts` | Entry point for `npm run packaging:closure`. Loads manifests → `$cascade` per module → core split → leak detection. Exits non-zero on leaks. |
| `updateCollectionRefs.ts` | Stub — will push the frozen reference list back to OCL with `cascade=none` after closure is computed. |

**Output of a successful run:** you know exactly which concept UUIDs belong in `tabibu-lab` vs `tabibu-core` before writing collection references in OCL.

---

## `supabase/` — Gateway database (separate from hospital Postgres)

The gateway's **own** Postgres via Supabase. Stores hospital registry, module provisioning, subscriptions, sync audit — never hospital clinical data.

### `supabase/migrations/`

| File | Role |
|---|---|
| `001_initial_schema.sql` | Creates all gateway tables, indexes, and enables RLS on sensitive tables. Run once on a new Supabase project. |

**Tables created:**

| Table | Purpose |
|---|---|
| `hospitals` | Registered hospital installs (id, name, KMHFL code) |
| `hospital_app_modules` | Which Tabibu app modules Nexus provisioned (`laboratory`, `pharmacy`, …) |
| `hospital_module_subscriptions` | Derived mapping: hospital → OCL collection → pinned version |
| `hospital_license_flags` | SNOMED / licensed add-on entitlement per hospital |
| `collections` | Registry of OCL collection IDs + current `latest_version` |
| `collection_versions` | History of released versions, CIEL pin, export cache status |
| `concept_upgrade_rollouts` | *(deferred)* Staged upgrade state per hospital |
| `concept_upgrade_reports` | *(deferred)* Human-readable diff reports |
| `sync_log` | Audit trail: bundle requests, apply success/failure |

### `supabase/seed.sql`

Inserts the five known collection IDs (`tabibu-core`, `tabibu-lab`, `tabibu-pharmacy`, `tabibu-maternity`, `tabibu-snomed-addon`) with `latest_version = null` until first OCL releases are cut.

---

## `test/` — Unit tests

| File | What it covers |
|---|---|
| `packaging.test.ts` | `computeCoreSplit` — shared concepts land in core, module-only concepts stay separate |
| `transform.test.ts` | OCL → Tabibu schema transform, bundle merge deduplication |

Integration tests (live Supabase + OCL) are not yet present — add under `test/` when you have a test OCL instance.

---

## Generated / runtime directories (not in git)

| Path | Created by | Purpose |
|---|---|---|
| `node_modules/` | `npm install` | Dependencies |
| `dist/` | `npm run build` | Compiled JavaScript |
| `.cache/bundles/` | `bundleCache.ts` at runtime | Cached OCL export JSON per collection@version |

---

## Request flow (hospital sync)

```
Hospital Go client
    │
    ▼
GET /hospitals/:id/bundle
    │
    ├─► deriveSubscriptionsForHospital()     [subscriptions/]
    │       reads hospital_app_modules
    │       writes hospital_module_subscriptions
    │
    ├─► getSubscribedCollectionsWithAddons() [subscriptions/]
    │       + license-gated add-ons
    │
    ├─► for each collection@version:
    │       bundleCache.get() or fetchCollectionExport()  [ocl/]
    │       transformOclExportToTabibu()                  [bundles/]
    │
    ├─► mergeTabibuBundles()                 [bundles/]
    │
    ├─► sync_log insert                      [supabase]
    │
    ▼
JSON { bundle: TabibuConceptBundle }
    │
    ▼
Hospital upserts into concept_* tables     [Tabibu-Server]
    │
    ▼
POST /hospitals/:id/bundle-applied
```

---

## What to touch for common tasks

| Task | Folders / files |
|---|---|
| Add a new clinical module with its own concepts | `manifests/`, `src/config/modules.ts`, `supabase/seed.sql`, OCL collection |
| Change bundle shape for hospital schema | `src/bundles/tabibuSchema.ts`, `transformOclExport.ts`, Go sync client |
| Add a new API endpoint | `src/routes/`, register in `src/index.ts` |
| Fix OCL download / polling | `src/ocl/exportFetcher.ts` |
| Register a hospital | Supabase: `hospitals`, `hospital_app_modules` |
| Pin after OCL release | Supabase: `update collections set latest_version = …` |
| Re-sort concepts into collections | `manifests/`, `npm run packaging:closure` |
| Enable upgrade rollouts | Mount `opsRoutes` in `index.ts`, build Go client pending-bundle path |
| Deploy | `Dockerfile`, `.env`, run Supabase migration + seed |

---

## Related documentation

- [tabibu_concept_library_plan.md](../Documentation/docs/tabibu_concept_library_plan.md) — full system design and development phases
- [schema_modules_list.md](../Documentation/docs/schema_modules_list.md) — Tabibu server schema module ownership
- [Tabibu-Server/tabibu_schema.sql](../Tabibu-Server/tabibu_schema.sql) — hospital-side `concept_*` table definitions
