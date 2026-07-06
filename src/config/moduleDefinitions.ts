/**
 * Concept module definitions — the single source of truth for the whole module
 * system. Both core and provisionable modules are declared here and validated
 * against their manifests by `packaging:validate`.
 *
 * Run `npm run packaging:validate` after any change to verify manifests are
 * complete and to sync the `collections` table automatically.
 */

/**
 * Always-included base module.
 */
export interface CoreModule {
  manifestModule: string;
  collectionId: string;
  label: string;
  description: string;
  chipColor: string;
}

export const CORE_MODULE: CoreModule = {
  manifestModule: "core",
  collectionId: "tabibu-core",
  label: "Core",
  description:
    "Vital signs, visit diagnoses, clinical assessment — always included",
  chipColor: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
};

export interface ConceptModule {
  /**
   * Matches the manifest filename without the .json extension
   * (e.g. "lab" → manifests/lab.json).
   */
  manifestModule: string;
  /**
   * Tabibu app module id (mirrors MODULE_REGISTRY key in Tabibu-Client).
   * Used to map hospital_app_modules rows → OCL collection subscriptions.
   */
  appModule: string;
  /** OCL collection id under the Tabibu org. */
  collectionId: string;
  /** Human label used in the admin UI and ops tooling. */
  label: string;
  /** Short description shown in the provisioning UI. */
  description: string;
  /** Tailwind classes for the module chip in the admin UI. */
  chipColor: string;
}

export const CONCEPT_MODULES: readonly ConceptModule[] = [
  {
    manifestModule: "lab",
    appModule: "laboratory",
    collectionId: "tabibu-lab",
    label: "Laboratory",
    description: "Lab tests, panels, orderable items",
    chipColor: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  },
  {
    manifestModule: "pharmacy",
    appModule: "pharmacy",
    collectionId: "tabibu-pharmacy",
    label: "Pharmacy",
    description: "Drug formulary — ARVs, antibiotics, vaccines",
    chipColor: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
  },
  {
    manifestModule: "maternity",
    appModule: "maternity",
    collectionId: "tabibu-maternity",
    label: "Maternity",
    description: "ANC, obstetric history, intrapartum, postnatal",
    chipColor: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  },
  {
    manifestModule: "imaging",
    appModule: "imaging",
    collectionId: "tabibu-imaging",
    label: "Imaging",
    description: "Radiology and imaging — modality types, procedure ordering",
    chipColor: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
  },
  {
    manifestModule: "oncology",
    appModule: "oncology",
    collectionId: "tabibu-oncology",
    label: "Oncology",
    description: "Cancer care — chemotherapy detail, tumour response assessment",
    chipColor: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  },
  {
    manifestModule: "rehabilitation",
    appModule: "rehabilitation",
    collectionId: "tabibu-rehabilitation",
    label: "Rehabilitation",
    description: "Physiotherapy and rehab — functional assessment, spirometry",
    chipColor: "bg-green-50 text-green-700 ring-1 ring-green-200",
  },
  {
    manifestModule: "mental-health",
    appModule: "mental-health",
    collectionId: "tabibu-mental-health",
    label: "Mental Health",
    description: "Psychiatry and counselling — session tracking, severity scales",
    chipColor: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  },
] as const;
