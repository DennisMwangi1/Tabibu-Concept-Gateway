#!/usr/bin/env tsx
/**
 * Cuts a released version on every Tabibu OCL collection, then updates the
 * gateway Supabase database directly — no migration file required.
 *
 * What it does:
 *   1. Creates a released version on each OCL collection.
 *   2. Pre-warms OCL export ZIPs so hospitals can sync immediately.
 *   3. Updates `collections.latest_version` for each collection.
 *   4. Upserts a row into `collection_versions` for tracking.
 *
 * Usage:
 *   npm run packaging:release                    # releases v1.0.0
 *   npm run packaging:release -- --version v1.1.0
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (bypasses RLS for CI writes).
 */
import { createClient } from "@supabase/supabase-js";
import { oclClient } from "../src/ocl/client.js";
import { warmCollectionExport } from "../src/ocl/exportFetcher.js";
import { RELEASE_COLLECTIONS } from "../src/config/modules.js";
import { env } from "../src/config/env.js";

const COLLECTIONS = [...RELEASE_COLLECTIONS];

function parseVersion(): string {
  const flag = process.argv.indexOf("--version");
  if (flag !== -1 && process.argv[flag + 1]) {
    return process.argv[flag + 1];
  }
  return "v1.0.0";
}

async function releaseCollectionVersion(
  org: string,
  collectionId: string,
  version: string,
): Promise<void> {
  const res = await oclClient.post(
    `/orgs/${org}/collections/${collectionId}/versions/`,
    {
      id: version,
      released: true,
      description: `Tabibu concept library ${version} — CIEL-sourced, packaged ${new Date().toISOString().slice(0, 10)}`,
    },
  );

  if (res.status === 201) {
    console.log(`  ✓ ${collectionId}@${version} released`);
  } else if (res.status === 409) {
    console.log(`  ~ ${collectionId}@${version} already exists — skipping`);
  } else {
    throw new Error(
      `Failed to release ${collectionId}@${version}: HTTP ${res.status} — ${JSON.stringify(res.data)}`,
    );
  }
}

async function updateSupabase(version: string): Promise<void> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for packaging:release.\n" +
        "Add it to your .env file.",
    );
  }

  const supabase = createClient(
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const releasedAt = new Date().toISOString();

  // Pin latest_version on every collection.
  const { error: updateError } = await supabase
    .from("collections")
    .update({ latest_version: version })
    .in("id", COLLECTIONS);

  if (updateError) {
    throw new Error(`Failed to update collections: ${updateError.message}`);
  }
  console.log(`  ✓ collections.latest_version = ${version}`);

  // Record each version in collection_versions for the admin version dropdowns.
  const rows = COLLECTIONS.map((collectionId) => ({
    collection_id: collectionId,
    version,
    released_at: releasedAt,
    export_cached: true,
  }));

  const { error: upsertError } = await supabase
    .from("collection_versions")
    .upsert(rows, { onConflict: "collection_id,version" });

  if (upsertError) {
    throw new Error(
      `Failed to upsert collection_versions: ${upsertError.message}`,
    );
  }
  console.log(`  ✓ collection_versions rows upserted for ${version}`);
}

async function main() {
  const version = parseVersion();
  const org = env.OCL_ORG;

  console.log(`Releasing version ${version} on org: ${org}\n`);

  for (const collectionId of COLLECTIONS) {
    try {
      await releaseCollectionVersion(org, collectionId, version);
    } catch (err) {
      console.error(`  ✗ ${collectionId}: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  console.log("\nPre-warming OCL exports (may take several minutes)...\n");

  for (const collectionId of COLLECTIONS) {
    try {
      console.log(`  ${collectionId}@${version}`);
      await warmCollectionExport(org, collectionId, version);
      console.log(`  ✓ export ready`);
    } catch (err) {
      console.error(`  ✗ ${collectionId}: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  console.log("\nUpdating Supabase...\n");

  try {
    await updateSupabase(version);
  } catch (err) {
    console.error(`  ✗ ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`\n✓ Done — ${version} is live.`);
  console.log("  Restart the gateway (npm run dev) and verify:");
  console.log("  curl http://localhost:3100/ready\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
