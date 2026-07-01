import AdmZip from "adm-zip";
import { z } from "zod";
import { oclClient } from "./client.js";
import { ExportManifestSchema } from "./types.js";

const EXPORT_URL = (org: string, collection: string, version: string) =>
  `/orgs/${org}/collections/${collection}/${version}/export/`;

/** OCL statuses that mean "export is being generated — poll again". */
function isExportPending(status: number): boolean {
  return status === 202 || status === 208;
}

/**
 * Lightweight check — does not download the ZIP. Used by the admin packaging
 * status endpoint to show whether hospitals can sync immediately.
 */
export async function checkExportReady(
  org: string,
  collection: string,
  version: string,
): Promise<boolean> {
  try {
    const res = await oclClient.get(EXPORT_URL(org, collection, version), {
      responseType: "arraybuffer",
      maxRedirects: 5,
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Triggers OCL export generation (if not already running) and polls until the
 * ZIP is ready. Called from packaging:release so hospitals never hit a cold
 * export on their first sync after a version cut.
 */
export async function warmCollectionExport(
  org: string,
  collection: string,
  version: string,
  { maxAttempts = 60, delayMs = 5000 } = {},
): Promise<void> {
  const url = EXPORT_URL(org, collection, version);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await oclClient.get(url, {
      responseType: "arraybuffer",
      maxRedirects: 5,
    });

    if (res.status === 200) {
      if (attempt > 1) process.stdout.write("\n");
      return;
    }

    if (isExportPending(res.status)) {
      process.stdout.write(
        `\r  ⏳ warming export... ${attempt}/${maxAttempts} (${Math.round((attempt * delayMs) / 1000)}s)`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    throw new Error(
      `Unexpected status ${res.status} warming export for ${collection}@${version}`,
    );
  }

  throw new Error(
    `Export for ${collection}@${version} not ready after ${maxAttempts} attempts (${(maxAttempts * delayMs) / 1000}s)`,
  );
}

/**
 * OCL export statuses:
 *   200 — export ZIP ready, download it
 *   202 — export generation queued, poll again
 *   208 — export was already requested and is still being generated, poll again
 *         (OCL "Already Reported" — duplicate request acknowledged)
 *
 * Larger collections (pharmacy, lab) with cascade=sourcemappings take longer
 * to generate, so we increase default attempts and delay accordingly.
 */
export async function fetchCollectionExport(
  org: string,
  collection: string,
  version: string,
  { maxAttempts = 12, delayMs = 4000 } = {},
) {
  const url = EXPORT_URL(org, collection, version);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await oclClient.get(url, {
      responseType: "arraybuffer",
      maxRedirects: 5,
    });

    if (res.status === 200) {
      const zip = new AdmZip(Buffer.from(res.data));
      const entry = zip
        .getEntries()
        .find((e) => e.entryName.endsWith(".json"));
      if (!entry) {
        throw new Error(
          `No JSON payload found in export for ${collection}@${version}`,
        );
      }

      const parsed = JSON.parse(entry.getData().toString("utf-8"));
      return ExportManifestSchema.parse(parsed);
    }

    if (isExportPending(res.status)) {
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    throw new Error(
      `Unexpected status ${res.status} fetching export for ${collection}@${version}`,
    );
  }

  throw new Error(
    `Export for ${collection}@${version} not ready after ${maxAttempts} attempts (${(maxAttempts * delayMs) / 1000}s)`,
  );
}

const CascadeEntrySchema = z
  .object({
    id: z.string(),
    type: z.string().optional(),
    url: z.string(),
    retired: z.boolean().optional(),
    // Mapping-specific edge fields — present when type === "Mapping"
    map_type: z.string().optional(),
    from_concept_url: z.string().nullable().optional(),
    to_concept_url: z.string().nullable().optional(),
  })
  .passthrough();

const CascadeBundleSchema = z.object({
  resourceType: z.literal("Bundle"),
  entry: z.array(CascadeEntrySchema),
});

export type CascadeEntry = z.infer<typeof CascadeEntrySchema>;

export async function fetchCascade(
  org: string,
  source: string,
  rootConceptId: string,
  options: {
    mapTypes?: string;
    returnMapTypes?: string;
    view?: string;
  } = {},
): Promise<CascadeEntry[]> {
  const params = new URLSearchParams({
    mapTypes: options.mapTypes ?? "CONCEPT-SET,Q-AND-A",
    returnMapTypes: options.returnMapTypes ?? "*",
    view: options.view ?? "flat",
  });

  const url = `/orgs/${org}/sources/${source}/HEAD/concepts/${rootConceptId}/$cascade/?${params}`;
  const res = await oclClient.get(url);

  if (res.status !== 200) {
    throw new Error(
      `Cascade failed for ${rootConceptId}: status ${res.status}`,
    );
  }

  const bundle = CascadeBundleSchema.parse(res.data);
  return bundle.entry;
}
