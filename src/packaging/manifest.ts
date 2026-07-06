import { readFile } from "node:fs/promises";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Source entry — one (source_org, source_id, roots) triple in a manifest.
// A manifest can declare multiple source entries via the "sources" array.
// ---------------------------------------------------------------------------

const SourceEntrySchema = z.object({
  /** OCL org that owns the upstream source (e.g. "CIEL", "PIH"). */
  source_org: z.string(),
  /** OCL source short_code within that org (e.g. "CIEL", "PIH"). */
  source_id: z.string(),
  /** Root concept IDs within this source from which the closure is computed. */
  roots: z.array(z.string()),
  /** Human-readable note per root — validated by packaging:validate. */
  notes: z.record(z.string()).optional(),
});

export type SourceEntry = z.infer<typeof SourceEntrySchema>;

// ---------------------------------------------------------------------------
// Manifest schema — supports both formats:
//
//   Multi-source (new):
//     { "module": "hiv", "description": "...", "sources": [ { "source_org": "CIEL", ... }, { "source_org": "PIH", ... } ] }
//
//   Single-source / legacy flat (backwards-compatible):
//     { "module": "lab", "source_org": "CIEL", "source_id": "CIEL", "roots": [...], "notes": {...} }
// ---------------------------------------------------------------------------

const ModuleManifestSchema = z
  .object({
    module: z.string(),
    // Multi-source format:
    sources: z.array(SourceEntrySchema).optional(),
    // Legacy flat format (kept for backwards compatibility):
    roots: z.array(z.string()).optional(),
    source_org: z.string().optional(),
    source_id: z.string().optional(),
  })
  .passthrough(); // allow description / notes fields for human docs

export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;

export async function loadManifest(path: string): Promise<ModuleManifest> {
  const raw = await readFile(path, "utf-8");
  return ModuleManifestSchema.parse(JSON.parse(raw));
}

/**
 * Normalises both manifest formats into a uniform array of SourceEntry objects.
 *
 * - Multi-source manifests (`sources[]`): returned as-is.
 * - Legacy flat manifests (`roots` + optional `source_org`/`source_id`):
 *   wrapped in a one-element array using `defaultOrg` as fallback.
 *
 * Returns an empty array if the manifest declares no roots — callers should
 * skip or error on empty results.
 */
export function getSourceEntries(
  manifest: ModuleManifest,
  defaultOrg = "Tabibu",
): SourceEntry[] {
  if (manifest.sources?.length) {
    return manifest.sources as SourceEntry[];
  }
  if (manifest.roots?.length) {
    return [
      {
        source_org: manifest.source_org ?? defaultOrg,
        source_id: manifest.source_id ?? defaultOrg,
        roots: manifest.roots,
        notes: {},
      },
    ];
  }
  return [];
}

export function validateManifest(manifest: ModuleManifest): void {
  const entries = getSourceEntries(manifest);
  if (entries.length === 0) {
    throw new Error(
      `Manifest for module "${manifest.module}" has no root concept IDs`,
    );
  }
  for (const entry of entries) {
    if (entry.roots.length === 0) {
      throw new Error(
        `Manifest for module "${manifest.module}" has an empty roots array` +
          ` in source ${entry.source_org}/${entry.source_id}`,
      );
    }
  }
}
