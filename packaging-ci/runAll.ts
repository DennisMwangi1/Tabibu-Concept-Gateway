#!/usr/bin/env tsx
/**
 * Full packaging pipeline — runs all steps in order, failing fast on any error.
 *
 *   1. packaging:closure   validate closures + leak detection
 *   2. packaging:update-refs push concept references to OCL (cascade=sourcemappings)
 *   3. packaging:release     cut versions, write Supabase migration, pre-warm exports
 *
 * Usage:
 *   npm run packaging:run
 *   npm run packaging:run -- --version v1.0.2
 *   npm run packaging:run -- --auto-promote   # auto-fix leaks in step 1, then stop
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CI_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(CI_DIR, "..");

function forwardArgs(): string[] {
  const args = process.argv.slice(2);
  // --auto-promote only applies to the closure step
  return args.filter((a) => a !== "--auto-promote");
}

function hasAutoPromote(): boolean {
  return process.argv.includes("--auto-promote");
}

function runStep(label: string, script: string, extraArgs: string[] = []): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`▶ ${label}`);
  console.log(`${"=".repeat(60)}\n`);

  const result = spawnSync(
    "tsx",
    [join(CI_DIR, script), ...extraArgs],
    { cwd: ROOT, stdio: "inherit", env: process.env },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const versionArgs = forwardArgs();
  const closureArgs = hasAutoPromote() ? ["--auto-promote"] : [];

  console.log("Tabibu packaging pipeline");
  if (versionArgs.length > 0) {
    console.log(`Version: ${versionArgs.join(" ")}`);
  }

  runStep(
    "Step 1/3 — Validate closures + leak detection",
    "runClosure.ts",
    closureArgs,
  );

  if (hasAutoPromote()) {
    console.log(
      "\n--auto-promote was used. Re-run without it after reviewing core.json changes.",
    );
    process.exit(1);
  }

  runStep("Step 2/3 — Push references to OCL", "updateCollectionRefs.ts");
  runStep(
    "Step 3/3 — Release versions + pre-warm exports",
    "releaseVersions.ts",
    versionArgs,
  );

  console.log(`\n${"=".repeat(60)}`);
  console.log("Packaging pipeline complete.");
  console.log(`${"=".repeat(60)}`);
  console.log("\nNext steps:");
  console.log("  1. git add supabase/migrations/*_pin_collections_*.sql");
  console.log("  2. supabase db push");
  console.log("  3. Check export status in the admin dashboard\n");
}

main();
