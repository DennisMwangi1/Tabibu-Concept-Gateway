import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../config/env.js";
import type { ExportManifest } from "../ocl/types.js";

function cachePath(collectionId: string, version: string): string {
  const safeKey = `${collectionId}@${version}`.replace(/[^a-zA-Z0-9@._-]/g, "_");
  return join(env.BUNDLE_CACHE_DIR, `${safeKey}.json`);
}

export const bundleCache = {
  async get(
    collectionId: string,
    version: string,
  ): Promise<ExportManifest | null> {
    try {
      const raw = await readFile(cachePath(collectionId, version), "utf-8");
      return JSON.parse(raw) as ExportManifest;
    } catch {
      return null;
    }
  },

  async set(
    collectionId: string,
    version: string,
    data: ExportManifest,
  ): Promise<void> {
    await mkdir(env.BUNDLE_CACHE_DIR, { recursive: true });
    await writeFile(
      cachePath(collectionId, version),
      JSON.stringify(data),
      "utf-8",
    );
  },
};
