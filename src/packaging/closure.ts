import { fetchCascade } from "../ocl/exportFetcher.js";
import { fetchQAndAMappings, parseConceptUrl } from "../ocl/qandaMappings.js";
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
