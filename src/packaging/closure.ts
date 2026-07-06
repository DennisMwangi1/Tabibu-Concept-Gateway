import { fetchCascade } from "../ocl/exportFetcher.js";
import {
  fetchQAndAMappings,
  fetchSameAsMappings,
  parseConceptUrl,
} from "../ocl/qandaMappings.js";
import { env } from "../config/env.js";

const DEFAULT_SOURCE = "Tabibu";

/**
 * Directed graph of internal concept dependencies extracted from cascade
 * mapping entries. Keys and values are OCL concept URL paths.
 * Edge A → B means "concept A directly references concept B via
 * a CONCEPT-SET or Q-AND-A relationship within the same source."
 */
export type ConceptGraph = Map<string, Set<string>>;

/**
 * Dependency closure over Q-AND-A / CONCEPT-SET from root concept IDs.
 * Keys in the returned set are OCL concept URL paths
 * (e.g. /orgs/CIEL/sources/CIEL/concepts/5085/) usable directly as
 * collection reference expressions.
 */
export async function computeClosure(
  rootConceptIds: string[],
  org = env.OCL_ORG,
  source = DEFAULT_SOURCE,
): Promise<Set<string>> {
  return (await computeClosureWithGraph(rootConceptIds, org, source)).closure;
}

/**
 * Same as computeClosure but also returns the intra-source dependency graph
 * built from CONCEPT-SET and Q-AND-A mapping entries in the cascade response.
 * Used by packaging CI for automated leak detection.
 */
export async function computeClosureWithGraph(
  rootConceptIds: string[],
  org = env.OCL_ORG,
  source = DEFAULT_SOURCE,
): Promise<{ closure: Set<string>; graph: ConceptGraph }> {
  const closure = new Set<string>();
  const graph: ConceptGraph = new Map();

  const addEdge = (from: string, to: string) => {
    if (!graph.has(from)) graph.set(from, new Set());
    graph.get(from)!.add(to);
  };

  for (const rootId of rootConceptIds) {
    const cascaded = await fetchCascade(org, source, rootId);

    for (const entry of cascaded) {
      const isConcept =
        entry.type === "Concept" || entry.url.includes("/concepts/");
      const isMapping =
        entry.type === "Mapping" || entry.url.includes("/mappings/");

      if (!entry.retired && isConcept) {
        closure.add(entry.url);
      }

      // Capture intra-source CONCEPT-SET / Q-AND-A edges for leak detection.
      // External mappings (SNOMED, ICD-10) have null to_concept_url — skip those.
      if (
        isMapping &&
        entry.from_concept_url &&
        entry.to_concept_url &&
        entry.to_concept_url.includes("/concepts/")
      ) {
        addEdge(entry.from_concept_url, entry.to_concept_url);
      }
    }

    // Include the root itself (cascade may omit the pivot concept).
    const rootUrl = `/orgs/${org}/sources/${source}/concepts/${rootId}/`;
    closure.add(rootUrl);
  }

  await expandClosureWithQAndA(closure, org, source);

  return { closure, graph };
}

/**
 * OCL $cascade from ConvSet roots follows CONCEPT-SET members but does not
 * continue into each member's Q-AND-A answers. Walk coded concepts already in
 * the closure and pull in their answer targets.
 */
async function expandClosureWithQAndA(
  closure: Set<string>,
  org: string,
  source: string,
): Promise<void> {
  const queue = [...closure];

  while (queue.length > 0) {
    const url = queue.pop()!;
    const parsed = parseConceptUrl(url);
    if (!parsed) continue;

    const mappings = await fetchQAndAMappings(
      parsed.org,
      parsed.source,
      parsed.conceptId,
    );

    for (const m of mappings) {
      const answerUrl = m.to_concept_url;
      if (!answerUrl || closure.has(answerUrl)) continue;
      closure.add(answerUrl);
      queue.push(answerUrl);
    }
  }
}

/**
 * Fixpoint closure over shared concept UUIDs.
 */
export async function expandSharedCore(
  sharedUuids: string[],
  org = env.OCL_ORG,
  source = DEFAULT_SOURCE,
): Promise<Set<string>> {
  return computeClosure(sharedUuids, org, source);
}

// ---------------------------------------------------------------------------
// Cross-source SAME-AS de-duplication
// ---------------------------------------------------------------------------

/**
 * Source priority for canonical URL selection. When two concepts in the
 * closure are linked by a SAME-AS mapping, the one whose source appears
 * earlier in this list (lower index) is kept.
 *
 * CIEL is authoritative because it already carries SAME-AS mappings back to
 * LOINC, ICD-10, and SNOMED — keeping CIEL URLs means those external
 * reference maps are preserved in the released collection exports.
 */
const CANONICAL_SOURCES = [
  "CIEL",
  "LOINC",
  "ICD-10-WHO",
  "SNOMED",
  "PIH",
  "AMPATH",
] as const;

function canonicalPriority(url: string): number {
  const parsed = parseConceptUrl(url);
  if (!parsed) return CANONICAL_SOURCES.length + 1;
  const idx = CANONICAL_SOURCES.findIndex(
    (s) => s.toLowerCase() === parsed.source.toLowerCase(),
  );
  return idx === -1 ? CANONICAL_SOURCES.length : idx;
}

/**
 * Removes semantically duplicate concepts from a closure that spans multiple
 * sources. Two concepts are considered duplicates when OCL has a SAME-AS
 * mapping between them AND both URLs are already present in the closure.
 *
 * Uses union-find with source-priority ranking so CIEL always wins over PIH,
 * PIH over AMPATH, etc. Only call this for closures derived from 2+ sources
 * — for single-source closures there can be no inter-source duplicates.
 *
 * Returns the de-duplicated Set and a count of removed URLs for logging.
 */
export async function deduplicateSameAs(closure: Set<string>): Promise<{
  deduplicated: Set<string>;
  removed: number;
}> {
  if (closure.size === 0) return { deduplicated: new Set(), removed: 0 };

  // Union-Find — each concept starts as its own canonical representative.
  const parent = new Map<string, string>(
    [...closure].map((url) => [url, url]),
  );

  function find(x: string): string {
    // Iterative path-halving
    while (parent.get(x) !== x) {
      const gp = parent.get(parent.get(x)!);
      if (gp) parent.set(x, gp);
      x = parent.get(x)!;
    }
    return x;
  }

  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // Lower canonicalPriority index = higher authority = becomes the root.
    if (canonicalPriority(ra) <= canonicalPriority(rb)) {
      parent.set(rb, ra);
    } else {
      parent.set(ra, rb);
    }
  }

  // For each concept, fetch outgoing SAME-AS mappings and union any pair
  // where both ends are already in the closure.
  for (const url of closure) {
    const parsed = parseConceptUrl(url);
    if (!parsed) continue;

    const mappings = await fetchSameAsMappings(
      parsed.org,
      parsed.source,
      parsed.conceptId,
    );

    for (const m of mappings) {
      if (!m.to_concept_url || !closure.has(m.to_concept_url)) continue;
      union(url, m.to_concept_url);
    }
  }

  // Collect one canonical URL per equivalence class.
  const deduplicated = new Set<string>();
  for (const url of closure) {
    deduplicated.add(find(url));
  }

  return { deduplicated, removed: closure.size - deduplicated.size };
}

export function computeCoreSplit(
  moduleClosures: Map<string, Set<string>>,
): { core: Set<string>; moduleContent: Map<string, Set<string>> } {
  const uuidModuleCount = new Map<string, number>();

  for (const closure of moduleClosures.values()) {
    for (const uuid of closure) {
      uuidModuleCount.set(uuid, (uuidModuleCount.get(uuid) ?? 0) + 1);
    }
  }

  const shared = [...uuidModuleCount.entries()]
    .filter(([, count]) => count >= 2)
    .map(([uuid]) => uuid);

  const core = new Set(shared);
  const moduleContent = new Map<string, Set<string>>();

  for (const [module, closure] of moduleClosures) {
    const content = new Set<string>();
    for (const uuid of closure) {
      if (!core.has(uuid)) {
        content.add(uuid);
      }
    }
    moduleContent.set(module, content);
  }

  return { core, moduleContent };
}
