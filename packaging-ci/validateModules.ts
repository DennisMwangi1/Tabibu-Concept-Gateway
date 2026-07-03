#!/usr/bin/env tsx
/**
 * Validates every entry in CONCEPT_MODULES against its manifest file, then
 * syncs the Supabase collections table to match what is declared.
 *
 * Manifest requirements (enforced per module):
 *   - module       string, matches the manifest filename base
 *   - source_org   non-empty string
 *   - description  non-empty string
 *   - roots        non-empty string array
 *   - notes        object whose keys are exactly the set of root IDs
 *
 * Exit codes:
 *   0 — all modules valid; collections table synced (or skipped if no DB creds)
 *   1 — one or more validation errors
 *
 * Usage:
 *   npm run packaging:validate          # validate + sync (if creds present)
 *   npm run packaging:validate -- --dry-run   # validate only, no DB write
 */
import { createClient } from "@supabase/supabase-js";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import "dotenv/config";
import {
  CONCEPT_MODULES,
  CORE_MODULE,
  type CoreModule,
  type ConceptModule,
} from "../src/config/moduleDefinitions.js";
import { CORE_COLLECTION } from "../src/config/modules.js";

const DRY_RUN = process.argv.includes("--dry-run");
const MANIFESTS_DIR = join(import.meta.dirname, "../manifests");

// ---------------------------------------------------------------------------
// Manifest shape
// ---------------------------------------------------------------------------

interface ValidManifest {
  module: string;
  source_org: string;
  description: string;
  roots: string[];
  notes: Record<string, string>;
}

type ValidationError = { field: string; message: string };

function validateManifest(
  raw: unknown,
  expectedModule: string,
): { ok: true; manifest: ValidManifest } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const data = raw as Record<string, unknown>;

  if (typeof data.module !== "string" || data.module.trim() === "") {
    errors.push({ field: "module", message: "must be a non-empty string" });
  } else if (data.module !== expectedModule) {
    errors.push({
      field: "module",
      message: `must equal "${expectedModule}" (got "${data.module}")`,
    });
  }

  if (typeof data.source_org !== "string" || data.source_org.trim() === "") {
    errors.push({ field: "source_org", message: "must be a non-empty string" });
  }

  if (typeof data.description !== "string" || data.description.trim() === "") {
    errors.push({ field: "description", message: "must be a non-empty string" });
  }

  if (!Array.isArray(data.roots) || data.roots.length === 0) {
    errors.push({
      field: "roots",
      message: "must be a non-empty array of concept IDs",
    });
  } else if (!data.roots.every((r) => typeof r === "string" && r.trim() !== "")) {
    errors.push({ field: "roots", message: "all items must be non-empty strings" });
  }

  if (typeof data.notes !== "object" || data.notes === null || Array.isArray(data.notes)) {
    errors.push({ field: "notes", message: "must be an object" });
  } else if (Array.isArray(data.roots) && data.roots.length > 0) {
    const roots = data.roots as string[];
    const notes = data.notes as Record<string, unknown>;
    const noteKeys = Object.keys(notes);
    const rootSet = new Set(roots);
    const noteSet = new Set(noteKeys);

    const missingNotes = roots.filter((r) => !noteSet.has(r));
    const orphanNotes = noteKeys.filter((k) => !rootSet.has(k));

    if (missingNotes.length > 0) {
      errors.push({
        field: "notes",
        message: `missing notes for roots: ${missingNotes.join(", ")}`,
      });
    }
    if (orphanNotes.length > 0) {
      errors.push({
        field: "notes",
        message: `notes contains keys not in roots: ${orphanNotes.join(", ")}`,
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, manifest: data as unknown as ValidManifest };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** All modules that must be validated — core first, then provisionable modules. */
type AnyModule = (CoreModule & { appModule?: never }) | ConceptModule;

async function validateModule(
  mod: AnyModule,
  manifestFiles: Set<string>,
): Promise<boolean> {
  const { manifestModule, collectionId } = mod;
  const appModule = "appModule" in mod ? mod.appModule : undefined;
  const tag = appModule ? `appModule="${appModule}", ` : "";
  const prefix = `  [${manifestModule}]`;

  if (!manifestFiles.has(manifestModule)) {
    console.error(
      `${prefix} ✗  manifests/${manifestModule}.json not found` +
        ` (required for ${tag}collection="${collectionId}")`,
    );
    return false;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(
      await readFile(join(MANIFESTS_DIR, `${manifestModule}.json`), "utf-8"),
    );
  } catch {
    console.error(`${prefix} ✗  failed to parse manifests/${manifestModule}.json`);
    return false;
  }

  const result = validateManifest(raw, manifestModule);
  if (!result.ok) {
    console.error(`${prefix} ✗  manifest invalid:`);
    for (const e of result.errors) {
      console.error(`          ${e.field}: ${e.message}`);
    }
    return false;
  }

  console.log(
    `${prefix} ✓  ${result.manifest.roots.length} root(s), source_org="${result.manifest.source_org}"`,
  );
  return true;
}

async function main() {
  let failed = false;

  // ── 1. Read available manifest files ──────────────────────────────────────
  const manifestFiles = new Set(
    (await readdir(MANIFESTS_DIR))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, "")),
  );

  // ── 2. Validate core + all provisionable modules ───────────────────────────
  const allModules: AnyModule[] = [CORE_MODULE, ...CONCEPT_MODULES];

  console.log(
    `\nValidating ${allModules.length} module(s) against manifests in ./manifests/\n`,
  );

  const validCoreOk = await validateModule(CORE_MODULE, manifestFiles);
  if (!validCoreOk) failed = true;

  const validProvisionable: ConceptModule[] = [];
  for (const mod of CONCEPT_MODULES) {
    const ok = await validateModule(mod, manifestFiles);
    if (ok) {
      validProvisionable.push(mod);
    } else {
      failed = true;
    }
  }

  // ── 3. Warn about orphan manifests ────────────────────────────────────────
  const knownManifests = new Set(allModules.map((m) => m.manifestModule));

  for (const f of manifestFiles) {
    if (!knownManifests.has(f)) {
      console.warn(
        `\n  [WARN] manifests/${f}.json has no corresponding module definition`,
      );
    }
  }

  // ── 4. Abort if any validation errors ─────────────────────────────────────
  if (failed) {
    console.error(
      "\n✗ Validation failed — fix the errors above before syncing.\n",
    );
    process.exit(1);
  }

  console.log(`\n✓ All ${allModules.length} module(s) valid.\n`);

  // ── 5. Sync collections table ─────────────────────────────────────────────
  if (DRY_RUN) {
    console.log("--dry-run: skipping database sync.\n");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.warn(
      "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping collections sync.\n" +
        "Set both in .env to enable automatic sync.\n",
    );
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const rows = [
    {
      id: CORE_COLLECTION,
      app_module: null as string | null,
      is_core: true,
      is_optional_addon: false,
    },
    ...validProvisionable.map((m) => ({
      id: m.collectionId,
      app_module: m.appModule,
      is_core: false,
      is_optional_addon: false,
    })),
  ];

  console.log("Syncing collections table...\n");

  const { error } = await supabase
    .from("collections")
    .upsert(rows, {
      onConflict: "id",
      ignoreDuplicates: false,
    });

  if (error) {
    console.error(`✗ Supabase upsert failed: ${error.message}\n`);
    process.exit(1);
  }

  for (const row of rows) {
    const tag = row.is_core ? "(core)" : `(app_module: ${row.app_module})`;
    console.log(`  ✓  ${row.id}  ${tag}`);
  }

  console.log(`\n✓ collections table synced — ${rows.length} row(s) upserted.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
