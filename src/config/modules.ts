/**
 * Concept-relevant app modules — maps Tabibu UI module IDs to OCL collections.
 *
 * App module IDs mirror Tabibu-Client/lib/modules.ts MODULE_REGISTRY.
 * Only clinical modules that ship their own concept vocabulary get a collection;
 * shared vocabulary lives in tabibu-core.
 */
export const CORE_COLLECTION = "tabibu-core";

/** Optional add-on gated by hospital_license_flags (e.g. SNOMED mappings). */
export const SNOMED_ADDON_COLLECTION = "tabibu-snomed-addon";

export interface ConceptModule {
  /** Tabibu app module id (MODULE_REGISTRY key). */
  appModule: string;
  /** OCL collection id under org Tabibu. */
  collectionId: string;
  /** Human label for ops/docs. */
  label: string;
}

/**
 * App modules that have a dedicated OCL concept collection.
 * tabibu-core is always included — not listed here.
 */
export const CONCEPT_MODULES: readonly ConceptModule[] = [
  {
    appModule: "laboratory",
    collectionId: "tabibu-lab",
    label: "Laboratory",
  },
  {
    appModule: "pharmacy",
    collectionId: "tabibu-pharmacy",
    label: "Pharmacy",
  },
  // Planned — no client module yet; keep collection for future maternity workflows.
  {
    appModule: "maternity",
    collectionId: "tabibu-maternity",
    label: "Maternity",
  },
] as const;

export const APP_MODULE_TO_COLLECTION: Record<string, string> =
  Object.fromEntries(
    CONCEPT_MODULES.map((m) => [m.appModule, m.collectionId]),
  );

export const COLLECTION_TO_APP_MODULE: Record<string, string> =
  Object.fromEntries(
    CONCEPT_MODULES.map((m) => [m.collectionId, m.appModule]),
  );

/** All Tabibu app modules (UI) — for reference; most use tabibu-core only. */
export const ALL_APP_MODULES = [
  "dashboard",
  "patients",
  "triage",
  "clinical-operations",
  "pharmacy",
  "laboratory",
  "reports",
  "settings",
] as const;
