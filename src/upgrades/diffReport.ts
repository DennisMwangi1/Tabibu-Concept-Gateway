import { env } from "../config/env.js";
import { fetchCollectionExport } from "../ocl/exportFetcher.js";

export interface ConceptSummary {
  uuid: string;
  name: string;
}

function toSummary(c: Record<string, unknown>): ConceptSummary {
  const names = c.names as Array<{ name?: string }> | undefined;
  return {
    uuid: String(c.uuid),
    name: names?.[0]?.name ?? String(c.uuid),
  };
}

/**
 * Compares two collection version exports for hospital admin upgrade reports.
 */
export async function diffCollectionVersions(
  collectionId: string,
  fromVersion: string | null,
  toVersion: string,
) {
  const toExport = await fetchCollectionExport(
    env.OCL_ORG,
    collectionId,
    toVersion,
  );

  if (!fromVersion) {
    return {
      changedConcepts: toExport.concepts.map((c) =>
        toSummary(c as Record<string, unknown>),
      ),
      retiredConcepts: [] as ConceptSummary[],
    };
  }

  const fromExport = await fetchCollectionExport(
    env.OCL_ORG,
    collectionId,
    fromVersion,
  );
  const fromByUuid = new Map(
    fromExport.concepts.map((c) => [
      (c as Record<string, unknown>).uuid,
      c,
    ]),
  );
  const toByUuid = new Map(
    toExport.concepts.map((c) => [
      (c as Record<string, unknown>).uuid,
      c,
    ]),
  );

  const changedConcepts: ConceptSummary[] = [];
  const retiredConcepts: ConceptSummary[] = [];

  for (const [uuid, concept] of toByUuid) {
    const prior = fromByUuid.get(uuid);
    if (!prior || JSON.stringify(prior) !== JSON.stringify(concept)) {
      changedConcepts.push(toSummary(concept as Record<string, unknown>));
    }
  }

  for (const [uuid, concept] of fromByUuid) {
    if (!toByUuid.has(uuid)) {
      retiredConcepts.push(toSummary(concept as Record<string, unknown>));
    }
  }

  return { changedConcepts, retiredConcepts };
}
