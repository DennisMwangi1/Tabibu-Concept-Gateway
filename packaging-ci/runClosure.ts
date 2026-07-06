#!/usr/bin/env tsx
/**
 * Packaging CI entrypoint: manifest -> $cascade -> core split -> leak check.
 * Requires live OCL + populated manifests/*.json root concept IDs.
 *
 * Each manifest may declare `source_org` and `source_id` to cascade against
 * an upstream source (e.g. CIEL) rather than the Tabibu org source.
 *
 * Flags:
 *   --auto-promote   Automatically add leaked module-only concept IDs to
 *                    manifests/core.json and re-run the check.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConceptGraph } from "../src/packaging/closure.js";
import {
  computeClosureWithGraph,
  computeCoreSplit,
} from "../src/packaging/closure.js";
import {
  buildModuleOwnership,
  detectLeaks,
  type LeakViolation,
} from "../src/packaging/leakDetection.js";
import { loadManifest, getSourceEntries } from "../src/packaging/manifest.js";
import { env } from "../src/config/env.js";

const AUTO_PROMOTE = process.argv.includes("--auto-promote");

/**
 * Extract the bare concept ID from an OCL concept URL.
 * e.g. /orgs/CIEL/sources/CIEL/concepts/1284/ → "1284"
 */
function conceptIdFromUrl(url: string): string | null {
  const m = url.match(/\/concepts\/([^/]+)\//);
  return m ? m[1] : null;
}

/**
 * Promote leaked concept IDs into manifests/core.json roots and persist.
 * Returns the concept IDs that were newly added.
 */
async function promoteToCore(
  manifestsDir: string,
  violations: LeakViolation[],
): Promise<string[]> {
  const corePath = join(manifestsDir, "core.json");
  const raw = JSON.parse(await readFile(corePath, "utf-8"));

  // Normalise to sources[] — core manifests use the multi-source format.
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) {
    raw.sources = [
      {
        source_org: raw.source_org ?? "CIEL",
        source_id: raw.source_id ?? raw.source_org ?? "CIEL",
        roots: raw.roots ?? [],
        notes: raw.notes ?? {},
      },
    ];
  }

  const primarySource = raw.sources[0] as {
    roots: string[];
    notes: Record<string, string>;
  };
  const existing = new Set<string>(primarySource.roots ?? []);
  const added: string[] = [];

  for (const v of violations) {
    const id = conceptIdFromUrl(v.targetConcept);
    if (id && !existing.has(id)) {
      existing.add(id);
      added.push(id);
    }
  }

  if (added.length > 0) {
    primarySource.roots = [...existing];
    if (!primarySource.notes) primarySource.notes = {};
    for (const id of added) {
      if (!primarySource.notes[id]) {
        primarySource.notes[id] =
          "Auto-promoted from leak detection — annotate with ConvSet description";
      }
    }
    await writeFile(corePath, JSON.stringify(raw, null, 2) + "\n", "utf-8");
  }

  return added;
}

async function main() {
  const manifestsDir = join(import.meta.dirname, "../manifests");
  const files = (await readdir(manifestsDir)).filter((f) => f.endsWith(".json"));

  const moduleClosures = new Map<string, Set<string>>();
  // Merged dependency graph across all modules — used for leak detection.
  const mergedGraph: ConceptGraph = new Map();

  for (const file of files) {
    const manifest = await loadManifest(join(manifestsDir, file));
    const entries = getSourceEntries(manifest, env.OCL_ORG);

    if (entries.length === 0) {
      console.log(`Skipping ${file} (no roots configured yet)`);
      continue;
    }

    const totalRoots = entries.reduce((s, e) => s + e.roots.length, 0);
    const sourceSummary = entries.map((e) => `${e.source_org}/${e.source_id}`).join(", ");
    console.log(
      `Computing closure for module: ${manifest.module} (source: ${sourceSummary}, ${totalRoots} roots)`,
    );

    try {
      const moduleClosure = new Set<string>();

      for (const entry of entries) {
        const { closure, graph } = await computeClosureWithGraph(
          entry.roots,
          entry.source_org,
          entry.source_id,
        );

        for (const url of closure) moduleClosure.add(url);

        // Merge dependency edges from this source into the shared graph.
        for (const [from, targets] of graph) {
          if (!mergedGraph.has(from)) mergedGraph.set(from, new Set());
          for (const t of targets) mergedGraph.get(from)!.add(t);
        }
      }

      moduleClosures.set(manifest.module, moduleClosure);
      console.log(
        `  -> ${moduleClosure.size} concepts, ${mergedGraph.size} dependency edges`,
      );
    } catch (err) {
      console.error(`  ERROR computing closure for ${manifest.module}:`, err);
      process.exit(1);
    }
  }

  if (moduleClosures.size === 0) {
    console.log("No module manifests with roots — nothing to package.");
    process.exit(0);
  }

  const { core, moduleContent } = computeCoreSplit(moduleClosures);
  console.log(`\nCore split: ${core.size} concepts shared across ≥2 modules`);

  for (const [mod, content] of moduleContent) {
    console.log(`  ${mod}: ${content.size} module-specific concepts`);
  }

  const moduleOnly = new Set<string>();
  for (const content of moduleContent.values()) {
    for (const url of content) moduleOnly.add(url);
  }

  const moduleOwnership = buildModuleOwnership(moduleContent);
  const leaks = detectLeaks(core, moduleOnly, mergedGraph, moduleOwnership);

  if (leaks.length > 0) {
    console.error(`\nLeak detection FAILED — ${leaks.length} violation(s):`);
    for (const v of leaks) {
      const targetId = conceptIdFromUrl(v.targetConcept) ?? v.targetConcept;
      console.error(
        `  LEAK  ${v.sourceConcept}\n` +
          `        -> ${v.targetConcept}  [owned by: ${v.moduleOwner}]\n` +
          `        Fix A (promote):  add "${targetId}" to manifests/core.json roots\n` +
          `        Fix B (narrow):   remove the core root that pulls in ${v.sourceConcept}`,
      );
    }

    if (AUTO_PROMOTE) {
      console.log("\n--auto-promote: patching manifests/core.json ...");
      const added = await promoteToCore(manifestsDir, leaks);
      if (added.length > 0) {
        console.log(
          `  Added ${added.length} concept(s) to core roots: ${added.join(", ")}`,
        );
        console.log("  Re-run packaging:closure to verify the fix.\n");
      } else {
        console.log("  Nothing new to add (all IDs already in core).\n");
      }
      process.exit(1); // still fail — caller must re-run to confirm
    }

    console.error(
      "\nTip: run with --auto-promote to automatically apply Fix A for all violations.",
    );
    process.exit(1);
  }

  console.log(
    `\nLeak detection passed (checked ${mergedGraph.size} dependency edges).`,
  );
  console.log("Packaging CI closure check passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
