import { env } from "../config/env.js";
import { fetchCollectionExport } from "../ocl/exportFetcher.js";
import { getSubscribedCollectionsWithAddons } from "../subscriptions/service.js";
import { bundleCache } from "./bundleCache.js";
import { enrichConceptAnswersFromOcl } from "./enrichConceptAnswers.js";
import { mergeTabibuBundles, transformOclExportToTabibu } from "./transformOclExport.js";
import type { TabibuConceptBundle } from "./tabibuSchema.js";

export async function buildBundleForHospital(
  hospitalId: string,
): Promise<TabibuConceptBundle> {
  const targets = await getSubscribedCollectionsWithAddons(hospitalId);

  const parts: TabibuConceptBundle[] = [];
  for (const { collection_id, pinned_version } of targets) {
    const cached = await bundleCache.get(collection_id, pinned_version);
    const exportData =
      cached ??
      (await fetchCollectionExport(env.OCL_ORG, collection_id, pinned_version));

    if (!cached) {
      await bundleCache.set(collection_id, pinned_version, exportData);
    }

    const part = transformOclExportToTabibu(exportData, {
      id: collection_id,
      version: pinned_version,
    });
    await enrichConceptAnswersFromOcl(part, exportData);
    parts.push(part);
  }

  return mergeTabibuBundles(parts);
}
