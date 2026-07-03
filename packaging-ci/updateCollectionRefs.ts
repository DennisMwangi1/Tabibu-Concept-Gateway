#!/usr/bin/env tsx
/**
 * Pushes the computed concept closure into each OCL collection as references.
 *
 * Correct OCL body format (from official docs):
 *   PUT /orgs/:org/collections/:collection/references/?cascade=sourcetoconcepts
 *   { "data": { "expressions": ["/orgs/CIEL/sources/CIEL/concepts/1114/"] } }
 *
 * Uses cascade=sourcetoconcepts so OCL includes CIEL mappings (Q-AND-A,
 * CONCEPT-SET, SAME-AS, …) AND their target concepts in the collection
 * expansion. Without this the released export has mappings: [] and hospital
 * bundles have empty concept_answers / concept_sets / concept_reference_maps.
 *
 * IMPORTANT: OCL does not update cascade on existing references. References
 * added earlier with cascade=none stay that way until removed. This script
 * clears all references on each collection before re-adding.
 *
 * Multiple expressions can be sent per request (we use batches of BATCH_SIZE).
 * A 200 response with an array of message objects means success.
 *
 * OCL reference model: references are declarative rules, not the concepts
 * themselves. The actual concept list (expansion) is computed when a version
 * is released. GET /concepts/ on HEAD returns 0 — that is expected.
 *
 * Usage:
 *   npm run packaging:closure      # validate closures + leak check  (run first)
 *   npm run packaging:update-refs  # push references to OCL
 *   npm run packaging:release      # release v1.0.0 and print Supabase SQL
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { computeClosure, computeCoreSplit } from "../src/packaging/closure.js";
import { loadManifest } from "../src/packaging/manifest.js";
import { env } from "../src/config/env.js";
import { MANIFEST_MODULE_TO_COLLECTION } from "../src/config/modules.js";
import { oclClient } from "../src/ocl/client.js";

// Derived directly from CONCEPT_MODULES via modules.ts — no manual sync needed.
const MODULE_TO_COLLECTION: Record<string, string> = MANIFEST_MODULE_TO_COLLECTION;

/** Expressions per request — OCL accepts multiple per call. */
const BATCH_SIZE = 25;
/** Pause between batches in ms — stay within OCL rate limits. */
const BATCH_PAUSE_MS = 1500;

/** Cascade mode — sourcetoconcepts includes mappings + target concepts. */
const CASCADE_MODE = "sourcetoconcepts";

async function clearCollectionReferences(
  org: string,
  collectionId: string,
): Promise<void> {
  console.log(`  ${collectionId}: clearing existing references...`);

  const res = await oclClient.delete(
    `/orgs/${org}/collections/${collectionId}/references/`,
    { data: { references: ["*"] } },
  );

  if (res.status !== 200 && res.status !== 204) {
    throw new Error(
      `Failed to clear references for ${collectionId}: HTTP ${res.status} — ${JSON.stringify(res.data).slice(0, 200)}`,
    );
  }

  // Give OCL a moment to finish the delete before re-adding.
  await new Promise((r) => setTimeout(r, 2000));
}

async function addReferencesToCollection(
  org: string,
  collectionId: string,
  conceptUrls: Set<string>,
) {
  const expressions = [...conceptUrls];

  if (expressions.length === 0) {
    console.log(`  ${collectionId}: no concepts — skipping`);
    return;
  }

  await clearCollectionReferences(org, collectionId);

  let processed = 0;
  let errors = 0;

  for (let i = 0; i < expressions.length; i += BATCH_SIZE) {
    const batch = expressions.slice(i, i + BATCH_SIZE);

    try {
      const res = await oclClient.put(
        `/orgs/${org}/collections/${collectionId}/references/?cascade=${CASCADE_MODE}`,
        { data: { expressions: batch } },
      );

      if (res.status === 200 || res.status === 201) {
        // Synchronous — references added immediately.
        processed += batch.length;
      } else if (res.status === 202) {
        // Asynchronous — OCL queued the indexing job; references will be added.
        processed += batch.length;
      } else {
        console.error(
          `\n  Batch failed HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`,
        );
        errors += batch.length;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n  Batch error: ${msg}`);
      errors += batch.length;
    }

    process.stdout.write(
      `\r  ${collectionId}: ${processed + errors}/${expressions.length} processed (${processed} ok, ${errors} errors)`,
    );

    if (i + BATCH_SIZE < expressions.length) {
      await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

  console.log();

  if (errors > 0) {
    throw new Error(
      `${errors} references failed for collection ${collectionId}`,
    );
  }
}

async function main() {
  const manifestsDir = join(import.meta.dirname, "../manifests");
  const files = (await readdir(manifestsDir)).filter((f) =>
    f.endsWith(".json"),
  );

  const moduleClosures = new Map<string, Set<string>>();

  for (const file of files) {
    const manifest = await loadManifest(join(manifestsDir, file));
    if (manifest.roots.length === 0) continue;

    const org = manifest.source_org ?? env.OCL_ORG;
    const source = manifest.source_id ?? "Tabibu";

    console.log(
      `Computing closure for ${manifest.module} (${org}/${source})...`,
    );
    const closure = await computeClosure(manifest.roots, org, source);
    moduleClosures.set(manifest.module, closure);
    console.log(`  -> ${closure.size} concepts`);
  }

  if (moduleClosures.size === 0) {
    console.log("No manifests with roots. Nothing to push.");
    process.exit(0);
  }

  const { core, moduleContent } = computeCoreSplit(moduleClosures);
  console.log(`\nCore split: ${core.size} shared | module-specific below`);
  for (const [mod, content] of moduleContent) {
    console.log(`  ${mod}: ${content.size} concepts`);
  }

  const tabibuOrg = env.OCL_ORG;
  console.log(`\nPushing references to OCL (org: ${tabibuOrg})...`);
  console.log(
    `  ${BATCH_SIZE} expressions/batch · ${BATCH_PAUSE_MS}ms pause · cascade=${CASCADE_MODE} · clears refs first\n`,
  );

  // Shared concepts → tabibu-core
  const coreCollection = MODULE_TO_COLLECTION["core"];
  if (coreCollection && core.size > 0) {
    await addReferencesToCollection(tabibuOrg, coreCollection, core);
  }

  // Module-specific concepts → their own collections
  for (const [module, content] of moduleContent) {
    const collectionId = MODULE_TO_COLLECTION[module];
    if (!collectionId) {
      console.warn(`No collection mapping for module "${module}" — skipping`);
      continue;
    }
    await addReferencesToCollection(tabibuOrg, collectionId, content);
  }

  console.log("\nAll references pushed.");
  console.log(
    "OCL indexes references asynchronously — allow a few minutes before releasing.",
  );
  console.log("Then run:");
  console.log("  npm run packaging:release -- --version v1.x.x");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
