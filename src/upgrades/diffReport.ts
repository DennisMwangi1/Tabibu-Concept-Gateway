import { env } from "../config/env.js";
import { fetchCollectionExport } from "../ocl/exportFetcher.js";

export interface ConceptSummary {
  uuid: string;
  name: string;
}

export type ConceptChangeType = "added" | "removed" | "modified";

export interface ConceptDiffRow {
  concept_uuid: string;
  change_type: ConceptChangeType;
  field_changes?: Record<string, { old: unknown; new: unknown }>;
}

type OclConcept = Record<string, unknown>;

const DIFF_FIELDS = [
  "name",
  "datatype",
  "retired",
  "answers",
  "setMembers",
] as const;

function conceptUuid(c: OclConcept): string {
  return String(c.uuid);
}

function conceptName(c: OclConcept): string {
  const names = c.names as Array<{ name?: string }> | undefined;
  return names?.[0]?.name ?? conceptUuid(c);
}

function toSummary(c: OclConcept): ConceptSummary {
  return { uuid: conceptUuid(c), name: conceptName(c) };
}

function extractField(c: OclConcept, field: (typeof DIFF_FIELDS)[number]): unknown {
  const extras = (c.extras ?? {}) as OclConcept;

  switch (field) {
    case "name":
      return conceptName(c);
    case "datatype":
      return c.datatype ?? c.data_type ?? null;
    case "retired":
      return c.retired ?? false;
    case "answers":
      return c.answers ?? extras.answers ?? null;
    case "setMembers":
      return c.setMembers ?? extras.setMembers ?? c.members ?? null;
    default:
      return null;
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function fieldDiff(
  oldConcept: OclConcept,
  newConcept: OclConcept,
): Record<string, { old: unknown; new: unknown }> | undefined {
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const field of DIFF_FIELDS) {
    const oldVal = extractField(oldConcept, field);
    const newVal = extractField(newConcept, field);
    if (stableJson(oldVal) !== stableJson(newVal)) {
      changes[field] = { old: oldVal, new: newVal };
    }
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}

/**
 * Pure concept-by-concept comparison of two OCL export concept arrays.
 */
export function computeConceptDiffs(
  fromConcepts: OclConcept[],
  toConcepts: OclConcept[],
): ConceptDiffRow[] {
  const fromByUuid = new Map(fromConcepts.map((c) => [conceptUuid(c), c]));
  const toByUuid = new Map(toConcepts.map((c) => [conceptUuid(c), c]));
  const diffs: ConceptDiffRow[] = [];

  for (const [uuid, concept] of toByUuid) {
    const prior = fromByUuid.get(uuid);
    if (!prior) {
      diffs.push({ concept_uuid: uuid, change_type: "added" });
      continue;
    }

    const changes = fieldDiff(prior, concept);
    if (changes || stableJson(prior) !== stableJson(concept)) {
      diffs.push({
        concept_uuid: uuid,
        change_type: "modified",
        field_changes: changes ?? { _raw: { old: prior, new: concept } },
      });
    }
  }

  for (const [uuid] of fromByUuid) {
    if (!toByUuid.has(uuid)) {
      diffs.push({ concept_uuid: uuid, change_type: "removed" });
    }
  }

  return diffs;
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
  const toConcepts = toExport.concepts as OclConcept[];

  if (!fromVersion) {
    const changedConcepts = toConcepts.map(toSummary);
    const structuredDiffs = toConcepts.map((c) => ({
      concept_uuid: conceptUuid(c),
      change_type: "added" as const,
    }));
    return {
      changedConcepts,
      retiredConcepts: [] as ConceptSummary[],
      structuredDiffs,
    };
  }

  const fromExport = await fetchCollectionExport(
    env.OCL_ORG,
    collectionId,
    fromVersion,
  );
  const fromConcepts = fromExport.concepts as OclConcept[];
  const structuredDiffs = computeConceptDiffs(fromConcepts, toConcepts);

  const changedConcepts = structuredDiffs
    .filter((d) => d.change_type !== "removed")
    .map((d) => {
      const concept = toByUuidFromDiffs(toConcepts, fromConcepts, d);
      return toSummary(concept);
    });

  const retiredConcepts = structuredDiffs
    .filter((d) => d.change_type === "removed")
    .map((d) => {
      const concept = fromConcepts.find((c) => conceptUuid(c) === d.concept_uuid)!;
      return toSummary(concept);
    });

  return { changedConcepts, retiredConcepts, structuredDiffs };
}

function toByUuidFromDiffs(
  toConcepts: OclConcept[],
  fromConcepts: OclConcept[],
  diff: ConceptDiffRow,
): OclConcept {
  const toMatch = toConcepts.find((c) => conceptUuid(c) === diff.concept_uuid);
  if (toMatch) return toMatch;
  const fromMatch = fromConcepts.find((c) => conceptUuid(c) === diff.concept_uuid);
  return fromMatch ?? { uuid: diff.concept_uuid, names: [{ name: diff.concept_uuid }] };
}
