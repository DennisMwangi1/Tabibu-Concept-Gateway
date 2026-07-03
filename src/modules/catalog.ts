import {
  CONCEPT_MODULES,
  CORE_MODULE,
  type ConceptModule,
} from "../config/modules.js";

export interface ProvisionableModule {
  app_module: string;
  collection_id: string;
  label: string;
  description: string;
  chip_color: string;
}

export interface CoreCatalogEntry {
  collection_id: string;
  label: string;
  description: string;
  chip_color: string;
}

export interface ModuleCatalog {
  core: CoreCatalogEntry;
  modules: ProvisionableModule[];
}

/** Module catalog for the admin UI — derived from gateway config. */
export function getModuleCatalog(): ModuleCatalog {
  return {
    core: {
      collection_id: CORE_MODULE.collectionId,
      label: CORE_MODULE.label,
      description: CORE_MODULE.description,
      chip_color: CORE_MODULE.chipColor,
    },
    modules: CONCEPT_MODULES.map(toProvisionableModule),
  };
}

function toProvisionableModule(m: ConceptModule): ProvisionableModule {
  return {
    app_module: m.appModule,
    collection_id: m.collectionId,
    label: m.label,
    description: m.description,
    chip_color: m.chipColor,
  };
}
