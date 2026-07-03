/**
 * Runtime lookups and derived maps for the concept module system.
 *
 * To add or modify any module (including core), edit moduleDefinitions.ts — not here.
 * This file is purely operational: it builds lookup maps and helper functions
 * from the definitions.
 */

export type { CoreModule, ConceptModule } from "./moduleDefinitions.js";
export { CORE_MODULE, CONCEPT_MODULES } from "./moduleDefinitions.js";

import { CORE_MODULE, CONCEPT_MODULES } from "./moduleDefinitions.js";

// ---------------------------------------------------------------------------
// Core collection constant — derived from the definition, never hardcoded
// ---------------------------------------------------------------------------

export const CORE_COLLECTION = CORE_MODULE.collectionId;

// ---------------------------------------------------------------------------
// Derived maps
// ---------------------------------------------------------------------------

/**
 * All collection ids that packaging:release should cut versions for.
 * Core is always first so hospital sync applies it before any module collection.
 */
export const RELEASE_COLLECTIONS: readonly string[] = [
  CORE_COLLECTION,
  ...CONCEPT_MODULES.map((m) => m.collectionId),
];

/** manifestModule key → OCL collection id (includes "core" → tabibu-core). */
export const MANIFEST_MODULE_TO_COLLECTION: Record<string, string> =
  Object.fromEntries(
    [CORE_MODULE, ...CONCEPT_MODULES].map((m) => [m.manifestModule, m.collectionId]),
  );

/** appModule id → OCL collection id. */
export const APP_MODULE_TO_COLLECTION: Record<string, string> =
  Object.fromEntries(
    CONCEPT_MODULES.map((m) => [m.appModule, m.collectionId]),
  );

/** OCL collection id → appModule id. */
export const COLLECTION_TO_APP_MODULE: Record<string, string> =
  Object.fromEntries(
    CONCEPT_MODULES.map((m) => [m.collectionId, m.appModule]),
  );

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

const _byAppModule = new Map(CONCEPT_MODULES.map((m) => [m.appModule, m]));
const _byCollection = new Map(CONCEPT_MODULES.map((m) => [m.collectionId, m]));

/** Display metadata for an appModule id; returns a humanized fallback if unknown. */
export function getAppModuleDisplay(appModule: string): {
  label: string;
  chipColor: string;
} {
  const known = _byAppModule.get(appModule);
  if (known) return { label: known.label, chipColor: known.chipColor };
  const label = appModule
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { label, chipColor: "bg-slate-50 text-slate-600 ring-1 ring-slate-200" };
}

/** Returns the appModule id for a collection id, or null for core/unknown. */
export function appModuleForCollection(collectionId: string): string | null {
  if (collectionId === CORE_COLLECTION) return null;
  return COLLECTION_TO_APP_MODULE[collectionId] ?? null;
}

/** Human label for a collection id. Falls back to the raw id. */
export function labelForCollection(collectionId: string): string {
  if (collectionId === CORE_COLLECTION) return CORE_MODULE.label;
  return _byCollection.get(collectionId)?.label ?? collectionId;
}
