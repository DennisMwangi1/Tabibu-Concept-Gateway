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
 * Usage (semantic versioning — MAJOR.MINOR.PATCH):
 *   npm run packaging:release -- --patch          # bug fixes        1.0.0 → 1.0.1  (default)
 *   npm run packaging:release -- --minor          # new features     1.0.0 → 1.1.0
 *   npm run packaging:release -- --major          # breaking changes 1.0.0 → 2.0.0
 *   npm run packaging:release -- --version 2.1.0  # explicit override (skips auto-fetch)
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (bypasses RLS for CI writes).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { oclClient } from "../src/ocl/client.js";
import { warmCollectionExport } from "../src/ocl/exportFetcher.js";
import { RELEASE_COLLECTIONS } from "../src/config/modules.js";
import { env } from "../src/config/env.js";

const COLLECTIONS = [...RELEASE_COLLECTIONS];

type BumpType = "major" | "minor" | "patch";

function parseBumpType(): BumpType {
  if (process.argv.includes("--major")) return "major";
  if (process.argv.includes("--minor")) return "minor";
  return "patch";
}

function bumpSemver(current: string, bump: BumpType): string {
  const match = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(
      `Invalid semver in database: "${current}". Expected MAJOR.MINOR.PATCH.`,
    );
  }
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (bump === "major") {
    major++;
    minor = 0;
    patch = 0;
  } else if (bump === "minor") {
    minor++;
    patch = 0;
  } else {
    patch++;
  }
  return `${major}.${minor}.${patch}`;
}

async function parseVersion(supabase: SupabaseClient): Promise<string> {
  // Explicit override takes priority over all bump flags.
  const versionFlag = process.argv.indexOf("--version");
  if (versionFlag !== -1 && process.argv[versionFlag + 1]) {
    return String(process.argv[versionFlag + 1]);
  }

  const bump = parseBumpType();

  // tabibu-core is the canonical version source — all collections share the same version.
  const { data, error } = await supabase
    .from("collections")
    .select("latest_version")
    .eq("id", "tabibu-core")
    .single();

  if (error) {
    throw new Error(
      `Failed to fetch current version from Supabase: ${error.message}`,
    );
  }

  if (!data?.latest_version) {
    console.log("  No previous version found in Supabase — starting at 1.0.0");
    return "1.0.0";
  }

  const next = bumpSemver(data.latest_version, bump);
  console.log(`  ${data.latest_version} → ${next} (${bump} bump)`);
  return next;
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

async function updateSupabase(
  supabase: SupabaseClient,
  version: string,
): Promise<void> {
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
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "Error: SUPABASE_SERVICE_ROLE_KEY is required for packaging:release.\n" +
        "Add it to your .env file.",
    );
    process.exit(1);
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const version = await parseVersion(supabase);
  const org = env.OCL_ORG;

  console.log(`Releasing version ${version} on org: ${org}\n`);

  for (const collectionId of COLLECTIONS) {
    try {
      await releaseCollectionVersion(org, collectionId, String(version));
    } catch (err) {
      console.error(`  ✗ ${collectionId}: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  console.log("\nPre-warming OCL exports (may take several minutes)...\n");

  for (const collectionId of COLLECTIONS) {
    try {
      console.log(`  ${collectionId}@${version}`);
      await warmCollectionExport(org, collectionId, String(version));
      console.log(`  ✓ export ready`);
    } catch (err) {
      console.error(`  ✗ ${collectionId}: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  console.log("\nUpdating Supabase...\n");

  try {
    await updateSupabase(supabase, version);
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
