import type { ConceptGraph } from "./closure.js";

export interface LeakViolation {
  /** Concept inside tabibu-core that has the problematic edge */
  sourceConcept: string;
  /** Concept that is only in a module collection */
  targetConcept: string;
  /** Which module collection owns the target */
  moduleOwner: string;
}

/**
 * Verify that no concept in tabibu-core directly references a concept that
 * exists only in a module-specific collection.
 *
 * A "leak" is an edge  core-concept → module-only-concept  in the
 * Q-AND-A / CONCEPT-SET dependency graph.  If this exists, a hospital that
 * does NOT subscribe to that module will receive an incomplete bundle —
 * the answer set for the core concept will be missing some members.
 *
 * The graph is built from the mapping entries returned by the OCL $cascade
 * endpoint (fields: from_concept_url, to_concept_url) during the closure
 * computation, so no extra API calls are needed.
 */
export function detectLeaks(
  coreUrls: Set<string>,
  moduleOnlyUrls: Set<string>,
  graph: ConceptGraph,
  moduleOwnership: Map<string, string>, // concept_url → module name
): LeakViolation[] {
  const violations: LeakViolation[] = [];

  for (const conceptUrl of coreUrls) {
    const neighbors = graph.get(conceptUrl);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      if (moduleOnlyUrls.has(neighbor)) {
        violations.push({
          sourceConcept: conceptUrl,
          targetConcept: neighbor,
          moduleOwner: moduleOwnership.get(neighbor) ?? "unknown",
        });
      }
    }
  }

  return violations;
}

/**
 * Build the inverse index: concept_url → which module exclusively owns it.
 * Used as input to detectLeaks.
 */
export function buildModuleOwnership(
  moduleContent: Map<string, Set<string>>,
): Map<string, string> {
  const ownership = new Map<string, string>();
  for (const [module, urls] of moduleContent) {
    for (const url of urls) {
      ownership.set(url, module);
    }
  }
  return ownership;
}
