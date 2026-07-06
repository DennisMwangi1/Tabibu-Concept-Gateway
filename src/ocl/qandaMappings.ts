import { oclClient } from "./client.js";

export interface OclMappingRow {
  map_type?: string;
  from_concept_url?: string;
  to_concept_url?: string;
  sort_weight?: number | null;
  retired?: boolean;
}

export interface ParsedConceptUrl {
  org: string;
  source: string;
  conceptId: string;
}

/** Parse /orgs/CIEL/sources/CIEL/concepts/5089/ */
export function parseConceptUrl(url: string): ParsedConceptUrl | null {
  const match = url.match(
    /^\/orgs\/([^/]+)\/sources\/([^/]+)\/concepts\/([^/]+)\/?$/,
  );
  if (!match) return null;
  return { org: match[1], source: match[2], conceptId: match[3] };
}

export function isQAndAMapType(mapType: string): boolean {
  const normalized = mapType.toUpperCase().replace(/\s+/g, "-");
  return normalized === "Q-AND-A" || normalized === "Q-AND-A-MAP";
}

export function isSameAsMapType(mapType: string): boolean {
  return mapType.toUpperCase().trim() === "SAME-AS";
}

export async function fetchQAndAMappings(
  org: string,
  source: string,
  conceptId: string,
): Promise<OclMappingRow[]> {
  const res = await oclClient.get(
    `/orgs/${org}/sources/${source}/concepts/${conceptId}/mappings/`,
    { params: { mapType: "Q-AND-A" } },
  );

  if (res.status !== 200 || !Array.isArray(res.data)) {
    return [];
  }

  return (res.data as OclMappingRow[]).filter(
    (m) => !m.retired && isQAndAMapType(String(m.map_type ?? "")),
  );
}

/**
 * Fetches SAME-AS mappings for a concept. Used by the de-duplication pass
 * to detect semantically equivalent concepts across different sources
 * (e.g. CIEL 5089 SAME-AS PIH 1106 — both meaning "Fever").
 *
 * Only returns mappings where `to_concept_url` is set — external code
 * mappings (ICD-10, SNOMED) typically have a null `to_concept_url` and
 * are irrelevant for URL-level de-duplication.
 */
export async function fetchSameAsMappings(
  org: string,
  source: string,
  conceptId: string,
): Promise<OclMappingRow[]> {
  const res = await oclClient.get(
    `/orgs/${org}/sources/${source}/concepts/${conceptId}/mappings/`,
    { params: { mapType: "SAME-AS" } },
  );

  if (res.status !== 200 || !Array.isArray(res.data)) {
    return [];
  }

  return (res.data as OclMappingRow[]).filter(
    (m) =>
      !m.retired &&
      isSameAsMapType(String(m.map_type ?? "")) &&
      m.to_concept_url != null,
  );
}
