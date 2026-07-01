import { readFile } from "node:fs/promises";
import { z } from "zod";

const ModuleManifestSchema = z
  .object({
    module: z.string(),
    roots: z.array(z.string()),
    /** OCL org that owns the upstream source (default: env.OCL_ORG / "Tabibu") */
    source_org: z.string().optional(),
    /** OCL source short_code within that org (default: "Tabibu") */
    source_id: z.string().optional(),
  })
  .passthrough(); // allow description / notes / sources fields for human docs

export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;

export async function loadManifest(path: string): Promise<ModuleManifest> {
  const raw = await readFile(path, "utf-8");
  return ModuleManifestSchema.parse(JSON.parse(raw));
}

export function validateManifest(manifest: ModuleManifest): void {
  if (manifest.roots.length === 0) {
    throw new Error(
      `Manifest for module "${manifest.module}" has no root concept IDs`,
    );
  }
}
